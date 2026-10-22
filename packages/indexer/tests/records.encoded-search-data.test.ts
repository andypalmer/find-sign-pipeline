// Converting today's encoded-search-data files to record files and back, using the characterisation fixtures.
import { expect, describe, it } from 'vitest'
import { validateRecordFile } from '@andypalmer/records'
import { alphaSearchData, betaSearchData, media } from '@andypalmer/test-helpers/fixtures.ts'
import { encodedSearchDataFromRecordFile, recordFileFromEncodedSearchData } from '../src/records.ts'
import { withSearchDataDefaults } from '../src/encoded-search-data.ts'

const seenAt = '2026-10-20T00:00:00.000Z'
const convert = (raw: any, provider = 'alpha') => recordFileFromEncodedSearchData(raw, { provider, seenAt, locale: 'en-AU' })

describe('recordFileFromEncodedSearchData()', () => {
  it('makes a valid record file, with the provider details from its entries', async () => {
    const file = await convert(alphaSearchData())
    expect(() => validateRecordFile(file)).not.toThrow()
    expect(file.provider).toEqual({ id: 'alpha', name: 'Alpha Dictionary', verb: 'documented', link: 'https://alpha.test/' })
    expect(file.records.map(r => r.sourceId)).toEqual(['car', 'cat', 'dog', 'hidden'])
  })

  it('gives each record a readable id from its title, keeping an old key that differs as an alias', async () => {
    const beta = (await convert(betaSearchData(), 'beta')).records
    expect(beta.map(r => [r.sourceId, r.id, r.aliases])).toEqual([['kitten', 'kitten', undefined], ['red-truck', 'red-truck', undefined]])
    const records = (await convert({
      'air1b': { title: 'air, breeze, mood', media: [], timestamp: 2000 },
      'air2a': { title: 'Air', media: [], timestamp: 1000 },
      'ZA0L3BZogQc-start=2.3': { title: 'My', media: [], timestamp: 3000 },
    })).records
    // the older of the two "air" signs gets the plain id, the other its first two terms
    expect(records.map(r => [r.sourceId, r.id, r.aliases])).toEqual([
      ['air2a', 'air', ['air2a']], ['air1b', 'air-breeze', ['air1b']], ['ZA0L3BZogQc-start=2.3', 'my', ['ZA0L3BZogQc-start=2.3']],
    ])
  })

  it('never gives a sign an id that is another sign\'s old permalink', async () => {
    const records = (await convert({ 'x1': { title: 'Cat', media: [], timestamp: 1000 }, 'cat': { title: 'Kitty', media: [], timestamp: 2000 } })).records
    expect(records.map(r => [r.sourceId, r.id])).toEqual([['x1', 'cat-2'], ['cat', 'kitty']])
  })

  it('takes first seen from the entry timestamp, and last seen from the conversion', async () => {
    const cat = (await convert(alphaSearchData())).records.find(r => r.id === 'cat')!
    expect(cat.provenance).toMatchObject({ firstSeen: new Date(3000).toISOString(), lastChanged: new Date(3000).toISOString(), lastSeen: seenAt, status: 'present', missingRuns: 0 })
    const redTruck = (await convert(betaSearchData(), 'beta')).records.find(r => r.id === 'red-truck')!
    expect(redTruck.provenance.firstSeen).toBe(seenAt)
  })

  it('keeps unpublished entries, clippings, and media urls relative to the file', async () => {
    const raw = alphaSearchData()
    raw.dog.media[0].source = { ...raw.dog.media[0].source, clipping: { start: 1.5, end: 3 } } as any
    const records = (await convert(raw)).records
    const hidden = records.find(r => r.id === 'hidden')!
    expect(hidden.published).toBe(false)
    const dog = records.find(r => r.id === 'dog')!
    expect(dog.media[0].source.clipping).toEqual({ start: 1.5, end: 3 })
    expect(dog.media[0].encoded!.thumbnail).toBe('dog-media/dog-0.webp')
  })

  it('fixes and reports what the record schema does not allow: null versions, clippings ending before they start', async () => {
    const raw = alphaSearchData()
    raw.cat.media[0].source = { ...raw.cat.media[0].source, version: null } as any
    raw.dog.media[0].source = { ...raw.dog.media[0].source, clipping: { start: 29.8, end: 21.7 } } as any
    const quirks: { id: string, message: string }[] = []
    const records = (await recordFileFromEncodedSearchData(raw as any, { provider: 'alpha', seenAt, onQuirk: quirk => quirks.push(quirk) })).records
    expect(quirks.map(q => q.id).sort()).toEqual(['cat', 'dog'])
    expect(records.find(r => r.id === 'cat')!.media[0].source.version).toBeUndefined()
    expect(records.find(r => r.id === 'dog')!.media[0].source.clipping).toEqual({ start: 29.8 })
  })

  it('applies the same defaults as readEncodedSearchData, such as words from the title', async () => {
    const [entry] = (await convert({ a: { title: 'Hello, big world!', media: [media('a')] } })).records
    expect(entry).toMatchObject({ sourceId: 'a', id: 'hello', words: ['Hello', 'big', 'world'], tags: [], body: '' })
  })
})

