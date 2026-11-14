import { describe, expect, it } from 'vitest'
import { parse } from '@andypalmer/vectors'
import { planPublishOrder, writeTopManifest, writeVersion2Index, type WrittenIndex } from '../src/write-version-2.ts'
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

const options = { lookupVector, shardCount: 8, scanCount: 2, bucketCount: 4 }
const text = (contents: string | Uint8Array) => typeof contents === 'string' ? contents : new TextDecoder().decode(contents)
const byName = (written: WrittenIndex, name: string) => written.files.find(file => file.name === name)!
const namesIn = (written: WrittenIndex) => new Set(written.files.map(file => file.name))

describe('writeVersion2Index()', () => {
  it('gives an index manifest that the manifest reader accepts, and that lists the files it wrote', async () => {
    const written = await writeVersion2Index('alpha', signs(), options)
    expect(readIndexManifest(JSON.parse(text(byName(written, written.manifestName).contents)))).toEqual(written.manifest)
    expect(written.manifest.shardCount).toBe(8)
    expect(written.manifest.shards).toHaveLength(8)
    expect(written.manifest.scans).toHaveLength(2)
    expect(written.manifest.vectors).toHaveLength(4)
    for (const fileName of [...written.manifest.shards, ...written.manifest.scans, ...written.manifest.vectors]) {
      expect(namesIn(written).has(fileName)).toBe(true)
    }
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

  it('puts the vector of each of the signs\' words, looked up in normal form, into the vector buckets', async () => {
    lookupLog.length = 0
    const written = await writeVersion2Index('alpha', signs(['sign1', 'sign2']), options)
    expect([...lookupLog].sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s']) // "SIGN1S" is looked up as "sign1s", once
    const inBuckets = written.manifest.vectors.flatMap(name => [...parse(byName(written, name).contents as Uint8Array)].map(entry => entry.word))
    expect(inBuckets.sort()).toEqual(['sign1', 'sign1s', 'sign2', 'sign2s'])
  })

  it('leaves out a word that has no vector, and keeps the vectors it is asked to keep', async () => {
    const withUnknown = signs(['sign1'], { sign1: { words: ['sign1', 'unheard-of'] } })
    const written = await writeVersion2Index('alpha', withUnknown, { ...options, keepVectors: { 'stale-word': [0.1, 0.2, 0.3, 0.4] } })
    const inBuckets = written.manifest.vectors.flatMap(name => [...parse(byName(written, name).contents as Uint8Array)].map(entry => entry.word))
    expect(inBuckets.sort()).toEqual(['sign1', 'stale-word'])
  })

  it('works out its own counts when we give none', async () => {
    const written = await writeVersion2Index('alpha', signs(), { lookupVector })
    expect(written.manifest.shardCount).toBe(written.manifest.shards.length)
    expect(written.manifest.vectors).toHaveLength(64)
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

describe('writeTopManifest()', () => {
  it('is called manifest.json and says version 2 and which manifest each index has', () => {
    const file = writeTopManifest({ alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' })
    expect(file.name).toBe('manifest.json')
    expect(readTopManifest(JSON.parse(text(file.contents)))).toEqual({
      version: 2, indexes: { alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' }
    })
  })
})

describe('planPublishOrder()', () => {
  async function twoIndexes () {
    return { alpha: await writeVersion2Index('alpha', signs(names.slice(0, 60)), options), beta: await writeVersion2Index('beta', signs(names.slice(60)), options) }
  }

  it('ends with manifest.json, which is the only file that isn\'t content-named', async () => {
    const plan = planPublishOrder(await twoIndexes())
    expect(plan.at(-1)!.name).toBe('manifest.json')
    expect(plan.filter(file => !looksContentNamed(file.name)).map(file => file.name)).toEqual(['manifest.json'])
  })

  it('has manifest.json say what the index manifests it publishes are', async () => {
    const indexes = await twoIndexes()
    const plan = planPublishOrder(indexes)
    expect(readTopManifest(JSON.parse(text(plan.at(-1)!.contents))).indexes).toEqual({ alpha: indexes.alpha.manifestName, beta: indexes.beta.manifestName })
  })

  it('publishes every file an index manifest lists before that manifest, and every index manifest before manifest.json', async () => {
    const indexes = await twoIndexes()
    const plan = planPublishOrder(indexes)
    const position = (name: string) => plan.findIndex(file => file.name === name)
    for (const written of Object.values(indexes)) {
      expect(position(written.manifestName)).toBeGreaterThan(-1)
      for (const fileName of [...written.manifest.shards, ...written.manifest.scans, ...written.manifest.vectors]) {
        expect(position(fileName)).toBeGreaterThan(-1)
        expect(position(fileName)).toBeLessThan(position(written.manifestName))
      }
      expect(position(written.manifestName)).toBeLessThan(position('manifest.json'))
    }
  })

  it('lists a file once even when two indexes both have it', async () => {
    const a = await writeVersion2Index('alpha', signs([]), options)
    const b = await writeVersion2Index('beta', signs([]), options)
    // two empty indexes share most of their files: the same empty shard bytes still have different numbers, so only some match
    const plan = planPublishOrder({ alpha: a, beta: b })
    const planned = plan.map(file => file.name)
    expect(new Set(planned).size).toBe(planned.length)
    expect(planned.length).toBeLessThan(a.files.length + b.files.length + 1)
  })
})

describe('writeVersion2Index() keeping the last build\'s counts', () => {
  const nameList = (count: number) => Array.from({ length: count }, (_, n) => `sign${n}`)
  const build = (count: number, extra: object = {}) => writeVersion2Index('alpha', signs(nameList(count)), { lookupVector, ...extra })

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

  it('keeps the scan count, and the number of vector buckets, whatever else changes', async () => {
    const first = await build(100, { scanCount: 2, bucketCount: 4 })
    const second = await build(110, { previous: first.manifest })
    expect(second.manifest.scans).toHaveLength(2) // we would have picked 1
    expect(second.manifest.vectors).toHaveLength(4) // we would have picked 64
  })

  it('lets a count we ask for outweigh the last build\'s', async () => {
    const first = await build(128)
    const second = await build(128, { previous: first.manifest, shardCount: 3, scanCount: 3, bucketCount: 5 })
    expect([second.manifest.shardCount, second.manifest.scans.length, second.manifest.vectors.length]).toEqual([3, 3, 5])
  })

  it('works out its counts afresh, as before, when there is no last build', async () => {
    const first = await build(129)
    expect(first.manifest.shardCount).toBe(9)
    expect(first.manifest.vectors).toHaveLength(64)
  })

  it('makes the same files again when built from its own last manifest with nothing changed', async () => {
    const first = await build(128)
    const again = await build(128, { previous: first.manifest })
    expect(again.manifestName).toBe(first.manifestName)
  })
})
