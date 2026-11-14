import { describe, expect, it } from 'vitest'
import { howManyScans, howManyShards, nextScanCount, nextShardCount } from '../src/cut-signs.ts'
import { whichShardHoldsSign } from '../src/placement.ts'

describe('nextShardCount()', () => {
  it('picks a count from the number of signs when the index has never been built', () => {
    for (const signCount of [0, 1, 500, 5172, 17663]) {
      expect(nextShardCount(undefined, signCount)).toBe(howManyShards(signCount))
    }
  })

  it('keeps the old count as signs come and go, so no sign moves', () => {
    // 324 shards is exactly full at 16 signs each; one more sign used to ask for a 325th
    expect(nextShardCount(324, 5184)).toBe(324)
    expect(nextShardCount(324, 5187)).toBe(324)
    expect(nextShardCount(324, 5100)).toBe(324)
  })

  it('keeps the old count right up to twice the target of 16 signs a shard', () => {
    expect(nextShardCount(324, 324 * 32)).toBe(324)
  })

  it('doubles the count once the average shard holds more than twice the target', () => {
    expect(nextShardCount(324, 324 * 32 + 1)).toBe(648)
  })

  it('doubles as many times as it takes when the index has grown a lot at once', () => {
    // 1,000 signs over 2 shards: 2 -> 4 -> 8 -> 16 -> 32 shards, and 1,000 / 32 is under 32 each
    expect(nextShardCount(2, 1000)).toBe(32)
  })

  it('never shrinks, however many signs have gone', () => {
    expect(nextShardCount(324, 10)).toBe(324)
    expect(nextShardCount(324, 0)).toBe(324)
  })

  it('only ever gives the old count times a power of two, so every old shard splits cleanly', () => {
    for (const previous of [1, 3, 324, 1000]) {
      for (const signCount of [0, 40, 5000, 100000, 3000000]) {
        const ratio = nextShardCount(previous, signCount) / previous
        expect(Number.isInteger(ratio) && Math.log2(ratio) % 1 === 0, `${previous} -> ${nextShardCount(previous, signCount)}`).toBe(true)
      }
    }
  })

  it('never leaves an average shard holding more than twice the target', () => {
    for (const previous of [1, 7, 324]) {
      for (const signCount of [0, 40, 5000, 100000]) {
        expect(signCount / nextShardCount(previous, signCount)).toBeLessThanOrEqual(32)
      }
    }
  })

  it('splits each old shard in two when it doubles: a sign stays or moves up by the old count, nowhere else', async () => {
    const old = 37
    const doubled = nextShardCount(old, old * 32 + 1)
    expect(doubled).toBe(old * 2)
    for (let n = 0; n < 500; n++) {
      const before = await whichShardHoldsSign(`sign-${n}`, old)
      const after = await whichShardHoldsSign(`sign-${n}`, doubled)
      expect([before, before + old]).toContain(after)
    }
  })

  it('refuses an old count that is not a whole number above zero, and a sign count that is not a whole number', () => {
    for (const bad of [0, -2, 1.5, NaN, Infinity]) expect(() => nextShardCount(bad, 100)).toThrow(/shard count/i)
    for (const bad of [-1, 2.5, NaN]) expect(() => nextShardCount(10, bad)).toThrow(/sign count/i)
  })
})

describe('nextScanCount()', () => {
  it('picks a count from the number of signs when the index has never been built', () => {
    for (const signCount of [0, 1300, 5172, 17663]) expect(nextScanCount(undefined, signCount)).toBe(howManyScans(signCount))
  })

  it('keeps the old count until the average scan file holds more than twice the target of 1,300 signs, then doubles', () => {
    expect(nextScanCount(4, 5300)).toBe(4) // one past the 5,200 that used to ask for a fifth
    expect(nextScanCount(4, 4 * 2600)).toBe(4)
    expect(nextScanCount(4, 4 * 2600 + 1)).toBe(8)
  })

  it('never shrinks', () => {
    expect(nextScanCount(4, 10)).toBe(4)
  })

  it('refuses an old count that is not a whole number above zero', () => {
    for (const bad of [0, -1, 2.5, NaN]) expect(() => nextScanCount(bad, 100)).toThrow(/scan count/i)
  })
})