describe('encodedSearchDataFromRecordFile()', () => {
  it('gives back what readEncodedSearchData would read from the original, before resolving urls', async () => {
    for (const [provider, raw] of [['alpha', alphaSearchData()], ['beta', betaSearchData()]] as const) {
      const expected = withSearchDataDefaults(structuredClone(raw) as any, 'en-AU')
      // an entry without a timestamp gains the conversion time, as that's when it was first seen
      for (const entry of Object.values(expected)) entry.timestamp ??= Date.parse(seenAt)
      expect(encodedSearchDataFromRecordFile(await convert(raw, provider), { keys: 'sourceId' })).toEqual(expected)
    }
  })

  it('keeps the English phrases a sign translates', async () => {
    const file = await convert({ 'die': { title: 'die', media: [], timestamp: 1000, englishPhrases: ['kick the bucket', 'pass away'] }, 'cat': { title: 'Cat', media: [], timestamp: 1000, englishPhrases: [] } })
    expect(file.records.find(r => r.sourceId === 'die')!.englishPhrases).toEqual(['kick the bucket', 'pass away'])
    expect(file.records.find(r => r.sourceId === 'cat')!.englishPhrases).toBeUndefined()
    expect(encodedSearchDataFromRecordFile(file, { keys: 'sourceId' }).die.englishPhrases).toEqual(['kick the bucket', 'pass away'])
  })

  it('keeps the source\'s dates', async () => {
    const file = await convert({ 'cat': { title: 'Cat', media: [], timestamp: 1000, sourceCreated: Date.parse('2020-01-02T00:00:00.000Z'), sourceUpdated: Date.parse('2021-03-04T00:00:00.000Z') } })
    expect(file.records[0]).toMatchObject({ sourceCreated: '2020-01-02T00:00:00.000Z', sourceUpdated: '2021-03-04T00:00:00.000Z' })
    expect(encodedSearchDataFromRecordFile(file, { keys: 'sourceId' }).cat).toMatchObject({ sourceCreated: Date.parse('2020-01-02T00:00:00.000Z'), sourceUpdated: Date.parse('2021-03-04T00:00:00.000Z') })
  })

  it('can key entries by readable id instead', async () => {
    const file = await convert({ 'air1b': { title: 'air, breeze', media: [], timestamp: 1000 } })
    expect(Object.keys(encodedSearchDataFromRecordFile(file, { keys: 'id' }))).toEqual(['air'])
  })

  it('leaves out removed records and media the encoder has not reached', async () => {
    const file = await convert(alphaSearchData())
    const record = (id: string) => file.records.find(r => r.id === id)!
    record('cat').provenance.status = 'removed'
    delete record('dog').media[0].encoded
    const data = encodedSearchDataFromRecordFile(file, { keys: 'sourceId' })
    expect(Object.keys(data)).toEqual(['dog', 'car', 'hidden'])
    expect(data.dog.media).toEqual([])
  })
})
