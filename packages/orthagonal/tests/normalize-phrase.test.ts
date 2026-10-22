import { expect, describe, it } from 'vitest'
import { normalizePhrase } from '../src/index.ts'

describe('normalizePhrase()', () => {
  it('matches a phrase whoever it\'s about, ignoring case, punctuation, and a leading "to" or "(be)"', () => {
    expect(normalizePhrase('Blow your top!')).toBe("blow one's top")
    expect(normalizePhrase("blow one’s top")).toBe("blow one's top")
    expect(normalizePhrase('to kill time')).toBe('kill time')
    expect(normalizePhrase('(be) all at sea')).toBe('all at sea')
    expect(normalizePhrase("'Been there, done that!'")).toBe('been there done that')
    expect(normalizePhrase('worry yourself sick')).toBe('worry oneself sick')
    expect(normalizePhrase('pull somebody\'s leg')).toBe("pull someone's leg")
  })
})
