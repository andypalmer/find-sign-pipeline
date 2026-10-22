import { expect, describe, it } from 'vitest'
import type { EncodedSearchData, EncodedSearchDataEntry } from '@andypalmer/orthagonal'
import { mergeIdenticalMedia } from '../src/merge.ts'

const hash = (n: number) => String(n).repeat(64).slice(0, 64)
function entry (id: string, extra: Partial<EncodedSearchDataEntry> & { hashes?: (string | undefined)[] } = {}): EncodedSearchDataEntry {
  const { hashes = [hash(1)], ...rest } = extra
  return {
    id, title: id, words: [id], tags: [], body: '', timestamp: 1000,
    media: hashes.map(sourceSha256 => ({ type: 'video', source: { method: 'fetch', url: `${id}.mp4`, version: '1' }, timestamp: 0, thumbnail: `${id}.webp`, encodes: [], ...(sourceSha256 && { sourceSha256 }) })),
    ...rest,
  }
}
const of = (...entries: EncodedSearchDataEntry[]): EncodedSearchData => Object.fromEntries(entries.map(e => [e.id, e]))

describe('mergeIdenticalMedia()', () => {
  it('merges signs with identical videos into the oldest, with both words and tags, the others\' ids as aliases', () => {
    const { data, merged } = mergeIdenticalMedia(of(
      entry('love-2', { tags: ['verb', 'beginners'], aliases: ['10868'] }),
      entry('love', { tags: ['noun', 'generalities'], aliases: ['4058'] }),
      entry('hate', { hashes: [hash(2)] }),
    ))
    expect(Object.keys(data)).toEqual(['love', 'hate'])
    expect(data.love).toMatchObject({ tags: ['noun', 'generalities', 'verb', 'beginners'], aliases: ['4058', 'love-2', '10868'], words: ['love', 'love-2'] })
    expect(merged).toEqual(new Map([['love', ['love-2']]]))
  })

  it('keeps the earliest added, then the lowest id', () => {
    expect(Object.keys(mergeIdenticalMedia(of(entry('a'), entry('b', { timestamp: 500 }))).data)).toEqual(['b'])
    expect(Object.keys(mergeIdenticalMedia(of(entry('x-10'), entry('x-9'))).data)).toEqual(['x-9'])
  })

  it('only merges signs whose every video is known to be the same', () => {
    const data = of(
      entry('a', { hashes: [hash(1), hash(2)] }),
      entry('b', { hashes: [hash(1)] }),
      entry('c', { hashes: [undefined] }),
      entry('d', { hashes: [undefined] }),
      entry('e', { hashes: [] }),
      entry('f', { hashes: [] }),
    )
    expect(Object.keys(mergeIdenticalMedia(data).data)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })
})
