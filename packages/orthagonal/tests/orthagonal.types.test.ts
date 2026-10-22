// Characterisation tests for encoded-search-data validation, including what it currently lets through.
import { expect, describe, it } from 'vitest'
import { validateEncodedSearchDataEntry, isEncodedSearchDataEntry, isSearchDataEncodedMedia, isSearchDataEncode } from '../src/types.ts'
import { media } from '@andypalmer/test-helpers/fixtures.ts'

const valid = () => ({ id: 'a', title: 'A', words: ['a'], body: '', media: [media('a')], tags: [] })

describe('validateEncodedSearchDataEntry()', () => {
  it('accepts a complete entry', () => {
    expect(() => validateEncodedSearchDataEntry(valid() as any)).not.toThrow()
  })

  it.each([
    ['id', 'entry does not have an id string'],
    ['words', 'entry does not have a words array'],
    ['title', 'entry does not have a title string'],
    ['body', 'entry does not have a body string'],
    ['media', 'entry does not have a media array'],
  ])('rejects a missing %s', (field, message) => {
    const entry: { [field: string]: any } = valid()
    delete entry[field]
    expect(() => validateEncodedSearchDataEntry(entry as any)).toThrow(message)
  })

  it('GAP: accepts an empty media array, which crashes the search results Carousel', () => {
    expect(isEncodedSearchDataEntry({ ...valid(), media: [] })).toBe(true)
  })

  it('GAP: does not check tags, link, provider, author or timestamp', () => {
    expect(isEncodedSearchDataEntry({ ...valid(), tags: 'nope', timestamp: 'yesterday', provider: 7 })).toBe(true)
  })
})

describe('media validation', () => {
  it('rejects unknown media types and missing thumbnails', () => {
    expect(isSearchDataEncodedMedia({ ...media('a'), type: 'image' })).toBe(false)
    const noThumb: any = media('a')
    delete noThumb.thumbnail
    expect(isSearchDataEncodedMedia(noThumb)).toBe(false)
  })

  it('GAP: media without an encodes array is reported valid (validator returns false instead of throwing)', () => {
    const noEncodes: any = media('a')
    delete noEncodes.encodes
    expect(isSearchDataEncodedMedia(noEncodes)).toBe(true)
  })

  it('GAP: media with an empty encodes array is valid', () => {
    expect(isSearchDataEncodedMedia({ ...media('a'), encodes: [] })).toBe(true)
  })

  it('checks encode mime type, container, codec and a positive duration', () => {
    const encode = media('a').encodes[0]
    expect(isSearchDataEncode(encode)).toBe(true)
    expect(isSearchDataEncode({ ...encode, type: 'video/quicktime' })).toBe(false)
    expect(isSearchDataEncode({ ...encode, container: 'mov' })).toBe(false)
    expect(isSearchDataEncode({ ...encode, codec: 'prores' })).toBe(false)
    expect(isSearchDataEncode({ ...encode, duration: 0 })).toBe(false)
  })
})
