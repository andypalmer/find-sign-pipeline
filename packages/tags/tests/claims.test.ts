import { expect, describe, it } from 'vitest'
import { applyClaims, decidingClaims, parseClaimFile, serialiseClaimFile, type Claim, type ClaimFile } from '../src/index.ts'

const claim = (sourceId: string, tag: string, change: Claim['claim'], by: string, at: string): Claim => ({ sourceId, tag, claim: change, by, at })
const file = (claims: unknown[]) => JSON.stringify({ format: 'find-sign-claims', version: 1, provider: 'sts', claims })

describe('parseClaimFile()', () => {
  it('reads a claim file, as it was written', () => {
    const written: ClaimFile = { format: 'find-sign-claims', version: 1, provider: 'sts', claims: [
      { ...claim('1', 'lexis.crude', 'add', 'curator:andy', '2026-10-22T00:00:00.000Z'), why: 'profanity' },
    ] }
    expect(parseClaimFile(serialiseClaimFile(written))).toEqual({ file: written, problems: [] })
  })

  it('leaves out claims it can\'t use, saying why', () => {
    const { file: read, problems } = parseClaimFile(file([
      claim('1', 'sts.profanity-slang', 'remove', 'curator:andy', '2026-10-22T00:00:00Z'),
      claim('2', 'lexis.crude', 'maybe' as any, 'curator:andy', '2026-10-22T00:00:00Z'),
      claim('3', 'lexis.crude', 'add', 'andy', '2026-10-22T00:00:00Z'),
      claim('4', 'lexis.crude', 'add', 'curator:andy', 'yesterday'),
      claim('5', 'lexis.crude', 'add', 'curator:andy', '2026-10-22T00:00:00Z'),
    ]))
    expect(read.claims.map(c => c.sourceId)).toEqual(['5'])
    expect(problems.map(p => p.problem)).toEqual([
      '"sts.profanity-slang" isn\'t in the vocabulary',
      'claim is "maybe", not add or remove',
      'by is "andy", not curator:<name> or user:<id>',
      'at is "yesterday", not a timestamp',
    ])
  })

  it('refuses a file that isn\'t a claim file', () => {
    expect(() => parseClaimFile('{"format":"find-sign-records"}')).toThrow('not a find-sign-claims file')
  })
})

describe('decidingClaims()', () => {
  it('lets a curator\'s claim beat a user\'s, and the newest win at the same level', () => {
    const decided = decidingClaims([
      claim('1', 'lexis.crude', 'remove', 'curator:a', '2026-01-01T00:00:00Z'),
      claim('1', 'lexis.crude', 'add', 'user:7', '2026-06-01T00:00:00Z'),
      claim('2', 'lexis.crude', 'add', 'curator:a', '2026-01-01T00:00:00Z'),
      claim('2', 'lexis.crude', 'remove', 'curator:b', '2026-02-01T00:00:00Z'),
    ])
    expect(decided.get('1')!.get('lexis.crude')!.claim).toBe('remove')
    expect(decided.get('2')!.get('lexis.crude')!.by).toBe('curator:b')
  })
})

describe('applyClaims()', () => {
  it('adds and takes away tags, saying which it took away', () => {
    const decided = decidingClaims([
      claim('1', 'lexis.crude', 'add', 'curator:a', '2026-01-01T00:00:00Z'),
      claim('1', 'semantic.sexuality', 'remove', 'curator:a', '2026-01-01T00:00:00Z'),
    ]).get('1')
    expect(applyClaims(['sts.sex', 'semantic.sexuality'], decided)).toEqual({ tags: ['sts.sex', 'lexis.crude'], removed: ['semantic.sexuality'] })
    expect(applyClaims(['sts.sex'], undefined)).toEqual({ tags: ['sts.sex'], removed: [] })
  })
})
