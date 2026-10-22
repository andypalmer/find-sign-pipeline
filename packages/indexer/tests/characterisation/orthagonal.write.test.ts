// Characterisation tests: these pin down what the code does TODAY (including quirks), so it can be
// refactored safely. A failing test here means behaviour changed - decide whether that was intended.
import { EncodedSearchDataBase } from '@andypalmer/test-helpers/settings.ts'
import { expect, describe, it, beforeEach } from 'vitest'
import { FakeDataServer } from '@andypalmer/test-helpers/fake-data-server.ts'
import { alphaSearchData, media, wordVectors } from '@andypalmer/test-helpers/fixtures.ts'
import { readEncodedSearchData } from '../../src/encoded-search-data.ts'
import { normalizeWord, writeIndex } from '@andypalmer/orthagonal'
import { parse as parseVectors } from '@andypalmer/vectors'

const url = `${EncodedSearchDataBase}/alpha.json`
let server: FakeDataServer

beforeEach(() => {
  server = new FakeDataServer().install()
})

describe('readEncodedSearchData()', () => {
  it('adds id and published:true defaults, keeping published:false entries', async () => {
    server.set(url, alphaSearchData())
    const data = await readEncodedSearchData(url)
    expect(Object.keys(data)).toEqual(['cat', 'dog', 'car', 'hidden'])
    expect(data.cat.id).toBe('cat')
    expect(data.cat.published).toBe(true)
    expect(data.hidden.published).toBe(false)
  })

  it('derives title from words joined by ", ", or from the id when there are no words', async () => {
    server.set(url, {
      a: { words: ['big', 'red'], media: [] },
      b: { media: [] },
    })
    const data = await readEncodedSearchData(url)
    expect(data.a.title).toBe('big, red')
    expect(data.b.title).toBe('b')
  })

  it('derives words from the title with Intl.Segmenter, dropping punctuation', async () => {
    server.set(url, { a: { title: 'Hello, big world!', media: [] } })
    const data = await readEncodedSearchData(url)
    expect(data.a.words).toEqual(['Hello', 'big', 'world'])
  })

  it('defaults body, tags and media', async () => {
    server.set(url, { a: { title: 'A' } })
    const data = await readEncodedSearchData(url)
    expect(data.a.body).toBe('')
    expect(data.a.tags).toEqual([])
    expect(data.a.media).toEqual([])
  })

  it('makes links, nav, author, provider and media urls absolute relative to the json url', async () => {
    server.set(url, {
      a: {
        title: 'A', link: 'a.html', nav: [['Home', '/']],
        author: { id: 'x', link: 'people/x', avatar: 'people/x.png' },
        provider: { id: 'alpha', link: '../' },
        media: [media('a')],
      }
    })
    const { a } = await readEncodedSearchData(url)
    expect(a.link).toBe(`${EncodedSearchDataBase}/a.html`)
    expect(a.nav).toEqual([['Home', 'http://data.test/']])
    expect(a.author).toEqual({ id: 'x', link: `${EncodedSearchDataBase}/people/x`, avatar: `${EncodedSearchDataBase}/people/x.png` })
    expect(a.provider!.link).toBe('http://data.test/collections/encoded-search-data/')
    expect(a.media[0].thumbnail).toBe(`${EncodedSearchDataBase}/a-media/a-0.webp`)
    expect(a.media[0].encodes.map(x => x.url)).toEqual([
      `${EncodedSearchDataBase}/a-media/a-0.mp4`,
      `${EncodedSearchDataBase}/a-media/a-0.webm`,
    ])
    // source url is NOT made absolute
    expect(a.media[0].source.url).toBe('https://source.test/a.mp4')
  })

  it('throws on media items without encodes (unencoded raw search-data cannot be read)', async () => {
    server.set(url, { a: { title: 'A', media: [{ method: 'fetch', url: 'x.mp4', version: '1' }] } })
    await expect(readEncodedSearchData(url)).rejects.toThrow(TypeError)
  })
})

