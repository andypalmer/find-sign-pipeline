import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { folderStore, type DataStore, type FileData } from '@andypalmer/data-store'
import { planPublishTiers, writeVersion2Index, writeVersion2Vectors, type EncodedSearchData, type PublishTiers } from '@andypalmer/orthagonal'
import { parse as parseVectors } from '@andypalmer/vectors'
import { Version2Publisher } from '../src/version-2-publisher.ts'

const FOLDER = 'index'

// a store in memory that remembers every write, in order
class RecordingStore implements DataStore {
  files = new Map<string, Uint8Array>()
  log: { kind: 'write' | 'writeMany', names: string[], bytes: number }[] = []
  private failOnRequest?: number
  private requests = 0

  /** the nth write request from now on throws, counting the next one as 1 */
  failInRequests (n: number) { this.failOnRequest = this.requests + n }

  private bytesOf (data: FileData) { return typeof data === 'string' ? new TextEncoder().encode(data) : data }
  private countRequest () { if (++this.requests === this.failOnRequest) throw new Error('the data server fell over') }

  async read (path: string) { return this.files.get(path) }
  async write (path: string, data: FileData) {
    this.countRequest()
    this.files.set(path, this.bytesOf(data))
    this.log.push({ kind: 'write', names: [path.split('/').pop()!], bytes: this.bytesOf(data).length })
  }
  async writeMany (folder: string, files: Record<string, FileData>) {
    this.countRequest()
    for (const [name, data] of Object.entries(files)) this.files.set(`${folder}/${name}`, this.bytesOf(data))
    this.log.push({ kind: 'writeMany', names: Object.keys(files), bytes: Object.values(files).reduce((sum: number, data) => sum + this.bytesOf(data).length, 0) })
  }
  async list (folder: string) {
    const inside = [...this.files.keys()].filter(path => path.startsWith(`${folder}/`)).map(path => path.slice(folder.length + 1).split('/')[0])
    return [...new Set(inside)]
  }
  async delete (path: string) { this.files.delete(path) }
  names () { return this.log.flatMap(request => request.names) }
}

function sign (name: string, extra: object = {}) {
  return { title: name.toUpperCase(), words: [name, `${name}s`], tags: ['animal'], body: `About the ${name}.`, link: `https://alpha.test/${name}`, timestamp: 1000, media: [], ...extra }
}
const names = Array.from({ length: 60 }, (_, n) => `sign${n}`)
const signs = (list: string[] = names, extra: { [name: string]: object } = {}) =>
  Object.fromEntries(list.map(name => [name, sign(name, extra[name])])) as unknown as EncodedSearchData
const lookupVector = async (word: string) => word.startsWith('sign') ? [0.5, 0.1, 0.2, 0.3] : undefined

async function build (collection: { [indexName: string]: EncodedSearchData }, last?: Awaited<ReturnType<Version2Publisher['lastBuild']>>): Promise<PublishTiers> {
  const written = Object.fromEntries(await Promise.all(Object.entries(collection).map(async ([name, data]) =>
    [name, await writeVersion2Index(name, data, { shardCount: 4, scanCount: 1, previous: last?.indexManifests[name] })] as const)))
  const vectors = await writeVersion2Vectors(collection, { lookupVector, bucketCount: 4, previous: last?.top, keepVectors: last?.words })
  return planPublishTiers(written, vectors)
}
const allFiles = (tiers: PublishTiers) => [...tiers.contentFiles, ...tiers.indexManifests, tiers.topManifest]
const contentsOf = (store: RecordingStore, name: string) => new TextDecoder().decode(store.files.get(`${FOLDER}/${name}`))

