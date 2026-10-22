// Characterisation tests for the orthagonal index reader, run against indexes produced by the real build.
import { expect, describe, it, beforeEach } from 'vitest'
import { FakeDataServer } from '@andypalmer/test-helpers/fake-data-server.ts'
import { publishBuiltIndexes, wordVectors } from '@andypalmer/test-helpers/fixtures.ts'
import { IndexBase } from '@andypalmer/test-helpers/settings.ts'
import { loadIndex, loadEntry, OutdatedError } from '@andypalmer/orthagonal'
import { openGlobalVectors } from '@andypalmer/vectors'

let server: FakeDataServer

beforeEach(async () => {
  server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

describe('loadIndex()', () => {
  it('loads meta plus only the requested columns', async () => {
    const index = await loadIndex(`${IndexBase}/alpha`, ['id', 'title'])
    expect(index.url).toBe(`${IndexBase}/alpha`)
    expect(index.meta.entries).toBe(3)
    expect(index.entries.map(e => [e.id, e.title])).toEqual([['cat', 'Cat'], ['dog', 'Dog'], ['car', 'Car']])
    expect(index.entries[0]).not.toHaveProperty('tags')
    expect(server.requests.map(r => r.path.split('/').pop()).sort()).toEqual(['id.json', 'meta.json', 'title.json'])
  })

  it('always revalidates meta.json but lets columns use the http cache unless forceReload', async () => {
    await loadIndex(`${IndexBase}/alpha`, ['id'])
    const cacheModes = () => Object.fromEntries(server.requests.map(r => [r.path.split('/').pop(), r.cache]))
    expect(cacheModes()).toEqual({ 'meta.json': 'no-cache', 'id.json': 'default' })
    server.resetRequests()
    await loadIndex(`${IndexBase}/alpha`, ['id'], true)
    expect(cacheModes()).toEqual({ 'meta.json': 'no-cache', 'id.json': 'no-cache' })
  })

  it('replaces null column values with an empty value of the column type', async () => {
    const index = await loadIndex(`${IndexBase}/alpha`, ['author', 'link'])
    expect(index.entries.map(e => e.author)).toEqual([{}, {}, { id: 'phoenix', name: 'Phoenix', link: 'https://alpha.test/phoenix' }])
    const beta = await loadIndex(`${IndexBase}/beta`, ['timestamp'])
    expect(beta.entries.map(e => e.timestamp)).toEqual([4000, 0])
  })

  it('attaches word vectors from vectors.lps, falling back to the lowercased word', async () => {
    const index = await loadIndex(`${IndexBase}/beta`, ['words', 'vectors'])
    expect(server.requestsTo('beta/vectors.lps')).toHaveLength(1)
    const [kitten, redTruck] = index.entries
    expect(kitten.words).toEqual(['Kitten'])
    expect(kitten.vectors).toHaveLength(1)
    expect(Array.from(kitten.vectors![0] as Float32Array, x => Math.round(x * 10) / 10)).toEqual(wordVectors.kitten)
    expect(redTruck.vectors).toHaveLength(2)
  })

  it('uses supplied global vectors instead of fetching vectors.lps', async () => {
    const globalVectors = await openGlobalVectors(`${IndexBase}/global-vectors.lps`)
    server.resetRequests()
    const index = await loadIndex(`${IndexBase}/beta`, ['words', 'vectors'], false, globalVectors)
    expect(server.requestsTo('vectors.lps')).toHaveLength(0)
    expect(index.entries[0].vectors).toHaveLength(1)
  })

  it('only attaches vectors when the vector-indexed column was requested', async () => {
    const index = await loadIndex(`${IndexBase}/beta`, ['vectors'])
    expect(index.entries[0].vectors).toEqual([])
  })

  it('retries once with forceReload when a column buildID does not match meta, then throws OutdatedError', async () => {
    const url = `${IndexBase}/alpha/id.json`
    server.set(url, { ...server.getJSON(url), buildID: 'stale' })
    await expect(loadIndex(`${IndexBase}/alpha`, ['id'])).rejects.toBeInstanceOf(OutdatedError)
    expect(server.requestsTo('alpha/id.json').map(r => r.cache)).toEqual(['default', 'no-cache'])
  })
})

describe('loadEntry() / entry.load()', () => {
  it('fetches the full entry from the right shard without using the http cache', async () => {
    const index = await loadIndex(`${IndexBase}/alpha`, ['id'])
    server.resetRequests()
    const car = await index.entries[2].load()
    expect(car).toMatchObject({ id: 'car', published: true, title: 'Car', body: '', author: { id: 'phoenix' } })
    expect(car.media[0].encodes[0].url).toBe('http://data.test/collections/encoded-search-data/raw/car-media/car-0.mp4')
    expect(server.requests.map(r => [r.path.split('/').pop(), r.cache])).toEqual([['shard-0.json', 'no-store']])
  })

  it('resolves media urls against the host the index was loaded from', async () => {
    // copy the whole data tree to another host, as if served by a different machine
    for (const [url, data] of [...server.files]) {
      server.files.set(url.replace('http://data.test/', 'http://mirror.test/'), data)
    }
    const index = await loadIndex('http://mirror.test/collections/find-sign/raw/index/alpha', ['id'])
    const cat = await index.entries[0].load()
    expect(cat.media[0].thumbnail).toBe('http://mirror.test/collections/encoded-search-data/raw/cat-media/cat-0.webp')
    expect(cat.media[0].encodes[0].url).toBe('http://mirror.test/collections/encoded-search-data/raw/cat-media/cat-0.mp4')
  })

  it('passes through absolute media urls from indexes built before urls were relative', async () => {
    const url = `${IndexBase}/alpha/shard-0.json`
    const shard = server.getJSON(url)
    shard.entries[0].media[0].thumbnail = 'https://data.auslan.fyi/collections/encoded-search-data/raw/cat-media/cat-0.webp'
    server.set(url, shard)
    const index = await loadIndex(`${IndexBase}/alpha`, ['id'])
    const cat = await index.entries[0].load()
    expect(cat.media[0].thumbnail).toBe('https://data.auslan.fyi/collections/encoded-search-data/raw/cat-media/cat-0.webp')
  })

  it('throws OutdatedError when the shard is from a different build', async () => {
    const index = await loadIndex(`${IndexBase}/alpha`, ['id'])
    const url = `${IndexBase}/alpha/shard-0.json`
    server.set(url, { ...server.getJSON(url), buildID: 'newer' })
    await expect(loadEntry(index, 0)).rejects.toBeInstanceOf(OutdatedError)
  })
})
