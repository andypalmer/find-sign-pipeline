import { expect, describe, it } from 'vitest'
import { canonicalJSON, contentHash, firstObservation, type Digest } from '../src/index.ts'
import { encodedVideo, sign, video } from './fixtures.ts'

describe('canonicalJSON()', () => {
  it('sorts keys at every depth, keeps array order, and leaves out undefined', () => {
    expect(canonicalJSON({ b: 1, a: { d: [3, 1], c: undefined, e: null } })).toBe('{"a":{"d":[3,1],"e":null},"b":1}')
  })

  it('refuses values JSON cannot hold', () => {
    expect(() => canonicalJSON({ a: Infinity })).toThrow()
  })
})

describe('contentHash()', () => {
  it('is a sha256 of the content, whatever order its keys were written in', async () => {
    const reordered = { media: [video('cat')], tags: [], words: ['cat'], title: 'Cat', sourceId: 'cat' }
    expect(await contentHash(sign('cat'))).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(await contentHash(reordered)).toBe(await contentHash(sign('cat')))
  })

  it('changes when the content does', async () => {
    const base = await contentHash(sign('cat'))
    expect(await contentHash(sign('cat', { title: 'Kitty' }))).not.toBe(base)
    expect(await contentHash(sign('cat', { tags: ['animal'] }))).not.toBe(base)
    expect(await contentHash(sign('cat', { media: [video('cat', '2')] }))).not.toBe(base)
  })

  it('ignores what the encoder made, the provider dates, a suggested slug, and defaults written out', async () => {
    const base = await contentHash(sign('cat'))
    expect(await contentHash(sign('cat', { slug: 'kitty' }))).toBe(base)
    expect(await contentHash(sign('cat', { media: [encodedVideo('cat')] }))).toBe(base)
    expect(await contentHash(sign('cat', { sourceUpdated: '2026-02-01T00:00:00.000Z' }))).toBe(base)
    expect(await contentHash(sign('cat', { kind: 'sign', published: true, body: '' }))).toBe(base)
  })

  it('hashes a whole record the same as its content', async () => {
    const record = await firstObservation(sign('cat'), 'cat', { at: '2026-10-20T00:00:00.000Z' })
    expect(await contentHash(record)).toBe(await contentHash(sign('cat')))
  })

  it('uses the digest it is given, labelled with its name', async () => {
    const fake: Digest = { name: 'fake', hash: async () => new Uint8Array([1, 255]) }
    expect(await contentHash(sign('cat'), fake)).toBe('fake:01ff')
  })
})