describe('Version2Publisher.lastBuild()', () => {
  it('says there was no version 2 build when manifest.json isn\'t there', async () => {
    const last = await new Version2Publisher(new RecordingStore(), FOLDER).lastBuild()
    expect(last).toEqual({ indexManifests: {}, words: {} })
  })

  it('gives back the manifests, and every word of the shared vectors, of what was published', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    const tiers = await build({ alpha: signs(names.slice(0, 30)), beta: signs(names.slice(30)) })
    await publisher.publish(tiers)

    const last = await publisher.lastBuild()
    expect(last.top).toEqual(JSON.parse(tiers.topManifest.contents as string))
    expect(Object.keys(last.indexManifests).sort()).toEqual(['alpha', 'beta'])
    expect(last.indexManifests.alpha.shardCount).toBe(4)
    const expectedWords = tiers.contentFiles.filter(file => file.name.endsWith('.lps')).flatMap(file => [...parseVectors(file.contents as Uint8Array)].map(entry => entry.word))
    expect(Object.keys(last.words).sort()).toEqual(expectedWords.sort())
    expect(expectedWords.length).toBeGreaterThan(0)
  })

  it('gives words that pack to the very same buckets, so keeping them changes nothing', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    const first = await build({ alpha: signs() })
    await publisher.publish(first)
    const second = await build({ alpha: signs() }, await publisher.lastBuild())
    expect(second.topManifest.contents).toBe(first.topManifest.contents)
  })

  it('refuses a manifest.json that isn\'t JSON, or is a version we don\'t know, rather than starting again over it', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    store.files.set(`${FOLDER}/manifest.json`, new TextEncoder().encode('not json at all'))
    await expect(publisher.lastBuild()).rejects.toThrow(/manifest\.json/)
    store.files.set(`${FOLDER}/manifest.json`, new TextEncoder().encode(JSON.stringify({ version: 3, indexes: {}, vectors: [] })))
    await expect(publisher.lastBuild()).rejects.toThrow(/version/i)
  })

  it('refuses a manifest.json that names a file the store doesn\'t have, saying which', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    const tiers = await build({ alpha: signs() })
    await publisher.publish(tiers)

    const bucket = tiers.contentFiles.find(file => file.name.endsWith('.lps'))!.name
    store.files.delete(`${FOLDER}/${bucket}`)
    await expect(publisher.lastBuild()).rejects.toThrow(bucket)

    store.files.set(`${FOLDER}/${bucket}`, tiers.contentFiles.find(file => file.name === bucket)!.contents as Uint8Array)
    store.files.delete(`${FOLDER}/${tiers.indexManifests[0].name}`)
    await expect(publisher.lastBuild()).rejects.toThrow(tiers.indexManifests[0].name)
  })
})

