import { describe, expect, it } from 'vitest'
import { readIndexManifest, readTopManifest } from '../src/manifest.ts'

const goodTop = () => ({
  version: 2,
  indexes: { alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' },
})

const goodIndex = () => ({
  shardCount: 1100,
  shards: ['shard-0.4f9a1c07be.json', 'shard-1.c3d4e5f6a7.json'],
  scans: ['scan-0.77aa01cc22.json'],
  vectors: ['vectors-0.b1b2b3b4b5.lps'],
})

// names a visitor's browser must never be sent off to fetch, because a name goes on the end of the data server's address
const unsafeNames = ['', '..', '.', '../secret.json', 'folder/file.json', 'folder\\file.json', 'a..b.json', 'https://evil.test/x.json', '//evil.test/x.json', 'file name.json', 'file.json?x=1', 'file.json#x', 'file%2e.json']

describe('readTopManifest()', () => {
  it('gives back the version and the index names with their manifest file names', () => {
    expect(readTopManifest(goodTop())).toEqual(goodTop())
  })

  it('accepts an empty set of indexes (a collection with nothing in it yet)', () => {
    expect(readTopManifest({ version: 2, indexes: {} }).indexes).toEqual({})
  })

  it('refuses a version it doesn\'t know, in words that say the version is the problem', () => {
    for (const version of [1, 3, '2', undefined, null]) {
      expect(() => readTopManifest({ ...goodTop(), version })).toThrow(/version/i)
    }
  })

  it('refuses something that is not a manifest at all', () => {
    for (const bad of [null, undefined, 'text', 7, [], [goodTop()]]) {
      expect(() => readTopManifest(bad)).toThrow(/manifest/i)
    }
  })

  it('refuses a missing indexes list rather than reading it as empty', () => {
    expect(() => readTopManifest({ version: 2 })).toThrow(/indexes/i)
    expect(() => readTopManifest({ version: 2, indexes: null })).toThrow(/indexes/i)
    expect(() => readTopManifest({ version: 2, indexes: ['alpha'] })).toThrow(/indexes/i)
  })

  it('refuses an index manifest name that is not one plain file name', () => {
    for (const name of [...unsafeNames, 7, null]) {
      expect(() => readTopManifest({ version: 2, indexes: { alpha: name } })).toThrow(/alpha/)
    }
  })
})

describe('readIndexManifest()', () => {
  it('gives back the shard count and the file names of its shards, scans and vector buckets', () => {
    expect(readIndexManifest(goodIndex())).toEqual(goodIndex())
  })

  it('accepts empty lists when they are really there (an index with nothing in it yet)', () => {
    expect(readIndexManifest({ shardCount: 1, shards: [], scans: [], vectors: [] }).shards).toEqual([])
  })

  it('refuses a missing list, so a broken manifest can never make a visitor throw files away', () => {
    for (const list of ['shards', 'scans', 'vectors'] as const) {
      const broken: any = goodIndex()
      delete broken[list]
      expect(() => readIndexManifest(broken)).toThrow(new RegExp(list))
      expect(() => readIndexManifest({ ...goodIndex(), [list]: null })).toThrow(new RegExp(list))
      expect(() => readIndexManifest({ ...goodIndex(), [list]: 'shard-0.4f9a1c07be.json' })).toThrow(new RegExp(list))
    }
  })

  it('refuses a shard count that is not a whole number above zero', () => {
    for (const shardCount of [0, -1, 2.5, '1100', null, undefined, NaN]) {
      expect(() => readIndexManifest({ ...goodIndex(), shardCount })).toThrow(/shard count/i)
    }
  })

  it('refuses a file name that is not one plain file name, in any of the lists', () => {
    for (const list of ['shards', 'scans', 'vectors'] as const) {
      for (const name of [...unsafeNames, 7, null]) {
        expect(() => readIndexManifest({ ...goodIndex(), [list]: [name] })).toThrow(new RegExp(list))
      }
    }
  })

  it('refuses something that is not a manifest at all', () => {
    for (const bad of [null, undefined, 'text', 7, []]) {
      expect(() => readIndexManifest(bad)).toThrow(/manifest/i)
    }
  })
})