describe('normalizeWord()', () => {
  it('trims and lowercases everything - the acronym-preserving branch can never match', () => {
    expect(normalizeWord('  Cat ')).toBe('cat')
    // the regex /^[A-Z0-9]$/ only matches single characters, but the guard requires length > 1
    expect(normalizeWord('ABC')).toBe('abc')
    expect(normalizeWord('A')).toBe('a')
  })
})

describe('writeIndex()', () => {
  async function build (searchData: any, lookups: string[] = []): Promise<{ [path: string]: any }> {
    return await writeIndex(searchData, {
      lookupVector: async (word: string) => {
        lookups.push(word)
        return wordVectors[word]
      }
    })
  }

  function sampleData (count: number) {
    return Object.fromEntries(Array.from({ length: count }, (_, i) => [`e${i}`, {
      id: `e${i}`, title: `E${i}`, words: ['cat'], tags: [], body: '', media: [], timestamp: i,
    }]))
  }

  it('produces meta, shards of 8 entries, one json per column, and a vector cache', async () => {
    const files = await build(sampleData(17))
    expect(Object.keys(files).sort()).toEqual([
      'aliases.json', 'author.json', 'englishPhrases.json', 'id.json', 'link.json', 'meta.json',
      'shard-0.json', 'shard-1.json', 'shard-2.json',
      'sourceCreated.json', 'sourceUpdated.json', 'tags.json', 'timestamp.json', 'title.json', 'vectors.lps', 'words.json',
    ])
    const shardSizes = [0, 1, 2].map(n => JSON.parse(files[`shard-${n}.json`]).entries.length)
    expect(shardSizes).toEqual([8, 8, 1])
  })

  it('writes meta.json with a fixed column layout and a shared buildID', async () => {
    const files = await build(sampleData(2))
    const meta = JSON.parse(files['meta.json'])
    expect(meta).toMatchObject({
      entriesPerShard: 8,
      entries: 2,
      vectorCachePath: 'vectors.lps',
      columns: {
        id: { type: 'string', path: 'id.json' },
        title: { type: 'string', path: 'title.json' },
        words: { type: 'string[]', isVectorIndexed: true, path: 'words.json' },
        link: { type: 'string', path: 'link.json' },
        tags: { type: 'string[]', path: 'tags.json' },
        author: { type: 'object', path: 'author.json' },
        timestamp: { type: 'number', path: 'timestamp.json' },
      }
    })
    expect(typeof meta.buildID).toBe('string')
    expect(typeof meta.buildTimestamp).toBe('number')
    for (const name of ['id', 'title', 'words', 'link', 'tags', 'author', 'timestamp', 'shard-0']) {
      expect(JSON.parse(files[`${name}.json`]).buildID).toBe(meta.buildID)
    }
  })

  it('stores missing column values as null, and full entries (with id first) in shards', async () => {
    const files = await build({ x: { title: 'X', words: ['cat'], tags: [], body: 'b', media: [], nav: [['a', 'b']] } } as any)
    expect(JSON.parse(files['author.json']).entries).toEqual([null])
    expect(JSON.parse(files['link.json']).entries).toEqual([null])
    expect(JSON.parse(files['id.json']).entries).toEqual(['x'])
    const shardEntry = JSON.parse(files['shard-0.json']).entries[0]
    expect(Object.keys(shardEntry)[0]).toBe('id')
    expect(shardEntry).toEqual({ id: 'x', title: 'X', words: ['cat'], tags: [], body: 'b', media: [], nav: [['a', 'b']] })
  })

  it('looks up each unique normalised word once and caches only words that have vectors', async () => {
    const lookups: string[] = []
    const files = await build({
      a: { id: 'a', title: 'A', words: ['Cat', 'cat', 'unknownword'], tags: [], body: '', media: [] },
      b: { id: 'b', title: 'B', words: ['DOG'], tags: [], body: '', media: [] },
    } as any, lookups)
    expect(lookups.sort()).toEqual(['cat', 'dog', 'unknownword'])
    const cached = [...parseVectors(files['vectors.lps'])].map(x => x.word).sort()
    expect(cached).toEqual(['cat', 'dog'])
    // the words column keeps the original, un-normalised spelling
    expect(JSON.parse(files['words.json']).entries).toEqual([['Cat', 'cat', 'unknownword'], ['DOG']])
  })
})
