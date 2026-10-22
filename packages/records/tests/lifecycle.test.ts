import { expect, describe, it } from 'vitest'
import { firstObservation, keepEncodings, markMissing, nextObservation, reconcile, type SignRecord } from '../src/index.ts'
import { encodedVideo, sign, video } from './fixtures.ts'

const day = (n: number) => ({ at: `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z` })

describe('firstObservation()', () => {
  it('starts a sign at the id given, present, first and last seen now', async () => {
    const record = await firstObservation(sign('cat'), 'cat', day(1))
    expect(record).toMatchObject({ id: 'cat', sourceId: 'cat' })
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastSeen: day(1).at, lastChanged: day(1).at, status: 'present', missingRuns: 0 })
  })
})

describe('nextObservation()', () => {
  it('keeps firstSeen and lastChanged for an unchanged sign, moving only lastSeen', async () => {
    const first = await firstObservation(sign('cat'), 'cat', day(1))
    const { record, change } = await nextObservation(first, sign('cat'), day(2))
    expect(change).toBe('unchanged')
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastSeen: day(2).at, lastChanged: day(1).at })
  })

  it('records the run a sign changed in, keeping its id and aliases', async () => {
    const first = { ...await firstObservation(sign('cat'), 'cat', day(1)), aliases: ['cat1a'] }
    const { record, change } = await nextObservation(first, sign('cat', { title: 'Kitty' }), day(2))
    expect(change).toBe('changed')
    expect(record).toMatchObject({ id: 'cat', aliases: ['cat1a'], title: 'Kitty' })
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastChanged: day(2).at })
  })

  it('brings a missing sign back as returned', async () => {
    const missing = markMissing(await firstObservation(sign('cat'), 'cat', day(1))).record
    const { record, change } = await nextObservation(missing, sign('cat'), day(3))
    expect(change).toBe('returned')
    expect(record.provenance).toMatchObject({ status: 'present', missingRuns: 0 })
  })

  it('keeps encodes for media whose source is unchanged', async () => {
    const first = await firstObservation(sign('cat', { media: [encodedVideo('cat')] }), 'cat', day(1))
    const { record } = await nextObservation(first, sign('cat'), day(2))
    expect(record.media[0].encoded).toEqual(encodedVideo('cat').encoded)
  })

  it('refuses content for a different sign', async () => {
    const first = await firstObservation(sign('cat'), 'cat', day(1))
    await expect(nextObservation(first, sign('dog'), day(2))).rejects.toThrow('different sign')
  })
})

describe('markMissing()', () => {
  it('counts missed runs, removing the sign when the policy says', async () => {
    let record: SignRecord = await firstObservation(sign('cat'), 'cat', day(1))
    const changes = []
    for (let run = 0; run < 3; run++) {
      const result = markMissing(record, { removal: { removeAfterMissingRuns: 2 } })
      record = result.record
      changes.push(result.change)
    }
    expect(changes).toEqual(['missing', 'removed', 'removed'])
    expect(record.provenance).toMatchObject({ status: 'removed', missingRuns: 2, lastSeen: day(1).at })
  })
})

describe('keepEncodings()', () => {
  it('drops encodes when the source changes, so the media is encoded again', () => {
    expect(keepEncodings([encodedVideo('cat', '1')], [video('cat', '2')])).toEqual([video('cat', '2')])
  })
})

describe('reconcile()', () => {
  it('sorts a run into new, changed, unchanged, returned, missing and removed', async () => {
    const before = (await reconcile([], [sign('cat'), sign('dog'), sign('car'), sign('emu')], day(1))).records
    const later = (await reconcile(before, [sign('cat'), sign('dog'), sign('car')], day(2), { removal: { removeAfterMissingRuns: 3 } })).records
    const { records, changes } = await reconcile(later, [sign('cat'), sign('dog', { title: 'Hound' }), sign('emu'), sign('fox')], day(3), { removal: { removeAfterMissingRuns: 1 } })
    expect(changes).toEqual({ new: ['fox'], changed: ['dog'], unchanged: ['cat'], returned: ['emu'], missing: [], removed: ['car'] })
    expect(records.map(r => r.id)).toEqual(['car', 'cat', 'dog', 'emu', 'fox'])
  })

  it('matches signs by sourceId, so a new title keeps the old id', async () => {
    const before = (await reconcile([], [sign('v1', { title: 'Cat' })], day(1))).records
    const { records } = await reconcile(before, [sign('v1', { title: 'Kitty' })], day(2))
    expect(records.map(r => [r.id, r.title])).toEqual([['cat', 'Kitty']])
  })

  it('never reuses an id or alias, even after its sign is removed', async () => {
    const removed = { ...await firstObservation(sign('v1', { title: 'Cat' }), 'cat', day(1)), aliases: ['dog'] }
    removed.provenance.status = 'removed'
    const { records } = await reconcile([removed], [sign('v2', { title: 'Cat' }), sign('v3', { title: 'Dog' })], day(2))
    expect(records.map(r => [r.sourceId, r.id])).toEqual([['v1', 'cat'], ['v2', 'cat-2'], ['v3', 'dog-2']])
  })

  it('keeps new signs\' old permalinks as aliases, which no other sign can be given', async () => {
    // the old data called "3" scissors, and "1" a different sign from the one now titled "1"
    const formerIds = (content: { sourceId: string }) => ({ '3': ['3'], '25632': ['1'] } as Record<string, string[]>)[content.sourceId]
    const { records } = await reconcile([], [sign('15329', { title: '1' }), sign('3', { title: 'Scissors' }), sign('25632', { title: 'Easy' })], day(1), { formerIds })
    expect(records.map(r => [r.sourceId, r.id, r.aliases])).toEqual([['15329', '1-2', undefined], ['25632', 'easy', ['1']], ['3', 'scissors', ['3']]])
    // a sign may take its own old permalink as its id
    const own = await reconcile([], [sign('cat', { title: 'Cat' })], day(1), { formerIds: () => ['cat'] })
    expect(own.records.map(r => [r.id, r.aliases])).toEqual([['cat', undefined]])
  })

  it('uses the id policy it is given, and refuses one that picks a taken id', async () => {
    const byPosition = (_: unknown, taken: ReadonlySet<string>) => `sign-${taken.size + 1}`
    const { records } = await reconcile([], [sign('a'), sign('b')], day(1), { ids: byPosition })
    expect(records.map(r => r.id)).toEqual(['sign-1', 'sign-2'])
    await expect(reconcile(records, [sign('c')], day(2), { ids: () => 'sign-1' })).rejects.toThrow('already taken')
  })

  it('refuses a run that found the same sourceId twice', async () => {
    await expect(reconcile([], [sign('cat'), sign('cat')], day(1))).rejects.toThrow('"cat" more than once')
  })
})
