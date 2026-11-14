import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { whichBucketHoldsWord, whichShardHoldsSign } from '../src/placement.ts'

// worked out separately from the code under test: the first four bytes of the SHA-256, read as one number
function firstFourBytesOfSha256 (text: string): number {
  return createHash('sha256').update(text).digest().readUInt32BE(0)
}

const someIds = ['cat', 'dog', 'auslan-signbank/BOY.NTH', 'spread-the-sign/kick the bucket', 'ü', '', 'a'.repeat(500)]

describe('whichShardHoldsSign()', () => {
  it('uses the first four bytes of the id\'s SHA-256, modulo the shard count', async () => {
    for (const id of someIds) {
      for (const shardCount of [1, 7, 64, 1100]) {
        expect(await whichShardHoldsSign(id, shardCount)).toBe(firstFourBytesOfSha256(id) % shardCount)
      }
    }
  })

  it('always answers a whole number from 0 up to, but not including, the shard count', async () => {
    for (const id of someIds) {
      const shard = await whichShardHoldsSign(id, 1100)
      expect(Number.isInteger(shard)).toBe(true)
      expect(shard).toBeGreaterThanOrEqual(0)
      expect(shard).toBeLessThan(1100)
    }
  })

  it('gives the same answer for the same id, whatever else is in the index', async () => {
    expect(await whichShardHoldsSign('cat', 1100)).toBe(await whichShardHoldsSign('cat', 1100))
  })

  it('spreads many ids across most of the shards', async () => {
    const used = new Set<number>()
    for (let n = 0; n < 2000; n++) used.add(await whichShardHoldsSign(`sign-${n}`, 100))
    expect(used.size).toBeGreaterThan(90)
  })

  it('refuses a shard count that is not a whole number above zero', async () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      await expect(whichShardHoldsSign('cat', bad)).rejects.toThrow(/shard count/i)
    }
  })
})

describe('whichBucketHoldsWord()', () => {
  it('uses the first four bytes of the word\'s SHA-256, modulo the bucket count', async () => {
    for (const word of ['cat', 'kitten', 'ü', '']) {
      expect(await whichBucketHoldsWord(word, 64)).toBe(firstFourBytesOfSha256(word) % 64)
      expect(await whichBucketHoldsWord(word, 10)).toBe(firstFourBytesOfSha256(word) % 10)
    }
  })

  it('uses 64 buckets when we don\'t say', async () => {
    expect(await whichBucketHoldsWord('kitten')).toBe(await whichBucketHoldsWord('kitten', 64))
  })

  it('refuses a bucket count that is not a whole number above zero', async () => {
    for (const bad of [0, -3, 2.5, NaN]) {
      await expect(whichBucketHoldsWord('cat', bad)).rejects.toThrow(/bucket count/i)
    }
  })
})
