// Readable ids: how a new sign gets the address it keeps. Passed to reconcile as an IdPolicy, so a provider
// can be given another.
import type { RecordContent } from './schema.ts'

/** chooses the id for a sign seen for the first time; `taken` holds every id and alias already in use by its
 * provider, which the result mustn't be */
export type IdPolicy = (content: RecordContent, taken: ReadonlySet<string>) => string

/** lowercase ascii words joined by hyphens, cut at a word boundary to at most maxLength characters */
export function slugify (text: string, maxLength = 48): string {
  const words = text
    .normalize('NFKD').replace(/\p{M}/gu, '') // é → e
    .toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean)
  let slug = ''
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word
    if (next.length > maxLength) break
    slug = next
  }
  // a single word longer than the limit is cut rather than lost
  return slug || (words[0] ?? '').slice(0, maxLength)
}

/** the spider's suggested slug, or else the first term of the title ("air" from "air, breeze, mood"). When
 * that's taken, the first two terms ("air-breeze"), as homonyms usually differ in their second; then -2, -3
 * and so on */
export const readableId: IdPolicy = (content, taken) => {
  const terms = content.title.split(/[,;]/).map(term => slugify(term)).filter(Boolean)
  const base = content.slug ?? terms[0] ?? content.kind ?? 'sign'
  if (!taken.has(base)) return base
  const twoTerms = content.slug === undefined && terms.length > 1 ? slugify(`${terms[0]} ${terms[1]}`) : undefined
  if (twoTerms && !taken.has(twoTerms)) return twoTerms
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  }
}
