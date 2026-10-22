import { expect, describe, it } from 'vitest'
import { canonicalTag, mappings, mapTags, vocabulary } from '../src/index.ts'

const namespaces = new Set(vocabulary.flatMap(tag => tag.id.includes('.') ? [tag.id.split('.')[0]] : []))

describe('the vocabulary', () => {
  it('has each tag once, written as Find Sign writes tags', () => {
    const ids = vocabulary.map(tag => tag.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)?$/)
  })

  it('labels every tag', () => {
    expect(canonicalTag('semantic.language-act')).toEqual({ id: 'semantic.language-act', label: 'language act', from: 'signbank' })
    expect(canonicalTag('nsw')).toMatchObject({ label: 'New South Wales', from: 'find-sign' })
    expect(canonicalTag('sts.profanity-slang')).toBeUndefined()
  })
})

describe('the mappings', () => {
  it('map only to tags in the vocabulary', () => {
    for (const mapping of mappings.values()) {
      for (const [tag, canonical] of Object.entries(mapping.rules ?? {})) {
        for (const id of canonical) expect(canonicalTag(id), `${mapping.provider}: ${tag} → ${id}`).toBeDefined()
      }
    }
  })

  it('keep providers\' tags apart from the vocabulary\'s', () => {
    for (const mapping of mappings.values()) {
      expect(namespaces.has(mapping.namespace), mapping.namespace).toBe(false)
      for (const tag of mapping.own) expect(canonicalTag(tag), tag).toBeUndefined()
    }
    const used = [...mappings.values()].map(mapping => mapping.namespace)
    expect(new Set(used).size).toBe(used.length)
  })
})

describe('mapTags()', () => {
  it('keeps a provider\'s tags in its namespace, adding the vocabulary tags its rules give', () => {
    expect(mapTags(mappings.get('spread-the-sign-auslan')!, ['spread-the-sign', 'interjection', 'language', 'profanity-slang']))
      .toEqual(['spread-the-sign', 'sts.interjection', 'pos.interjection', 'sts.language', 'sts.profanity-slang'])
  })

  it('gives a tag the same vocabulary tag once, however many of its tags mean it', () => {
    expect(mapTags(mappings.get('spread-the-sign-auslan')!, ['noun', 'nouns'])).toEqual(['sts.noun', 'pos.noun', 'sts.nouns'])
  })

  it('keeps the vocabulary\'s names as they are, for providers that use them, and leaves out what it\'s told to', () => {
    expect(mapTags(mappings.get('auslan-signbank')!, ['auslan-signbank', 'sa', 'lexis.regional', 'b92.regional', 'workflow.redo-video']))
      .toEqual(['auslan-signbank', 'sa', 'lexis.regional', 'signbank.b92.regional'])
    expect(mapTags(mappings.get('asphyxia')!, ['asphyxia', 'vic', 'fingerspelling']))
      .toEqual(['asphyxia', 'vic', 'asphyxia.fingerspelling', 'lexis.fingerspell'])
  })

  it('namespaces vocabulary names too, for providers that don\'t use the vocabulary', () => {
    expect(mapTags(mappings.get('toddslan')!, ['toddslan', 'invented', 'nsw']))
      .toEqual(['toddslan', 'toddslan.invented', 'invented', 'toddslan.nsw'])
  })
})
