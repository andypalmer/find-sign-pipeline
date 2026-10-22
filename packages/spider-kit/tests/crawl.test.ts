import { expect, describe, it } from 'vitest'
import { reconcile, type RecordContent, type SignRecord } from '@andypalmer/records'
import { crawl, encodeMissing, encodedSearchData, hashMissing, seedsFromEntries, sha256 } from '../src/index.ts'

const sign = (sourceId: string, url = `${sourceId}.mp4`): RecordContent => ({
  sourceId, title: sourceId, words: [sourceId], tags: [], media: [{ type: 'video', source: { url } }],
})
const at = '2026-10-21T00:00:00.000Z'
const records = async (...signs: RecordContent[]) => (await reconcile([], signs, { at })).records

type Page = { word: string, signs: string[] }
const pages: Page[] = [{ word: 'easy', signs: ['easy', 'easy-1'] }, { word: 'cat', signs: ['cat'] }]
const options = (previous: SignRecord[], read: (page: Page) => Promise<RecordContent[]>) => ({
  previous, read, key: (page: Page) => page.word, candidateOf: (record: SignRecord) => record.sourceId.split('-')[0],
})

describe('crawl()', () => {
  it('reads each candidate, which may give several signs', async () => {
    const { found, read } = await crawl(pages, options([], async page => page.signs.map(s => sign(s))))
    expect(found.map(s => s.sourceId)).toEqual(['easy', 'easy-1', 'cat'])
    expect(read).toHaveLength(2)
  })

  it('keeps every record of a candidate that failed, wasn\'t due, or was past the limit', async () => {
    const previous = await records(sign('easy'), sign('easy-1'), sign('cat'))
    const failing = await crawl(pages, options(previous, async page => { if (page.word === 'easy') throw new Error('503'); return [sign('cat')] }))
    expect(failing.found.map(s => s.sourceId).sort()).toEqual(['cat', 'easy', 'easy-1'])
    expect(failing.failed.map(f => f.candidate.word)).toEqual(['easy'])

    const notDue = await crawl(pages, { ...options(previous, async () => { throw new Error('read') }), due: () => false })
    expect(notDue.found).toHaveLength(3)
    expect(notDue.failed).toEqual([])

    const limited = await crawl(pages, { ...options(previous, async page => page.signs.map(s => sign(s))), limit: 1 })
    expect(limited.read.map(p => p.word)).toEqual(['easy'])
    expect(limited.found.map(s => s.sourceId).sort()).toEqual(['cat', 'easy', 'easy-1'])
  })

  it('reads nothing more once told to stop, keeping the records of the rest', async () => {
    const previous = await records(sign('easy'), sign('easy-1'), sign('cat'))
    let reads = 0
    const { found, read } = await crawl(pages, { ...options(previous, async page => { reads++; return page.signs.map(s => sign(s)) }), stop: () => reads >= 1 })
    expect(read.map(page => page.word)).toEqual(['easy'])
    expect(found.map(s => s.sourceId).sort()).toEqual(['cat', 'easy', 'easy-1'])
  })

  it('drops the records of a candidate discovery no longer finds, so they become missing', async () => {
    const previous = await records(sign('easy'), sign('gone'))
    const { found } = await crawl([pages[0]], options(previous, async page => page.signs.map(s => sign(s))))
    expect(found.map(s => s.sourceId)).toEqual(['easy', 'easy-1'])
  })
})

