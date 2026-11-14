import { describe, expect, it } from 'vitest'
import { cutSigns, howManyScans, howManyShards, type CutSigns } from '../src/cut-signs.ts'
import { looksContentNamed, nameFileAfterItsBytes } from '../src/content-name.ts'
import { whichShardHoldsSign } from '../src/placement.ts'
import type { EncodedSearchData } from '../src/types.ts'

function sign (name: string, extra: object = {}) {
  return {
    title: name.toUpperCase(), words: [name, `${name}s`], tags: ['animal'], body: `About the ${name}.`,
    link: `https://alpha.test/${name}`, timestamp: 1000, sourceCreated: 10, sourceUpdated: 20,
    englishPhrases: [`a ${name}`], aliases: [`old-${name}`],
    author: { id: 'phoenix', name: 'Phoenix' },
    provider: { id: 'alpha', name: 'Alpha Dictionary' },
    media: [{ type: 'video', source: { method: 'fetch', url: `https://source.test/${name}.mp4`, version: '1' }, timestamp: 1, thumbnail: `${name}-media/${name}-0.webp`, encodes: [] }],
    ...extra
  }
}

function signs (...names: string[]): EncodedSearchData {
  return Object.fromEntries(names.map(name => [name, sign(name)])) as unknown as EncodedSearchData
}

const manyNames = Array.from({ length: 200 }, (_, n) => `sign-${n}`)
const entriesIn = (cut: CutSigns, fileName: string): any[] => JSON.parse(cut.files[fileName]).entries
const namesOfAllFiles = (cut: CutSigns) => Object.keys(cut.files).sort()

describe('cutSigns() shards', () => {
  it('makes one file per shard number, listed in shard order, each named after its own bytes', async () => {
    const cut = await cutSigns(signs(...manyNames), { shardCount: 13 })
    expect(cut.shardNames).toHaveLength(13)
    for (const [number, fileName] of cut.shardNames.entries()) {
      expect(fileName.startsWith(`shard-${number}.`)).toBe(true)
      expect(looksContentNamed(fileName)).toBe(true)
      expect(fileName).toBe(await nameFileAfterItsBytes(`shard-${number}`, 'json', cut.files[fileName]))
    }
  })

  it('puts each sign in exactly one shard, the one its id hashes to, whole and complete', async () => {
    const data = signs(...manyNames)
    const cut = await cutSigns(data, { shardCount: 13 })
    const seen: string[] = []
    for (const [number, fileName] of cut.shardNames.entries()) {
      for (const entry of entriesIn(cut, fileName)) {
        expect(await whichShardHoldsSign(entry.id, 13)).toBe(number)
        expect(entry).toEqual({ id: entry.id, ...(data as any)[entry.id] })
        seen.push(entry.id)
      }
    }
    expect(seen.sort()).toEqual([...manyNames].sort())
  })

  it('sorts the signs in a shard by id, whatever order they were given in', async () => {
    const cut = await cutSigns(signs(...manyNames.slice().reverse()), { shardCount: 3 })
    for (const fileName of cut.shardNames) {
      const ids = entriesIn(cut, fileName).map(entry => entry.id)
      expect(ids.length).toBeGreaterThan(1)
      expect(ids).toEqual([...ids].sort())
    }
  })

  it('still makes a file for a shard that holds no signs, so every shard number has a name', async () => {
    const cut = await cutSigns(signs('cat'), { shardCount: 50 })
    expect(cut.shardNames).toHaveLength(50)
    const holders = cut.shardNames.filter(fileName => entriesIn(cut, fileName).length > 0)
    expect(holders).toHaveLength(1)
  })

  it('makes the same bytes for the same signs, however the entries and their keys were ordered', async () => {
    const forwards = signs('cat', 'dog', 'emu')
    const shuffled: any = { emu: sign('emu'), cat: sign('cat'), dog: sign('dog') }
    shuffled.cat = Object.fromEntries(Object.entries(shuffled.cat).reverse())
    const a = await cutSigns(forwards, { shardCount: 4 })
    const b = await cutSigns(shuffled, { shardCount: 4 })
    expect(b.files).toEqual(a.files)
    expect(b.shardNames).toEqual(a.shardNames)
  })

  it('keeps every file name when nothing changed, and every shard name but one when one sign\'s body changes', async () => {
    const before = await cutSigns(signs(...manyNames), { shardCount: 40 })
    const again = await cutSigns(signs(...manyNames), { shardCount: 40 })
    expect(again.shardNames).toEqual(before.shardNames)

    const edited: any = signs(...manyNames)
    edited['sign-7'] = sign('sign-7', { body: 'A new body.' })
    const after = await cutSigns(edited, { shardCount: 40 })
    const changed = before.shardNames.filter((name, number) => name !== after.shardNames[number])
    expect(changed).toEqual([before.shardNames[await whichShardHoldsSign('sign-7', 40)]])
  })

  it('touches only the one shard when a sign is added, and only the one when it is removed', async () => {
    const before = await cutSigns(signs(...manyNames), { shardCount: 40 })
    const added = await cutSigns(signs(...manyNames, 'brand-new'), { shardCount: 40 })
    const removed = await cutSigns(signs(...manyNames.filter(name => name !== 'sign-9')), { shardCount: 40 })
    const differences = (a: CutSigns, b: CutSigns) => a.shardNames.filter((name, number) => name !== b.shardNames[number]).length
    expect(differences(before, added)).toBe(1)
    expect(differences(before, removed)).toBe(1)
  })

  it('works out a shard count from the number of signs when we don\'t give one', async () => {
    const cut = await cutSigns(signs(...manyNames))
    expect(cut.shardNames).toHaveLength(howManyShards(manyNames.length))
  })

  it('copes with no signs at all', async () => {
    const cut = await cutSigns({})
    expect(cut.shardNames.length).toBeGreaterThanOrEqual(1)
    expect(cut.scanNames.length).toBeGreaterThanOrEqual(1)
    for (const fileName of [...cut.shardNames, ...cut.scanNames]) expect(entriesIn(cut, fileName)).toEqual([])
  })
})

