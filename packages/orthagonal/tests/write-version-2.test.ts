import { describe, expect, it } from 'vitest'
import { parse } from '@andypalmer/vectors'
import { planPublishOrder, planPublishTiers, writeTopManifest, writeVersion2Index, writeVersion2Vectors, type PublishedFile, type WrittenIndex, type WrittenVectors } from '../src/write-version-2.ts'
import { readIndexManifest, readTopManifest } from '../src/manifest.ts'
import { looksContentNamed } from '../src/content-name.ts'
import type { EncodedSearchData } from '../src/types.ts'

function sign (name: string, extra: object = {}) {
  return {
    title: name.toUpperCase(), words: [name, `${name}s`.toUpperCase()], tags: ['animal'], body: `About the ${name}.`,
    link: `https://alpha.test/${name}`, timestamp: 1000, media: [],
    ...extra
  }
}

const names = Array.from({ length: 120 }, (_, n) => `sign${n}`)
const signs = (list: string[] = names, extra: { [name: string]: object } = {}): EncodedSearchData =>
  Object.fromEntries(list.map(name => [name, sign(name, extra[name])])) as unknown as EncodedSearchData

// a tiny meaning space; a word with no entry here has no vector
const knownVectors: { [word: string]: number[] } = Object.fromEntries(names.flatMap(name => [[name, [0.5, 0.1, 0.2, 0.3]], [`${name}s`, [0.1, 0.9, 0.2, 0.3]]]))
const lookupLog: string[] = []
const lookupVector = async (word: string) => { lookupLog.push(word); return knownVectors[word] }

const text = (contents: string | Uint8Array) => typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
const byName = (written: { files: PublishedFile[] }, name: string) => written.files.find(file => file.name === name)!
const namesIn = (written: { files: PublishedFile[] }) => new Set(written.files.map(file => file.name))
const wordsInBuckets = (written: WrittenVectors) => written.vectorNames.flatMap(name => [...parse(byName(written, name).contents as Uint8Array)].map(entry => entry.word))

describe('writeVersion2Index()', () => {
  const options = { shardCount: 8, scanCount: 2 }

  it('gives an index manifest that the manifest reader accepts, and that lists the files it wrote', async () => {
    const written = await writeVersion2Index('alpha', signs(), options)
    expect(readIndexManifest(JSON.parse(text(byName(written, written.manifestName).contents)))).toEqual(written.manifest)
    expect(written.manifest.shardCount).toBe(8)
    expect(written.manifest.shards).toHaveLength(8)
    expect(written.manifest.scans).toHaveLength(2)
    for (const fileName of [...written.manifest.shards, ...written.manifest.scans]) {
      expect(namesIn(written).has(fileName)).toBe(true)
    }
  })

  it('leaves the word vectors to the collection, since every index shares them', async () => {
    const written = await writeVersion2Index('alpha', signs(), options)
    expect(written.manifest).not.toHaveProperty('vectors')
    expect([...namesIn(written)].filter(name => name.endsWith('.lps'))).toEqual([])
  })

  it('names the index manifest after the index and its own bytes', async () => {
    const written = await writeVersion2Index('alpha', signs(), options)
    expect(written.manifestName.startsWith('index-alpha.')).toBe(true)
    expect(looksContentNamed(written.manifestName)).toBe(true)
  })

  it('refuses an index name that can\'t be part of a file name', async () => {
    for (const bad of ['', 'a.b', '../x', 'a/b', 'a b']) {
      await expect(writeVersion2Index(bad, signs(), options)).rejects.toThrow(/stem|index name/i)
    }
  })

  it('writes every file under a content name, with the index manifest last of its files', async () => {
    const written = await writeVersion2Index('alpha', signs(), options)
    for (const file of written.files) expect(looksContentNamed(file.name)).toBe(true)
    expect(written.files.at(-1)!.name).toBe(written.manifestName)
  })

  it('works out its own counts when we give none', async () => {
    const written = await writeVersion2Index('alpha', signs())
    expect(written.manifest.shardCount).toBe(written.manifest.shards.length)
  })

  it('makes the same names for the same signs, and when one body changes makes just one new shard and a new manifest', async () => {
    const before = await writeVersion2Index('alpha', signs(), options)
    const same = await writeVersion2Index('alpha', signs(), options)
    expect(same.manifestName).toBe(before.manifestName)

    const after = await writeVersion2Index('alpha', signs(names, { sign7: { body: 'A new body.' } }), options)
    const newFiles = [...namesIn(after)].filter(name => !namesIn(before).has(name))
    expect(newFiles).toHaveLength(2)
    expect(newFiles).toContain(after.manifestName)
    expect(newFiles.filter(name => after.manifest.shards.includes(name))).toHaveLength(1)
  })
})

