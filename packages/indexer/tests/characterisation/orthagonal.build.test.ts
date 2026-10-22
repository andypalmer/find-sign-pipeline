// Characterisation tests for buildSearchIndex(): the pipeline from encoded-search-data + overrides
// to a published orthagonal index and the shared global-vectors.lps file.
import { DataBase, EncodedSearchDataBase, IndexBase, VectorLibraryBase, testSettings, writeKeyPair } from '@andypalmer/test-helpers/settings.ts'
import { expect, describe, it, beforeEach } from 'vitest'
import { FakeDataServer } from '@andypalmer/test-helpers/fake-data-server.ts'
import { alphaSearchData as publishedAlpha, publishSearchData, publishVectorLibrary } from '@andypalmer/test-helpers/fixtures.ts'
import { buildSearchIndex as build } from '../../src/build.ts'

const buildSearchIndex = (provider: string, options: Parameters<typeof build>[2]) => build(provider, testSettings(), options)
import { parse as parseVectors } from '@andypalmer/vectors'
import { decodeHex, sign_open } from 'tweetnacl-ts'
import { parseRecordFile, serialiseRecordFile } from '@andypalmer/records'
import { rebaseRecordFile } from '../../src/records.ts'
import relativeURL from '../../src/relative-url.ts'

let server: FakeDataServer
const quiet = { log: () => {}, progress: () => {} }

beforeEach(async () => {
  server = new FakeDataServer().install()
  await publishVectorLibrary(server)
  publishSearchData(server)
})

function vectorWords (url: string) {
  return [...parseVectors(server.get(url)!)].map(x => x.word).sort()
}

