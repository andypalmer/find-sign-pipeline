// Claims: that one sign should, or shouldn't, carry one vocabulary tag, and who says so. They're how signs are
// tagged one at a time, where no mapping rule can say it for every sign with a provider tag: Spread the Sign's
// profanity, say, whose category also holds brb and bff. A provider's claims are kept in one file.
//
// A curator's claim beats a user's, and between claims at the same level the newest wins. A claim can only be
// about a vocabulary tag, so a provider's own tags (sts.profanity-slang) are never taken away.
import { canonicalTag } from './vocabulary.ts'

export type Claim = {
  /** the sign, by its sourceId (its key in the provider's encoded-search-data, as overrides use) */
  sourceId: string,
  /** a tag in the vocabulary */
  tag: string,
  claim: 'add' | 'remove',
  /** who says so: curator:<name>, or user:<id> once user claims are accepted */
  by: string,
  /** when, an ISO timestamp */
  at: string,
  /** a line for the next curator */
  why?: string,
}

export type ClaimFile = {
  format: 'find-sign-claims',
  version: 1,
  provider: string,
  claims: Claim[],
}

const levels: Record<string, number> = { curator: 2, user: 1 }
const levelOf = (claim: Claim) => levels[claim.by.split(':')[0]] ?? 0

/** what's wrong with a claim, or undefined when nothing is */
export function claimProblem (claim: Claim): string | undefined {
  if (typeof claim !== 'object' || claim === null) return 'not an object'
  if (typeof claim.sourceId !== 'string' || !claim.sourceId) return 'no sourceId'
  if (typeof claim.tag !== 'string' || !canonicalTag(claim.tag)) return `"${claim.tag}" isn't in the vocabulary`
  if (claim.claim !== 'add' && claim.claim !== 'remove') return `claim is "${claim.claim}", not add or remove`
  if (typeof claim.by !== 'string' || !levels[claim.by.split(':')[0]] || !claim.by.split(':')[1]) return `by is "${claim.by}", not curator:<name> or user:<id>`
  if (typeof claim.at !== 'string' || Number.isNaN(Date.parse(claim.at))) return `at is "${claim.at}", not a timestamp`
  if (claim.why !== undefined && typeof claim.why !== 'string') return 'why is not text'
  return undefined
}

/** a claim file's claims, leaving out (and saying what's wrong with) any that can't be used. A file that isn't a
 * claim file at all throws */
export function parseClaimFile (text: string): { file: ClaimFile, problems: { claim: unknown, problem: string }[] } {
  const data = JSON.parse(text)
  if (data?.format !== 'find-sign-claims') throw new Error('not a find-sign-claims file')
  if (data.version !== 1) throw new Error(`find-sign-claims version ${data.version}: only version 1 is known`)
  if (typeof data.provider !== 'string') throw new Error('find-sign-claims file without a provider')
  if (!Array.isArray(data.claims)) throw new Error('find-sign-claims file without a claims list')
  const problems: { claim: unknown, problem: string }[] = []
  const claims = data.claims.filter((claim: Claim) => {
    const problem = claimProblem(claim)
    if (problem) problems.push({ claim, problem })
    return !problem
  })
  return { file: { format: 'find-sign-claims', version: 1, provider: data.provider, claims }, problems }
}

export function serialiseClaimFile (file: ClaimFile): string {
  return JSON.stringify(file, null, 2) + '\n'
}

/** for each sign, the claim that decides each tag it's claimed about */
export function decidingClaims (claims: readonly Claim[]): Map<string, Map<string, Claim>> {
  const bySign = new Map<string, Map<string, Claim>>()
  for (const claim of claims) {
    if (!bySign.has(claim.sourceId)) bySign.set(claim.sourceId, new Map())
    const decided = bySign.get(claim.sourceId)!
    const other = decided.get(claim.tag)
    const wins = !other || levelOf(claim) > levelOf(other) || (levelOf(claim) === levelOf(other) && Date.parse(claim.at) >= Date.parse(other.at))
    if (wins) decided.set(claim.tag, claim)
  }
  return bySign
}

/** a sign's tags with its deciding claims applied, and the tags they took away */
export function applyClaims (tags: readonly string[], decided: ReadonlyMap<string, Claim> | undefined): { tags: string[], removed: string[] } {
  if (!decided) return { tags: [...tags], removed: [] }
  const result = new Set(tags)
  const removed: string[] = []
  for (const [tag, claim] of decided) {
    if (claim.claim === 'add') {
      result.add(tag)
    } else {
      result.delete(tag)
      removed.push(tag)
    }
  }
  return { tags: [...result], removed }
}
