import { expect, describe, it } from 'vitest'
import { readableId, slugify, slugPattern } from '../src/index.ts'
import { sign } from './fixtures.ts'

const none = new Set<string>()

describe('slugify()', () => {
  it('makes lowercase ascii words joined by hyphens', () => {
    expect(slugify('Gin + Tonic')).toBe('gin-tonic')
    expect(slugify('Café, Résumé!')).toBe('cafe-resume')
    expect(slugify('  THIS is the Way ')).toBe('this-is-the-way')
    expect(slugify('Able  -')).toBe('able')
  })

  it('cuts at a word boundary, or cuts a single long word', () => {
    expect(slugify('one two three', 9)).toBe('one-two')
    expect(slugify('abcdefghij', 4)).toBe('abcd')
  })

  it('gives nothing for text without letters or digits', () => {
    expect(slugify('—?!')).toBe('')
  })
})

describe('readableId()', () => {
  it('uses the first term of the title', () => {
    expect(readableId(sign('aeroplane', { title: 'airplane, aeroplane, plane, aircraft' }), none)).toBe('airplane')
    expect(readableId(sign('B8p5mqmnNek', { title: 'hello.' }), none)).toBe('hello')
  })

  it('tells a homonym apart by its second term, then by number', () => {
    expect(readableId(sign('bank1a', { title: 'bank, deposit' }), new Set(['bank']))).toBe('bank-deposit')
    expect(readableId(sign('x', { title: 'bank, deposit' }), new Set(['bank', 'bank-deposit']))).toBe('bank-2')
    expect(readableId(sign('x', { title: 'Air' }), new Set(['air', 'air-2']))).toBe('air-3')
  })

  it('prefers a slug the spider suggests', () => {
    expect(readableId(sign('20451', { title: 'Alcoholic, drunk', slug: 'alcoholic' }), none)).toBe('alcoholic')
  })

  it('falls back to the kind for a title with no letters or digits', () => {
    expect(readableId(sign('x', { title: '?!' }), none)).toBe('sign')
    expect(readableId(sign('x', { title: '…', kind: 'phrase' }), new Set(['phrase']))).toBe('phrase-2')
  })

  it('always gives a valid id', () => {
    for (const title of ['Gin + Tonic', 'a'.repeat(80), '12 o\'clock', 'Ü']) {
      expect(readableId(sign('x', { title }), none)).toMatch(slugPattern)
    }
  })
})