describe('writeVersion2Index() keeping the last build\'s counts', () => {
  const nameList = (count: number) => Array.from({ length: count }, (_, n) => `sign${n}`)
  const build = (count: number, extra: object = {}) => writeVersion2Index('alpha', signs(nameList(count)), extra)

  it('keeps the shard count when signs grow past the point where we would have picked a bigger one', async () => {
    const first = await build(128) // exactly 16 signs a shard
    expect(first.manifest.shardCount).toBe(8)
    expect((await build(129)).manifest.shardCount).toBe(9) // what happens without the last manifest
    expect((await build(129, { previous: first.manifest })).manifest.shardCount).toBe(8)
  })

  it('so adding that one sign makes one new shard, not a new set of them', async () => {
    const first = await build(128)
    const second = await build(129, { previous: first.manifest })
    const newShards = second.manifest.shards.filter(name => !first.manifest.shards.includes(name))
    expect(newShards).toHaveLength(1)
  })

  it('doubles the shard count when shards have grown to more than twice the target size', async () => {
    const first = await build(128)
    expect((await build(8 * 32, { previous: first.manifest })).manifest.shardCount).toBe(8)
    expect((await build(8 * 32 + 1, { previous: first.manifest })).manifest.shardCount).toBe(16)
  })

  it('never shrinks the shard count when signs go', async () => {
    const first = await build(128)
    expect((await build(10, { previous: first.manifest })).manifest.shardCount).toBe(8)
  })

  it('keeps the scan count, whatever else changes', async () => {
    const first = await build(100, { scanCount: 2 })
    const second = await build(110, { previous: first.manifest })
    expect(second.manifest.scans).toHaveLength(2) // we would have picked 1
  })

  it('lets a count we ask for outweigh the last build\'s', async () => {
    const first = await build(128)
    const second = await build(128, { previous: first.manifest, shardCount: 3, scanCount: 3 })
    expect([second.manifest.shardCount, second.manifest.scans.length]).toEqual([3, 3])
  })

  it('makes the same files again when built from its own last manifest with nothing changed', async () => {
    const first = await build(128)
    const again = await build(128, { previous: first.manifest })
    expect(again.manifestName).toBe(first.manifestName)
  })
})

