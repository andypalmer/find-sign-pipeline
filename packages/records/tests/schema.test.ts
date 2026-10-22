import { expect, describe, it } from 'vitest'
import { RecordValidationError, validateContent, validateRecord } from '../src/index.ts'
import { encodedVideo, sign } from './fixtures.ts'

const issues = (fn: () => unknown) => {
  try { fn() } catch (err) { if (err instanceof RecordValidationError) return err.issues }
  throw new Error('expected a RecordValidationError')
}

describe('record content', () => {
  it('accepts a sign with only the required fields', () => {
    expect(validateContent(sign('cat'))).toEqual(sign('cat'))
  })

  it('accepts a phrase with a meaning, provider dates, and relative or absolute urls', () => {
    const phrase = sign('break-a-leg', {
      kind: 'phrase', title: 'Break a leg', words: ['break', 'a', 'leg'], meaning: ['good luck'],
      link: 'https://idioms.test/break-a-leg', nav: [['Idioms', '../']],
      sourceCreated: '2025-03-01T00:00:00.000Z', sourceUpdated: '2026-02-01T12:30:00.000Z',
    })
    expect(validateContent(phrase)).toEqual(phrase)
  })

  it('names every problem and where it is', () => {
    const found = issues(() => validateContent({ ...sign('cat'), title: '', words: ['ok', ''], kind: 'gesture' }))
    expect(found.map(x => x.path).sort()).toEqual(['kind', 'title', 'words.1'])
  })

  it('rejects unknown fields, so a misspelt field is caught rather than dropped', () => {
    expect(issues(() => validateContent({ ...sign('cat'), titel: 'Cat' }))[0].path).toBe('titel')
  })

  it('checks clipping ranges and encodes', () => {
    const clipped = sign('cat', { media: [{ type: 'video', source: { url: 'v.mp4', clipping: { start: 4, end: 2 } } }] })
    expect(issues(() => validateContent(clipped))[0].message).toBe('clipping end must be after its start')
    const media = encodedVideo('cat')
    media.encoded!.encodes[0].duration = 0
    expect(issues(() => validateContent(sign('cat', { media: [media] })))[0].path).toBe('media.0.encoded.encodes.0.duration')
  })

  it('requires a readable id and provenance on a full record', () => {
    expect(issues(() => validateRecord(sign('cat'))).map(x => x.path)).toEqual(['id', 'provenance'])
  })

  it('only accepts lowercase words joined by hyphens as ids and suggested slugs', () => {
    expect(issues(() => validateContent(sign('cat', { slug: 'Big Cat' })))[0].path).toBe('slug')
    expect(() => validateContent(sign('cat', { slug: 'big-cat-2' }))).not.toThrow()
  })
})