describe('buildSearchIndex()', () => {
  it('writes the whole index in one signed bulk POST to the data server', async () => {
    await buildSearchIndex('alpha', quiet)
    const bulk = server.requests.filter(r => r.method === 'POST')
    expect(bulk).toHaveLength(1)
    expect(bulk[0].path).toBe(`${IndexBase}/alpha`)
    expect(bulk[0].body.type).toBe('bulk')
    expect(Object.keys(bulk[0].body.files).sort()).toEqual([
      'aliases.json', 'author.json', 'englishPhrases.json', 'id.json', 'link.json', 'meta.json', 'shard-0.json',
      'sourceCreated.json', 'sourceUpdated.json', 'tags.json', 'timestamp.json', 'title.json', 'vectors.lps', 'words.json',
    ])
    expect(bulk[0].body.files['vectors.lps'].encoding).toBe('base64')
    expect(bulk[0].body.files['meta.json'].encoding).toBe('string')

    // every data server request carries a license signed by the write identity
    const license = new URL(bulk[0].url).searchParams.get('license') as string
    const [scheme, publicKey, signature] = license.split('-')
    expect(scheme).toBe('ed25519')
    expect(decodeHex(publicKey)).toEqual(writeKeyPair.publicKey)
    expect(sign_open(decodeHex(signature), writeKeyPair.publicKey)).not.toBeNull()
  })

  it('drops published:false entries', async () => {
    await buildSearchIndex('alpha', quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/meta.json`).entries).toBe(3)
  })

  it('shallow-merges overrides for this provider, ignoring other providers and unknown ids', async () => {
    server.set(`${DataBase}overrides/alpha:cat.json`, { title: 'Overridden Cat', tags: ['override'] })
    server.set(`${DataBase}overrides/alpha:missing.json`, { title: 'Nope' })
    server.set(`${DataBase}overrides/beta:kitten.json`, { title: 'Wrong provider' })
    server.set(`${DataBase}overrides/alpha:hidden.json`, { published: true })
    await buildSearchIndex('alpha', quiet)
    const titles = server.getJSON(`${IndexBase}/alpha/title.json`).entries
    expect(titles).toEqual(['Overridden Cat', 'Dog', 'Car'])
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries[0]).toEqual(['override'])
    // unpublished entries are removed BEFORE overrides apply, so an override cannot republish them
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).not.toContain('hidden')
  })

  it('stores media urls relative to the index folder, leaving other origins and links absolute', async () => {
    const data = publishedAlpha()
    data.dog.media[0].thumbnail = 'https://cdn.test/dog.webp'
    publishSearchData(server, { alpha: data } as any)
    await buildSearchIndex('alpha', quiet)
    const [cat, dog] = server.getJSON(`${IndexBase}/alpha/shard-0.json`).entries
    expect(cat.media[0].thumbnail).toBe('../../../../encoded-search-data/raw/cat-media/cat-0.webp')
    expect(cat.media[0].encodes.map((x: any) => x.url)).toEqual([
      '../../../../encoded-search-data/raw/cat-media/cat-0.mp4',
      '../../../../encoded-search-data/raw/cat-media/cat-0.webm',
    ])
    expect(dog.media[0].thumbnail).toBe('https://cdn.test/dog.webp')
    expect(cat.link).toBe('https://alpha.test/cat')
    expect(cat.media[0].source.url).toBe('https://source.test/cat.mp4')
  })

  it('rebuilds global-vectors.lps from every configured index, tolerating indexes that do not exist yet', async () => {
    await buildSearchIndex('alpha', quiet)
    expect(vectorWords(`${IndexBase}/global-vectors.lps`)).toEqual(['car', 'cat', 'dog'])
    await buildSearchIndex('beta', quiet)
    expect(vectorWords(`${IndexBase}/global-vectors.lps`)).toEqual(['car', 'cat', 'dog', 'kitten', 'red', 'truck'])
  })

  // each testSettings() opens the vector library afresh, so these see real library traffic
  it('looks every word up in the vector library on a normal build: one shard per word', async () => {
    await buildSearchIndex('alpha', quiet)
    const library = server.requestsTo(VectorLibraryBase).map(r => r.path.split('/').pop() as string)
    // the library is opened once, however many lookups start before it has opened
    expect(library.filter(x => x === 'info.json')).toHaveLength(1)
    expect(library.filter(x => x.endsWith('.lps'))).toHaveLength(3) // cat, dog, car
  })

  it('fast mode reuses the previous build vector cache instead of the vector library', async () => {
    await buildSearchIndex('alpha', quiet)
    server.resetRequests()
    await buildSearchIndex('alpha', { ...quiet, fast: true })
    expect(server.requestsTo(VectorLibraryBase)).toHaveLength(0)
    // read twice: once as the fast-build cache, once again while rebuilding global-vectors.lps
    expect(server.requestsTo(`${IndexBase}/alpha/vectors.lps`).filter(r => r.method === 'GET')).toHaveLength(2)
    expect(vectorWords(`${IndexBase}/alpha/vectors.lps`)).toEqual(['car', 'cat', 'dog'])
  })

  it('keeps a record file per provider, with urls relative to it', async () => {
    await buildSearchIndex('alpha', quiet)
    const file = parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!)
    expect(file.provider.id).toBe('alpha')
    // unpublished entries are kept in the records, so their ids stay reserved
    expect(file.records.map(r => r.id)).toEqual(['car', 'cat', 'dog', 'hidden'])
    const cat = file.records.find(r => r.id === 'cat')!
    expect(cat.media[0].source.url).toBe('https://source.test/cat.mp4')
    const thumbnail = cat.media[0].encoded!.thumbnail!
    expect(thumbnail).toMatch(/^\.\.\//)
    expect(new URL(thumbnail, `${DataBase}records/alpha.records.json`).toString()).toBe('http://data.test/collections/encoded-search-data/raw/cat-media/cat-0.webp')
  })

  it('indexes readable ids, with old keys as aliases and kept as sourceId', async () => {
    const data = publishedAlpha() as any
    data['B8p5qc9noP5'] = { ...data.dog, title: 'Hello there, greeting', words: ['hello'] }
    publishSearchData(server, { alpha: data })
    await buildSearchIndex('alpha', quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car', 'hello-there'])
    expect(server.getJSON(`${IndexBase}/alpha/aliases.json`).entries).toEqual([null, null, null, ['B8p5qc9noP5']])
    const shard = server.getJSON(`${IndexBase}/alpha/shard-0.json`)
    expect(shard.entries[3]).toMatchObject({ id: 'hello-there', sourceId: 'B8p5qc9noP5', aliases: ['B8p5qc9noP5'] })
  })

  it('starts a first build from the records a spider keeps beside its search data, keeping its ids and aliases', async () => {
    // the records a spider would have written: as a build makes them, but kept beside the search data, with
    // cat given another id and an old permalink
    await buildSearchIndex('alpha', quiet)
    const built = parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!)
    const recordsURL = `${DataBase}records/alpha.records.json`
    const spiderURL = `${EncodedSearchDataBase}/alpha.records.json`
    const spider = await rebaseRecordFile(built, url => relativeURL(spiderURL, new URL(url, recordsURL).toString()))
    spider.records = spider.records.map(r => r.sourceId === 'cat' ? { ...r, id: 'moggy', aliases: ['c1'] } : r)

    server = new FakeDataServer().install()
    await publishVectorLibrary(server)
    publishSearchData(server)
    server.set(spiderURL, serialiseRecordFile(spider))
    const logs: string[] = []
    await buildSearchIndex('alpha', { ...quiet, log: (...x) => logs.push(x.join(' ')) })
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['moggy', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/aliases.json`).entries).toEqual([['c1'], null, null])
    // the same signs, so nothing changed, and urls work from where the build keeps records
    expect(logs).toContain('Records: 4 unchanged')
    const cat = parseRecordFile(server.getText(recordsURL)!).records.find(r => r.id === 'moggy')!
    expect(new URL(cat.media[0].encoded!.thumbnail!, recordsURL).toString()).toBe('http://data.test/collections/encoded-search-data/raw/cat-media/cat-0.webp')
  })

  it('indexes signs with identical videos as one, the other\'s address leading to it, unless told not to', async () => {
    const data = publishedAlpha() as any
    const same = 'a'.repeat(64)
    data.cat.media[0].sourceSha256 = same
    data.kitty = { ...data.cat, title: 'Kitty', words: ['kitty'], tags: ['pet'], timestamp: 5000, media: [{ ...data.cat.media[0] }] }
    publishSearchData(server, { alpha: data })
    await buildSearchIndex('alpha', quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car'])
    const shard = server.getJSON(`${IndexBase}/alpha/shard-0.json`)
    expect(shard.entries[0]).toMatchObject({ id: 'cat', aliases: ['kitty'] })
    expect(shard.entries[0].words).toContain('kitty')
    expect(shard.entries[0].media[0].sourceSha256).toBeUndefined()
    // both stay in the records
    expect(parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!).records.map(r => r.id)).toContain('kitty')

    await build('alpha', { ...testSettings(), mergeIdenticalMedia: false }, quiet)
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car', 'kitty'])
  })

  it('indexes tags in Find Sign\'s vocabulary, by the provider\'s mapping, keeping the provider\'s in the records', async () => {
    const tagMappings = new Map([['alpha', { provider: 'alpha', namespace: 'al', own: [], usesVocabulary: true, rules: { animal: ['semantic.animal'] } }]])
    await build('alpha', { ...testSettings(), tagMappings }, quiet)
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries).toEqual([
      ['al.animal', 'semantic.animal'], ['al.animal', 'semantic.animal'], ['al.vehicle', 'lexis.crude'],
    ])
    expect(parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!).records.find(r => r.id === 'car')!.tags).toEqual(['vehicle', 'lexis.crude'])
  })

  it('indexes the tags of a provider without a mapping as they are, saying so', async () => {
    const logs: string[] = []
    await buildSearchIndex('alpha', { ...quiet, log: (...x) => logs.push(x.join(' ')) })
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries.at(-1)).toEqual(['vehicle', 'lexis.crude'])
    expect(logs).toContain('No tag mapping for alpha: its tags are indexed as they are')
  })

  it('applies the provider\'s tag claims, saying which it couldn\'t use', async () => {
    const at = '2026-10-22T00:00:00.000Z'
    server.set(`${DataBase}claims/alpha.json`, { format: 'find-sign-claims', version: 1, provider: 'alpha', claims: [
      { sourceId: 'cat', tag: 'semantic.animal', claim: 'add', by: 'curator:andy', at },
      { sourceId: 'car', tag: 'lexis.crude', claim: 'remove', by: 'curator:andy', at, why: 'not rude' },
      { sourceId: 'dog', tag: 'pet', claim: 'add', by: 'curator:andy', at },
      { sourceId: 'gone', tag: 'lexis.crude', claim: 'add', by: 'curator:andy', at },
    ] })
    const logs: string[] = []
    await buildSearchIndex('alpha', { ...quiet, log: (...x) => logs.push(x.join(' ')) })
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries).toEqual([['animal', 'semantic.animal'], ['animal'], ['vehicle']])
    expect(logs).toContain(`  claim left out ("pet" isn't in the vocabulary): {"sourceId":"dog","tag":"pet","claim":"add","by":"curator:andy","at":"${at}"}`)
    expect(logs).toContain('  1 claimed signs aren\'t in this index: gone')
    expect(logs).toContain('Claims: applied to 2 signs')
    // the records keep the provider's tags
    expect(parseRecordFile(server.getText(`${DataBase}records/alpha.records.json`)!).records.find(r => r.id === 'car')!.tags).toEqual(['vehicle', 'lexis.crude'])
  })

  it('keeps a tag a claim took from one of the signs off the sign they\'re merged into', async () => {
    const data = publishedAlpha() as any
    data.car.media[0].sourceSha256 = 'b'.repeat(64)
    data.van = { ...data.car, title: 'Van', words: ['van'], timestamp: 5000, media: [{ ...data.car.media[0] }] }
    publishSearchData(server, { alpha: data })
    server.set(`${DataBase}claims/alpha.json`, { format: 'find-sign-claims', version: 1, provider: 'alpha', claims: [
      { sourceId: 'van', tag: 'lexis.crude', claim: 'remove', by: 'curator:andy', at: '2026-10-22T00:00:00.000Z' },
    ] })
    await buildSearchIndex('alpha', quiet)
    const ids = server.getJSON(`${IndexBase}/alpha/id.json`).entries
    expect(ids).toEqual(['cat', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/tags.json`).entries.at(-1)).toEqual(['vehicle'])
  })

  it('removes shards left from a larger build', async () => {
    server.set(`${IndexBase}/alpha/shard-7.json`, { entries: [] })
    await buildSearchIndex('alpha', quiet)
    expect(server.get(`${IndexBase}/alpha/shard-7.json`)).toBeUndefined()
    expect(server.get(`${IndexBase}/alpha/shard-0.json`)).toBeDefined()
  })

  it('keeps each sign\'s id on later builds, even when its title changes', async () => {
    await buildSearchIndex('alpha', quiet)
    server.set(`${DataBase}overrides/alpha:cat.json`, { title: 'Kitty' })
    const logs: string[] = []
    await buildSearchIndex('alpha', { ...quiet, log: (...x) => logs.push(x.join(' ')) })
    expect(server.getJSON(`${IndexBase}/alpha/id.json`).entries).toEqual(['cat', 'dog', 'car'])
    expect(server.getJSON(`${IndexBase}/alpha/title.json`).entries[0]).toBe('Kitty')
    expect(logs).toContain('Records: 1 changed, 3 unchanged')
  })

  it('reports progress ending at 1 and logs "Build complete"', async () => {
    const logs: string[] = []
    const progress: number[] = []
    await buildSearchIndex('alpha', { log: (...x) => logs.push(x.join(' ')), progress: (n) => progress.push(n) })
    expect(logs[0]).toBe('Reading search data alpha...')
    expect(logs.at(-1)).toBe('Build complete')
    expect(progress.at(-1)).toBe(1)
  })
})