describe('cutSigns() scan files', () => {
  it('makes one file per scan number, listed in order, each named after its own bytes', async () => {
    const cut = await cutSigns(signs(...manyNames), { scanCount: 3 })
    expect(cut.scanNames).toHaveLength(3)
    for (const [number, fileName] of cut.scanNames.entries()) {
      expect(fileName.startsWith(`scan-${number}.`)).toBe(true)
      expect(fileName).toBe(await nameFileAfterItsBytes(`scan-${number}`, 'json', cut.files[fileName]))
    }
  })

  it('puts each sign in exactly one scan file, chosen by the same hash, sorted by id', async () => {
    const cut = await cutSigns(signs(...manyNames), { scanCount: 3 })
    const seen: string[] = []
    for (const [number, fileName] of cut.scanNames.entries()) {
      const ids = entriesIn(cut, fileName).map(row => row.id)
      expect(ids).toEqual([...ids].sort())
      for (const id of ids) expect(await whichShardHoldsSign(id, 3)).toBe(number)
      seen.push(...ids)
    }
    expect(seen.sort()).toEqual([...manyNames].sort())
  })

  it('holds what every search looks at, and leaves out the body and the videos', async () => {
    const cut = await cutSigns(signs('cat'), { scanCount: 1 })
    const [row] = entriesIn(cut, cut.scanNames[0])
    expect(row).toEqual({
      id: 'cat', title: 'CAT', words: ['cat', 'cats'], tags: ['animal'], englishPhrases: ['a cat'], aliases: ['old-cat'],
      link: 'https://alpha.test/cat', author: { id: 'phoenix', name: 'Phoenix' },
      timestamp: 1000, sourceCreated: 10, sourceUpdated: 20
    })
  })

  it('keeps scan names when only a body changes, and changes just one when a sign is added', async () => {
    const before = await cutSigns(signs(...manyNames), { shardCount: 40, scanCount: 4 })
    const edited: any = signs(...manyNames)
    edited['sign-7'] = sign('sign-7', { body: 'A new body.' })
    expect((await cutSigns(edited, { shardCount: 40, scanCount: 4 })).scanNames).toEqual(before.scanNames)

    const added = await cutSigns(signs(...manyNames, 'brand-new'), { shardCount: 40, scanCount: 4 })
    expect(added.scanNames.filter((name, number) => name !== before.scanNames[number])).toHaveLength(1)
  })

  it('has no file that is neither a listed shard nor a listed scan', async () => {
    const cut = await cutSigns(signs(...manyNames), { shardCount: 5, scanCount: 2 })
    expect(namesOfAllFiles(cut)).toEqual([...cut.shardNames, ...cut.scanNames].sort())
  })
})

describe('howManyShards() and howManyScans()', () => {
  it('aim for about 16 signs a shard and about 1,300 a scan file, and never fewer than one file', () => {
    expect(howManyShards(0)).toBe(1)
    expect(howManyShards(1)).toBe(1)
    expect(howManyShards(17663)).toBe(1104)
    expect(howManyScans(0)).toBe(1)
    expect(howManyScans(1300)).toBe(1)
    expect(howManyScans(17663)).toBe(14)
  })

  it('give more files as there are more signs', () => {
    expect(howManyShards(5000)).toBeGreaterThan(howManyShards(500))
    expect(howManyScans(50000)).toBeGreaterThan(howManyScans(5000))
  })
})

describe('cutSigns() ids', () => {
  it('goes by a sign\'s own id when it has one that differs from its key, as version 1 did', async () => {
    const data: any = { 'cat-key': sign('cat', { id: 'readable-cat' }) }
    const cut = await cutSigns(data, { shardCount: 7, scanCount: 3 })
    const shard = await whichShardHoldsSign('readable-cat', 7)
    expect(entriesIn(cut, cut.shardNames[shard]).map(entry => entry.id)).toEqual(['readable-cat'])
    const scan = await whichShardHoldsSign('readable-cat', 3)
    expect(entriesIn(cut, cut.scanNames[scan]).map(row => row.id)).toEqual(['readable-cat'])
  })
})