describe('writeVersion2Vectors()', () => {
  const collection = (...lists: string[][]) => Object.fromEntries(lists.map((list, n) => [`index${n}`, signs(list)]))

  it('makes one content-named .lps file per bucket, 64 buckets when we don\'t say', async () => {
    const written = await writeVersion2Vectors(collection(names.slice(0, 20)), { lookupVector })
    expect(written.vectorNames).toHaveLength(64)
    for (const name of written.vectorNames) {
      expect(looksContentNamed(name)).toBe(true)
      expect(name.endsWith('.lps')).toBe(true)
      expect(namesIn(written).has(name)).toBe(true)
    }
    expect((await writeVersion2Vectors(collection(names.slice(0, 20)), { lookupVector, bucketCount: 4 })).vectorNames).toHaveLength(4)
  })

  it('holds the vector of each word the signs use, looked up in normal form', async () => {
    lookupLog.length = 0
    const written = await writeVersion2Vectors(collection(['sign1', 'sign2']), { lookupVector, bucketCount: 4 })
    expect([...lookupLog].sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s']) // "SIGN1S" is looked up as "sign1s"
    expect(wordsInBuckets(written).sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s'])
  })

  it('looks up and holds a word once, however many indexes use it', async () => {
    lookupLog.length = 0
    const written = await writeVersion2Vectors(collection(['sign1', 'sign2'], ['sign2', 'sign3'], ['sign1', 'sign3']), { lookupVector, bucketCount: 4 })
    expect([...lookupLog].sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s', 'sign3', 'sign3s'])
    expect(wordsInBuckets(written).sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s', 'sign3', 'sign3s'])
  })

  it('leaves out a word that has no vector, and keeps the vectors it is asked to keep', async () => {
    const withUnknown = { alpha: signs(['sign1'], { sign1: { words: ['sign1', 'unheard-of'] } }) }
    const written = await writeVersion2Vectors(withUnknown, { lookupVector, bucketCount: 4, keepVectors: { 'stale-word': [0.1, 0.2, 0.3, 0.4] } })
    expect(wordsInBuckets(written).sort()).toEqual(['sign1', 'stale-word'])
  })

  it('keeps the last build\'s bucket count, because changing it would move every word', async () => {
    const previous = { version: 2 as const, indexes: {}, vectors: ['a.0000000000.lps', 'b.0000000000.lps', 'c.0000000000.lps'] }
    expect((await writeVersion2Vectors(collection(names.slice(0, 20)), { lookupVector, previous })).vectorNames).toHaveLength(3)
    expect((await writeVersion2Vectors(collection(names.slice(0, 20)), { lookupVector, previous, bucketCount: 5 })).vectorNames).toHaveLength(5)
  })

  it('leaves every bucket unchanged when the old words, read back out of the last build\'s buckets, are kept after their signs go', async () => {
    const first = await writeVersion2Vectors(collection(names.slice(0, 40)), { lookupVector, bucketCount: 8 })
    const oldWords: { [word: string]: Float32Array } = {}
    for (const name of first.vectorNames) {
      for (const { word, getVector } of parse(byName(first, name).contents as Uint8Array)) oldWords[word] = getVector()
    }
    // every sign has gone, but the words are kept: packing a vector that was already packed gives the same bytes
    const second = await writeVersion2Vectors(collection([]), { lookupVector, bucketCount: 8, keepVectors: oldWords })
    expect(second.vectorNames).toEqual(first.vectorNames)
  })

  it('works out the same buckets however the indexes are ordered', async () => {
    const forwards = await writeVersion2Vectors(collection(names.slice(0, 10), names.slice(10, 20)), { lookupVector })
    const backwards = await writeVersion2Vectors(collection(names.slice(10, 20), names.slice(0, 10)), { lookupVector })
    expect(backwards.vectorNames).toEqual(forwards.vectorNames)
  })

  it('changes only one bucket when one sign with one new word is added to one index', async () => {
    const before = await writeVersion2Vectors(collection(names.slice(0, 50)), { lookupVector })
    knownVectors['brandnew'] = [0.9, 0.9, 0.9, 0.9]
    try {
      const after = await writeVersion2Vectors({ index0: signs(names.slice(0, 50), {}) , index1: { 'brand-new': sign('brand-new', { words: ['brandnew'] }) } as any }, { lookupVector })
      expect(after.vectorNames.filter((name, number) => name !== before.vectorNames[number])).toHaveLength(1)
    } finally {
      delete knownVectors['brandnew']
    }
  })
})

describe('writeTopManifest()', () => {
  it('is called manifest.json and says version 2, which manifest each index has, and which files hold the shared vectors', () => {
    const file = writeTopManifest({ alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' }, ['vectors-0.b1b2b3b4b5.lps', 'vectors-1.c1c2c3c4c5.lps'])
    expect(file.name).toBe('manifest.json')
    expect(readTopManifest(JSON.parse(text(file.contents)))).toEqual({
      version: 2,
      indexes: { alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' },
      vectors: ['vectors-0.b1b2b3b4b5.lps', 'vectors-1.c1c2c3c4c5.lps']
    })
  })
})

describe('planPublishOrder()', () => {
  const planOptions = { shardCount: 8, scanCount: 2 }
  async function collectionWritten () {
    const indexes = {
      alpha: await writeVersion2Index('alpha', signs(names.slice(0, 60)), planOptions),
      beta: await writeVersion2Index('beta', signs(names.slice(60)), planOptions)
    }
    const vectors = await writeVersion2Vectors({ alpha: signs(names.slice(0, 60)), beta: signs(names.slice(60)) }, { lookupVector, bucketCount: 4 })
    return { indexes, vectors }
  }

  it('ends with manifest.json, which is the only file that isn\'t content-named', async () => {
    const { indexes, vectors } = await collectionWritten()
    const plan = planPublishOrder(indexes, vectors)
    expect(plan.at(-1)!.name).toBe('manifest.json')
    expect(plan.filter(file => !looksContentNamed(file.name)).map(file => file.name)).toEqual(['manifest.json'])
  })

  it('has manifest.json say which index manifests and which vector files it publishes', async () => {
    const { indexes, vectors } = await collectionWritten()
    const plan = planPublishOrder(indexes, vectors)
    expect(readTopManifest(JSON.parse(text(plan.at(-1)!.contents)))).toEqual({
      version: 2, indexes: { alpha: indexes.alpha.manifestName, beta: indexes.beta.manifestName }, vectors: vectors.vectorNames
    })
  })

  it('publishes every file a manifest names before that manifest, and every index manifest before manifest.json', async () => {
    const { indexes, vectors } = await collectionWritten()
    const plan = planPublishOrder(indexes, vectors)
    const position = (name: string) => plan.findIndex(file => file.name === name)
    for (const written of Object.values(indexes)) {
      expect(position(written.manifestName)).toBeGreaterThan(-1)
      for (const fileName of [...written.manifest.shards, ...written.manifest.scans]) {
        expect(position(fileName)).toBeGreaterThan(-1)
        expect(position(fileName)).toBeLessThan(position(written.manifestName))
      }
      expect(position(written.manifestName)).toBeLessThan(position('manifest.json'))
    }
    for (const fileName of vectors.vectorNames) {
      expect(position(fileName)).toBeGreaterThan(-1)
      expect(position(fileName)).toBeLessThan(position('manifest.json'))
    }
  })

  it('lists a file once even when two indexes both have it', async () => {
    const a = await writeVersion2Index('alpha', signs([]), planOptions)
    const b = await writeVersion2Index('beta', signs([]), planOptions)
    const vectors = await writeVersion2Vectors({ alpha: signs([]), beta: signs([]) }, { lookupVector, bucketCount: 4 })
    // two empty indexes share their empty shards and scans, and every empty vector bucket is empty
    const planned = planPublishOrder({ alpha: a, beta: b }, vectors).map(file => file.name)
    expect(new Set(planned).size).toBe(planned.length)
    expect(planned.length).toBeLessThan(a.files.length + b.files.length + vectors.files.length + 1)
  })
})

describe('planPublishTiers()', () => {
  const tierOptions = { shardCount: 8, scanCount: 2 }
  async function collectionWritten () {
    const indexes = {
      alpha: await writeVersion2Index('alpha', signs(names.slice(0, 60)), tierOptions),
      beta: await writeVersion2Index('beta', signs(names.slice(60)), tierOptions)
    }
    const vectors = await writeVersion2Vectors({ alpha: signs(names.slice(0, 60)), beta: signs(names.slice(60)) }, { lookupVector, bucketCount: 4 })
    return { indexes, vectors }
  }

  it('puts every shard, scan file and vector bucket in the content tier, and nothing else', async () => {
    const { indexes, vectors } = await collectionWritten()
    const tiers = planPublishTiers(indexes, vectors)
    const expected = new Set([
      ...Object.values(indexes).flatMap(index => [...index.manifest.shards, ...index.manifest.scans]),
      ...vectors.vectorNames
    ])
    expect(new Set(tiers.contentFiles.map(file => file.name))).toEqual(expected)
    expect(tiers.contentFiles.every(file => looksContentNamed(file.name))).toBe(true)
  })

  it('puts each index\'s own manifest in the index manifest tier, and nothing else', async () => {
    const { indexes, vectors } = await collectionWritten()
    const tiers = planPublishTiers(indexes, vectors)
    expect(tiers.indexManifests.map(file => file.name)).toEqual([indexes.alpha.manifestName, indexes.beta.manifestName])
    for (const file of tiers.indexManifests) expect(file.contents).toBe(byName(indexes[file.name === indexes.alpha.manifestName ? 'alpha' : 'beta'], file.name).contents)
  })

  it('has manifest.json on its own, naming those index manifests and those vector buckets', async () => {
    const { indexes, vectors } = await collectionWritten()
    const { topManifest } = planPublishTiers(indexes, vectors)
    expect(topManifest.name).toBe('manifest.json')
    expect(readTopManifest(JSON.parse(text(topManifest.contents)))).toEqual({
      version: 2, indexes: { alpha: indexes.alpha.manifestName, beta: indexes.beta.manifestName }, vectors: vectors.vectorNames
    })
  })

  it('lists a content file once even when two indexes both have it', async () => {
    const a = await writeVersion2Index('alpha', signs([]), tierOptions)
    const b = await writeVersion2Index('beta', signs([]), tierOptions)
    const vectors = await writeVersion2Vectors({ alpha: signs([]), beta: signs([]) }, { lookupVector, bucketCount: 4 })
    const names = planPublishTiers({ alpha: a, beta: b }, vectors).contentFiles.map(file => file.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('is the same files, in the same order, as the plan that comes as one list', async () => {
    const { indexes, vectors } = await collectionWritten()
    const { contentFiles, indexManifests, topManifest } = planPublishTiers(indexes, vectors)
    expect(planPublishOrder(indexes, vectors)).toEqual([...contentFiles, ...indexManifests, topManifest])
  })
})
