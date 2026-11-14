import { describe, expect, it } from 'vitest'
import { build, parse } from '@andypalmer/vectors'
import { cutVectors, type CutVectors } from '../src/cut-vectors.ts'
import { looksContentNamed, nameFileAfterItsBytes } from '../src/content-name.ts'
import { whichBucketHoldsWord } from '../src/placement.ts'

const words = Array.from({ length: 300 }, (_, n) => `word${n}`)
const vectorOf = (word: string) => [0.1 + word.length / 100, -0.5, 0.25, word.charCodeAt(word.length - 1) / 200]
const vectorsFor = (names: string[]) => Object.fromEntries(names.map(word => [word, vectorOf(word)]))

const wordsIn = (cut: CutVectors, fileName: string) => [...parse(cut.files[fileName])].map(entry => entry.word)
const differences = (a: CutVectors, b: CutVectors) => a.vectorNames.filter((name, number) => name !== b.vectorNames[number]).length

describe('cutVectors()', () => {
  it('makes one .lps file per bucket number, listed in bucket order, each named after its own bytes', async () => {
    const cut = await cutVectors(vectorsFor(words), { bucketCount: 16 })
    expect(cut.vectorNames).toHaveLength(16)
    for (const [number, fileName] of cut.vectorNames.entries()) {
      expect(fileName.startsWith(`vectors-${number}.`)).toBe(true)
      expect(fileName.endsWith('.lps')).toBe(true)
      expect(looksContentNamed(fileName)).toBe(true)
      expect(fileName).toBe(await nameFileAfterItsBytes(`vectors-${number}`, 'lps', cut.files[fileName]))
    }
  })

  it('uses 64 buckets when we don\'t say', async () => {
    expect((await cutVectors(vectorsFor(words))).vectorNames).toHaveLength(64)
  })

  it('puts each word in exactly one bucket, the one its hash picks, with the vector it came with', async () => {
    const input = vectorsFor(words)
    const cut = await cutVectors(input, { bucketCount: 16 })
    const seen: string[] = []
    for (const [number, fileName] of cut.vectorNames.entries()) {
      for (const { word, getVector } of parse(cut.files[fileName])) {
        expect(await whichBucketHoldsWord(word, 16)).toBe(number)
        // the same packed vector the vectors package makes for that word alone
        const [alone] = [...parse(build({ [word]: input[word] }))]
        expect(Array.from(getVector())).toEqual(Array.from(alone.getVector()))
        seen.push(word)
      }
    }
    expect(seen.sort()).toEqual([...words].sort())
  })

  it('sorts the words in a bucket, whatever order they were given in', async () => {
    const cut = await cutVectors(vectorsFor([...words].reverse()), { bucketCount: 3 })
    for (const fileName of cut.vectorNames) {
      const inBucket = wordsIn(cut, fileName)
      expect(inBucket.length).toBeGreaterThan(1)
      expect(inBucket).toEqual([...inBucket].sort())
    }
  })

  it('makes the same bytes for the same words, however they were ordered', async () => {
    const a = await cutVectors(vectorsFor(words), { bucketCount: 8 })
    const b = await cutVectors(vectorsFor([...words].reverse()), { bucketCount: 8 })
    expect(b.vectorNames).toEqual(a.vectorNames)
  })

  it('changes only one bucket\'s name when a word is added', async () => {
    const before = await cutVectors(vectorsFor(words), { bucketCount: 64 })
    const after = await cutVectors(vectorsFor([...words, 'brand-new-word']), { bucketCount: 64 })
    expect(differences(before, after)).toBe(1)
  })

  it('still makes a file for a bucket that holds no words, so every bucket number has a name', async () => {
    const cut = await cutVectors(vectorsFor(['cat']), { bucketCount: 20 })
    expect(cut.vectorNames).toHaveLength(20)
    expect(cut.vectorNames.filter(fileName => wordsIn(cut, fileName).length > 0)).toHaveLength(1)
  })

  it('has no file that is not a listed bucket', async () => {
    const cut = await cutVectors(vectorsFor(words), { bucketCount: 5 })
    expect(Object.keys(cut.files).sort()).toEqual([...cut.vectorNames].sort())
  })

  it('copes with no words at all', async () => {
    const cut = await cutVectors({}, { bucketCount: 4 })
    expect(cut.vectorNames).toHaveLength(4)
    for (const fileName of cut.vectorNames) expect(wordsIn(cut, fileName)).toEqual([])
  })

  it('refuses a bucket count that is not a whole number above zero', async () => {
    for (const bad of [0, -1, 2.5, NaN]) {
      await expect(cutVectors(vectorsFor(['cat']), { bucketCount: bad })).rejects.toThrow(/bucket count/i)
    }
  })
})