describe('encodeMissing()', () => {
  const encoded = (name: string) => ({ thumbnail: `${name}.webp`, encodedAt: at, encodes: [] })

  it('reuses a seed for the same source url, and encodes the rest', async () => {
    const all = await records(sign('cat'), sign('dog'))
    const calls: string[] = []
    const result = await encodeMissing(all, {
      seeds: new Map([['cat.mp4', encoded('old-cat')]]),
      encode: async (record, url) => { calls.push(url); return encoded(record.id) },
    })
    expect(result).toEqual({ encoded: ['dog'], reused: ['cat'], failed: [] })
    expect(calls).toEqual(['dog.mp4'])
    expect(all.map(r => r.media[0].encoded!.thumbnail)).toEqual(['old-cat.webp', 'dog.webp'])
  })

  it('can encode several at once, giving the results in the records\' order', async () => {
    const list = await records(sign('a'), sign('b'), sign('c'))
    let running = 0
    let most = 0
    const encode = async (record: SignRecord) => {
      running++; most = Math.max(most, running)
      await new Promise(resolve => setTimeout(resolve, record.sourceId === 'a' ? 20 : 1))
      running--
      if (record.sourceId === 'b') throw new Error('broken')
      return { thumbnail: `${record.sourceId}.webp`, encodedAt: at, encodes: [] }
    }
    const { encoded, failed } = await encodeMissing(list, { encode, concurrency: 2 })
    expect(most).toBe(2)
    expect(encoded).toEqual(['a', 'c'])
    expect(failed).toEqual(['b'])
    expect(list.map(r => r.media[0].encoded?.thumbnail)).toEqual(['a.webp', undefined, 'c.webp'])
  })

  it('leaves media that already has an encoding, and records that aren\'t present', async () => {
    const [cat] = await records(sign('cat'))
    cat.media[0].encoded = encoded('cat')
    const [dog] = await records(sign('dog'))
    dog.provenance.status = 'missing'
    const result = await encodeMissing([cat, dog], { encode: async () => { throw new Error('should not encode') } })
    expect(result).toEqual({ encoded: [], reused: [], failed: [] })
  })
})

describe('seedsFromEntries()', () => {
  it('collects encodings from existing entries by source url, rewriting their urls', () => {
    const seeds = seedsFromEntries([{
      media: [{ source: { url: 'https://media.test/1.mp4' }, thumbnail: 'https://data.test/raw/m/1-0.webp', timestamp: 0, encodes: [{ type: 'video/mp4', width: 320, height: 240, container: 'mp4', codec: 'h264', version: 'v', url: 'https://data.test/raw/m/1-0.mp4', byteSize: 1, duration: 1 }] }],
    }], url => url.replace('https://data.test/raw/', ''))
    expect(seeds.get('https://media.test/1.mp4')).toMatchObject({ thumbnail: 'm/1-0.webp', encodedAt: '1970-01-01T00:00:00.000Z', encodes: [{ url: 'm/1-0.mp4' }] })
  })
})

describe('encodedSearchData()', () => {
  it('keys entries by sourceId, with only encoded media, leaving out removed records', async () => {
    const all = await records(sign('cat'), sign('dog'), sign('emu'))
    all[0].media[0].encoded = { encodedAt: at, encodes: [], sourceSha256: 'a'.repeat(64) }
    all[2].provenance.status = 'removed'
    const data = encodedSearchData({ format: 'find-sign-records', version: 1, provider: { id: 'p', name: 'P' }, records: all }) as Record<string, any>
    expect(Object.keys(data).sort()).toEqual(['cat', 'dog'])
    expect(data.cat.media).toHaveLength(1)
    expect(data.cat.media[0].sourceSha256).toBe('a'.repeat(64))
    expect(data.dog.media).toEqual([])
  })

  it('gives the source\'s dates as epoch milliseconds, when it has them', async () => {
    const [cat, dog] = await records({ ...sign('cat'), sourceCreated: '2020-01-02T00:00:00.000Z' }, sign('dog'))
    const data = encodedSearchData({ format: 'find-sign-records', version: 1, provider: { id: 'p', name: 'P' }, records: [cat, dog] }) as Record<string, any>
    expect(data.cat.sourceCreated).toBe(Date.parse('2020-01-02T00:00:00.000Z'))
    expect('sourceCreated' in data.dog).toBe(false)
  })
})

describe('hashMissing()', () => {
  it('hashes the source of encoded media without a hash, until told to stop', async () => {
    const all = await records(sign('a'), sign('b'), sign('c'), sign('d'))
    for (const record of all) record.media[0].encoded = { encodedAt: at, encodes: [] }
    all[0].media[0].encoded!.sourceSha256 = 'f'.repeat(64)
    delete all[3].media[0].encoded
    const downloads: string[] = []
    const download = async (record: SignRecord, url: string) => { downloads.push(url); if (record.sourceId === 'b') throw new Error('gone'); return new TextEncoder().encode(url) }
    const result = await hashMissing(all, { download })
    expect(downloads).toEqual(['b.mp4', 'c.mp4'])
    expect(result).toEqual({ hashed: ['c'], failed: ['b'], left: 0 })
    expect(all[2].media[0].encoded!.sourceSha256).toBe(sha256(new TextEncoder().encode('c.mp4')))

    const stopped = await hashMissing(all, { download, stop: () => true })
    expect(stopped).toEqual({ hashed: [], failed: [], left: 1 })
  })
})
