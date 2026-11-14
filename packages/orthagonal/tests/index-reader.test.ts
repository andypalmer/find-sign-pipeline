import { describe, expect, it } from 'vitest'
import { IndexReader, type LoadedVersion2Index } from '../src/index-reader.ts'
import { planPublishOrder, writeVersion2Index, writeVersion2Vectors, type PublishedFile } from '../src/write-version-2.ts'
import type { EncodedSearchData } from '../src/types.ts'

const BASE = 'https://data.test/index'

function sign (name: string, extra: object = {}) {
  return {
    title: name.toUpperCase(), words: [name, `${name}s`], tags: ['animal'], body: `About the ${name}.`,
    link: `https://alpha.test/${name}`, timestamp: 1000,
    media: [{ type: 'video', source: { method: 'fetch', url: 'https://source.test/x.mp4', version: '1' }, timestamp: 1, thumbnail: `${name}-media/${name}-0.webp`, encodes: [{ type: 'video/mp4', url: `${name}-media/${name}-0.mp4` }] }],
    ...extra
  }
}

const names = Array.from({ length: 60 }, (_, n) => `sign${n}`)
const signs = (extra: { [name: string]: object } = {}, list: string[] = names): EncodedSearchData =>
  Object.fromEntries(list.map(name => [name, sign(name, extra[name])])) as unknown as EncodedSearchData
const vectorFor = (word: string) => word.endsWith('s') ? [0.1, 0.9, 0.2, 0.3] : [0.5, 0.1, 0.2, 0.3]
const knownVectorWords = new Set<string>()
const lookupVector = async (word: string) => word.startsWith('sign') || knownVectorWords.has(word) ? vectorFor(word) : undefined

async function publish (data: EncodedSearchData, counts: { shardCount: number } = { shardCount: 8 }) {
  const alpha = await writeVersion2Index('alpha', data, { ...counts, scanCount: 2 })
  const vectors = await writeVersion2Vectors({ alpha: data }, { lookupVector, bucketCount: 4 })
  return planPublishOrder({ alpha }, vectors)
}

// a data server that holds whatever has been published to it, and remembers what it was asked for
class FakeDataServer {
  files = new Map<string, string | Uint8Array>()
  requests: { url: string, cache?: RequestCache }[] = []
  failWith: { [url: string]: number } = {}
  publishNow (files: PublishedFile[], { clearOld = false } = {}) {
    if (clearOld) this.files.clear()
    for (const file of files) this.files.set(`${BASE}/${file.name}`, file.contents)
  }
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    this.requests.push({ url, cache: init?.cache })
    if (this.failWith[url]) return new Response('nope', { status: this.failWith[url] })
    const contents = this.files.get(url)
    return contents === undefined ? new Response('not found', { status: 404 }) : new Response(contents as BodyInit)
  }
  asked (fileStart: string) { return this.requests.filter(request => request.url.startsWith(`${BASE}/${fileStart}`)) }
}

async function readerOver (data = signs()) {
  const server = new FakeDataServer()
  server.publishNow(await publish(data))
  const reader = new IndexReader(BASE, { fetch: server.fetch, mediaBaseURL: 'https://media.test/files' })
  return { server, reader }
}

function entryNamed (index: LoadedVersion2Index, id: string) {
  const entry = index.entries.find(entry => entry.id === id)
  expect(entry, `an entry called ${id}`).toBeDefined()
  return entry!
}