describe('Version2Publisher.publish()', () => {
  it('puts every file of the build in the store, with the contents it was given', async () => {
    const store = new RecordingStore()
    const tiers = await build({ alpha: signs() })
    await new Version2Publisher(store, FOLDER).publish(tiers)
    for (const file of allFiles(tiers)) {
      expect(store.files.get(`${FOLDER}/${file.name}`), file.name).toEqual(typeof file.contents === 'string' ? new TextEncoder().encode(file.contents) : file.contents)
    }
  })

  it('writes every content file before any index manifest, and every index manifest before manifest.json, which goes last', async () => {
    const store = new RecordingStore()
    const tiers = await build({ alpha: signs(names.slice(0, 30)), beta: signs(names.slice(30)) })
    await new Version2Publisher(store, FOLDER).publish(tiers)

    const order = store.names()
    const position = (name: string) => order.indexOf(name)
    const lastContent = Math.max(...tiers.contentFiles.map(file => position(file.name)))
    const firstManifest = Math.min(...tiers.indexManifests.map(file => position(file.name)))
    const lastManifest = Math.max(...tiers.indexManifests.map(file => position(file.name)))
    expect(lastContent).toBeGreaterThan(-1)
    expect(lastContent).toBeLessThan(firstManifest)
    expect(lastManifest).toBeLessThan(position('manifest.json'))
    expect(order.at(-1)).toBe('manifest.json')
  })

  it('never puts files of two tiers in the same request, because the server may write a request\'s files in any order', async () => {
    const store = new RecordingStore()
    const tiers = await build({ alpha: signs() })
    await new Version2Publisher(store, FOLDER).publish(tiers)
    const tierOf = (name: string) => tiers.contentFiles.some(file => file.name === name) ? 'content' : tiers.indexManifests.some(file => file.name === name) ? 'index' : 'top'
    for (const request of store.log) expect(new Set(request.names.map(tierOf)).size).toBe(1)
  })

  it('keeps each request under the size limit, unless one file alone is bigger', async () => {
    const store = new RecordingStore()
    const tiers = await build({ alpha: signs() })
    await new Version2Publisher(store, FOLDER, { maxRequestBytes: 2000 }).publish(tiers)
    const sizes = new Map(allFiles(tiers).map(file => [file.name, typeof file.contents === 'string' ? new TextEncoder().encode(file.contents).length : file.contents.length]))
    expect(store.log.filter(request => request.kind === 'writeMany').length).toBeGreaterThan(1)
    for (const request of store.log) {
      if (request.names.length > 1) expect(request.bytes).toBeLessThanOrEqual(2000)
      else expect(request.bytes).toBe(sizes.get(request.names[0]))
    }
    expect([...store.names()].sort()).toEqual(allFiles(tiers).map(file => file.name).sort())
  })

  it('leaves out files that are already in the store, since a name that is there means the same bytes', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    const first = await build({ alpha: signs() })
    expect(await publisher.publish(first)).toEqual({ written: allFiles(first).length, alreadyThere: 0 })
    store.log.length = 0

    expect(await publisher.publish(first)).toEqual({ written: 0, alreadyThere: allFiles(first).length })
    expect(store.log).toEqual([])
  })

  it('writes only what is new when one sign changes: its shard, its index manifest, and manifest.json', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER)
    await publisher.publish(await build({ alpha: signs() }))
    store.log.length = 0

    const second = await build({ alpha: signs(names, { sign7: { body: 'A new body.' } }) }, await publisher.lastBuild())
    const report = await publisher.publish(second)
    // a body is in the shard only, so the scan files and the vectors keep their names
    expect(report.written).toBe(3)
    expect(store.names().map(name => name.split('-')[0].split('.')[0]).sort()).toEqual(['index', 'manifest', 'shard'])
    expect(store.names().at(-1)).toBe('manifest.json')
  })

  it('refuses a plan that isn\'t safe, before writing anything', async () => {
    const tiers = await build({ alpha: signs() })
    const unsafe: PublishTiers[] = [
      { ...tiers, contentFiles: [...tiers.contentFiles, { name: 'manifest.json', contents: '{}' }] },
      { ...tiers, contentFiles: [...tiers.contentFiles, { name: 'notes.txt', contents: 'x' }] },
      { ...tiers, indexManifests: [{ name: 'index-alpha.json', contents: '{}' }] },
      { ...tiers, topManifest: { name: 'shard-0.1234567890.json', contents: '{}' } }
    ]
    for (const plan of unsafe) {
      const store = new RecordingStore()
      await expect(new Version2Publisher(store, FOLDER).publish(plan)).rejects.toThrow()
      expect(store.log).toEqual([])
    }
  })

  it('never reaches manifest.json when a write fails partway, so visitors keep the old, complete build', async () => {
    const store = new RecordingStore()
    const publisher = new Version2Publisher(store, FOLDER, { maxRequestBytes: 2000 })
    const before = await build({ alpha: signs() })
    await publisher.publish(before)
    const oldManifest = contentsOf(store, 'manifest.json')

    store.failInRequests(3) // part way through the new content files
    const after = await build({ alpha: signs(names, { sign7: { body: 'A new body.' }, sign8: { body: 'Another.' }, sign9: { body: 'And another.' } }) }, await publisher.lastBuild())
    await expect(publisher.publish(after)).rejects.toThrow(/fell over/)
    expect(contentsOf(store, 'manifest.json')).toBe(oldManifest)
  })

  it('works on a folder on disk too, and reads back what it wrote', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'find-sign-v2-'))
    const publisher = new Version2Publisher(folderStore(root), FOLDER)
    const tiers = await build({ alpha: signs(names.slice(0, 30)), beta: signs(names.slice(30)) })
    await publisher.publish(tiers)

    expect((await readdir(path.join(root, FOLDER))).sort()).toEqual(allFiles(tiers).map(file => file.name).sort())
    expect(await readFile(path.join(root, FOLDER, 'manifest.json'), 'utf8')).toBe(tiers.topManifest.contents)
    expect(Object.keys((await publisher.lastBuild()).indexManifests).sort()).toEqual(['alpha', 'beta'])
  })
})