describe('IndexReader.loadIndex()', () => {
  it('gives an entry for every sign, with what a search looks at', async () => {
    const { reader } = await readerOver()
    const index = await reader.loadIndex('alpha')
    expect(index.entries).toHaveLength(names.length)
    expect(entryNamed(index, 'sign3')).toMatchObject({
      id: 'sign3', title: 'SIGN3', words: ['sign3', 'sign3s'], tags: ['animal'], link: 'https://alpha.test/sign3', timestamp: 1000, indexURL: BASE
    })
  })

  it('says which index each entry is in, because every index shares one address', async () => {
    const server = new FakeDataServer()
    const alpha = await writeVersion2Index('alpha', signs({}, names.slice(0, 20)))
    const beta = await writeVersion2Index('beta', signs({}, names.slice(20, 40)))
    const vectors = await writeVersion2Vectors({ alpha: signs({}, names.slice(0, 20)), beta: signs({}, names.slice(20, 40)) }, { lookupVector })
    server.publishNow(planPublishOrder({ alpha, beta }, vectors))
    const reader = new IndexReader(BASE, { fetch: server.fetch })
    const [a, b] = await Promise.all([reader.loadIndex('alpha'), reader.loadIndex('beta')])
    expect(a.entries.map(entry => entry.indexName)).toEqual(Array(20).fill('alpha'))
    expect(b.entries.map(entry => entry.indexName)).toEqual(Array(20).fill('beta'))
    expect(a.entries[0].indexURL).toBe(b.entries[0].indexURL)
  })

  it('fills in what a sign doesn\'t have, as version 1 did', async () => {
    const { reader } = await readerOver()
    const entry = entryNamed(await reader.loadIndex('alpha'), 'sign3')
    expect(entry).toMatchObject({ aliases: [], englishPhrases: [], author: {}, sourceCreated: 0, sourceUpdated: 0, vectors: [] })
  })

  it('asks for manifest.json, the index manifest and the scan files, but not the shards or vectors', async () => {
    const { reader, server } = await readerOver()
    await reader.loadIndex('alpha')
    expect(server.asked('manifest.json')).toHaveLength(1)
    expect(server.asked('index-alpha.')).toHaveLength(1)
    expect(server.asked('scan-')).toHaveLength(2)
    expect(server.asked('shard-')).toHaveLength(0)
    expect(server.asked('vectors-')).toHaveLength(0)
  })

  it('checks manifest.json the ordinary way, which the server\'s no-cache makes a check every time', async () => {
    const { reader, server } = await readerOver()
    await reader.loadIndex('alpha')
    expect(server.asked('manifest.json')).toHaveLength(1)
    expect(server.asked('manifest.json')[0].cache).not.toBe('no-store')
  })

  it('asks for manifest.json once when loading two indexes', async () => {
    const server = new FakeDataServer()
    const alpha = await writeVersion2Index('alpha', signs({}, names.slice(0, 20)))
    const beta = await writeVersion2Index('beta', signs({}, names.slice(20, 40)))
    const vectors = await writeVersion2Vectors({ alpha: signs({}, names.slice(0, 20)), beta: signs({}, names.slice(20, 40)) }, { lookupVector })
    server.publishNow(planPublishOrder({ alpha, beta }, vectors))
    const reader = new IndexReader(BASE, { fetch: server.fetch })
    await Promise.all([reader.loadIndex('alpha'), reader.loadIndex('beta')])
    expect(server.asked('manifest.json')).toHaveLength(1)
  })

  it('gives each entry the vectors of its words when asked, and fetches every vector bucket to do it', async () => {
    const { reader, server } = await readerOver()
    const entry = entryNamed(await reader.loadIndex('alpha', { withVectors: true }), 'sign3')
    expect(server.asked('vectors-')).toHaveLength(4)
    expect(entry.vectors).toHaveLength(2)
    expect(entry.vectors!.every(vector => vector instanceof Float32Array)).toBe(true)
    expect(Array.from(entry.vectors![0]!)).toEqual(expect.arrayContaining([expect.any(Number)]))
  })

  it('fetches each shared vector bucket once, however many indexes are loaded with vectors', async () => {
    const server = new FakeDataServer()
    const first = signs({}, names.slice(0, 20))
    const second = signs({}, names.slice(20, 40))
    const alpha = await writeVersion2Index('alpha', first)
    const beta = await writeVersion2Index('beta', second)
    const vectors = await writeVersion2Vectors({ alpha: first, beta: second }, { lookupVector, bucketCount: 4 })
    server.publishNow(planPublishOrder({ alpha, beta }, vectors))
    const reader = new IndexReader(BASE, { fetch: server.fetch })
    const [a, b] = await Promise.all([reader.loadIndex('alpha', { withVectors: true }), reader.loadIndex('beta', { withVectors: true })])
    expect(server.asked('vectors-')).toHaveLength(4)
    // each index's signs get vectors from the one shared set
    expect(entryNamed(a, 'sign3').vectors).toHaveLength(2)
    expect(entryNamed(b, 'sign25').vectors).toHaveLength(2)
  })

  it('says which index is unknown, and refuses a manifest of a version it doesn\'t know', async () => {
    const { reader, server } = await readerOver()
    await expect(reader.loadIndex('nope')).rejects.toThrow(/nope/)
    server.files.set(`${BASE}/manifest.json`, JSON.stringify({ version: 3, indexes: {} }))
    await expect(new IndexReader(BASE, { fetch: server.fetch }).loadIndex('alpha')).rejects.toThrow(/version/i)
  })

  it('says so when manifest.json is missing, without hunting for it', async () => {
    const server = new FakeDataServer()
    await expect(new IndexReader(BASE, { fetch: server.fetch }).loadIndex('alpha')).rejects.toThrow(/manifest\.json/)
    expect(server.asked('manifest.json')).toHaveLength(1)
  })
})

describe('entry.load()', () => {
  it('fetches only that sign\'s shard, and gives the whole sign', async () => {
    const { reader, server } = await readerOver()
    const index = await reader.loadIndex('alpha')
    const full = await entryNamed(index, 'sign3').load()
    expect(full).toMatchObject({ id: 'sign3', body: 'About the sign3.', title: 'SIGN3' })
    expect(server.asked('shard-')).toHaveLength(1)
  })

  it('makes media addresses full ones, from the media address we gave', async () => {
    const { reader } = await readerOver()
    const full = await entryNamed(await reader.loadIndex('alpha'), 'sign3').load()
    expect(full.media[0].thumbnail).toBe('https://media.test/files/sign3-media/sign3-0.webp')
    expect(full.media[0].encodes[0].url).toBe('https://media.test/files/sign3-media/sign3-0.mp4')
  })

  it('does not change the shard\'s own copy when it fixes the addresses', async () => {
    const { reader } = await readerOver()
    const entry = entryNamed(await reader.loadIndex('alpha'), 'sign3')
    expect((await entry.load()).media[0].thumbnail).toBe((await entry.load()).media[0].thumbnail)
  })
})

describe('when a kept file has gone', () => {
  async function loadedThenRebuilt (counts = { shardCount: 8 }) {
    const { reader, server } = await readerOver()
    const index = await reader.loadIndex('alpha')
    // a new build: sign7 has a new body, and the old files have been cleared away
    server.publishNow(await publish(signs({ sign7: { body: 'A new body.' } }), counts), { clearOld: true })
    server.requests.length = 0
    return { reader, server, index }
  }

  it('asks for manifest.json again, ignoring its cache, and gives the new version of the sign', async () => {
    const { server, index } = await loadedThenRebuilt()
    const full = await entryNamed(index, 'sign7').load()
    expect(full.body).toBe('A new body.')
    const manifestRequests = server.asked('manifest.json')
    expect(manifestRequests).toHaveLength(1)
    // (the first fetch of manifest.json was before the new build, and the log was cleared)
    expect(manifestRequests[0].cache).toBe('no-cache')
  })

  it('tries the missing file once, then the new one once, and no more', async () => {
    const { server, index } = await loadedThenRebuilt()
    await entryNamed(index, 'sign7').load()
    expect(server.asked('shard-')).toHaveLength(2)
  })

  it('finds a vector bucket again like any other kept file, when a new word has changed one', async () => {
    const { reader, server } = await readerOver()
    await reader.loadIndex('alpha') // holds the manifests, but has fetched no vectors yet
    knownVectorWords.add('brandnewword')
    try {
      server.publishNow(await publish(signs({ sign7: { words: ['sign7', 'brandnewword'] } })), { clearOld: true })
      server.requests.length = 0
      const index = await reader.loadIndex('alpha', { withVectors: true })
      expect(entryNamed(index, 'sign7').vectors).toHaveLength(2)
      expect(server.asked('manifest.json')).toHaveLength(1)
      expect(server.asked('manifest.json')[0].cache).toBe('no-cache')
    } finally {
      knownVectorWords.delete('brandnewword')
    }
  })

  it('still works when the new build has a different number of shards', async () => {
    const { index } = await loadedThenRebuilt({ shardCount: 13 })
    const full = await entryNamed(index, 'sign7').load()
    expect(full.body).toBe('A new body.')
    expect((await entryNamed(index, 'sign20').load()).id).toBe('sign20')
  })

  it('asks for manifest.json again only once when several files are missing at the same time', async () => {
    const { server, index } = await loadedThenRebuilt()
    const loaded = await Promise.all(names.slice(0, 12).map(name => entryNamed(index, name).load()))
    expect(loaded.map(entry => entry.id)).toEqual(names.slice(0, 12))
    expect(server.asked('manifest.json')).toHaveLength(1)
  })

  it('gives up, saying which file, when the file is still missing after asking again', async () => {
    const { server, index } = await loadedThenRebuilt()
    for (const url of [...server.files.keys()].filter(url => url.includes('/shard-'))) server.files.delete(url)
    await expect(entryNamed(index, 'sign7').load()).rejects.toThrow(/shard-/)
    expect(server.asked('manifest.json')).toHaveLength(1)
    expect(server.asked('shard-').length).toBeLessThanOrEqual(2)
  })

  it('says so when the sign is no longer in the index', async () => {
    const { reader, server } = await readerOver()
    const index = await reader.loadIndex('alpha')
    server.publishNow(await publish(signs({}, names.filter(name => name !== 'sign7'))), { clearOld: true })
    await expect(entryNamed(index, 'sign7').load()).rejects.toThrow(/sign7/)
  })

  it('does not ask again for any other failure, such as a server error', async () => {
    const { reader, server } = await readerOver()
    const index = await reader.loadIndex('alpha')
    server.requests.length = 0
    for (const url of [...server.files.keys()].filter(url => url.includes('/shard-'))) server.failWith[url] = 500
    await expect(entryNamed(index, 'sign7').load()).rejects.toThrow(/500/)
    expect(server.asked('manifest.json')).toHaveLength(0)
    expect(server.asked('shard-')).toHaveLength(1)
  })
})
