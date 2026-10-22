// Merging signs whose videos are identical into one search result. A provider can publish the same video more
// than once, such as under two words (Spread the Sign's "love" the noun and "love" the verb): its records keep
// both, as the provider has them, but searching should find the sign once. Videos are compared by the sha256 of
// their source files, so only signs whose every video is known to be the same are merged.
import type { EncodedSearchData, EncodedSearchDataEntry } from '@andypalmer/orthagonal'

/** the entries, with each group whose videos are identical merged into its oldest: it gains the others' words
 * and tags, and their ids (and aliases) as aliases, so their addresses lead to it. Gives the merged entries'
 * ids, by the id of the entry they were merged into */
export function mergeIdenticalMedia (data: EncodedSearchData): { data: EncodedSearchData, merged: Map<string, string[]> } {
  const groups = new Map<string, EncodedSearchDataEntry[]>()
  for (const entry of Object.values(data)) {
    const hashes = entry.media.map(media => media.sourceSha256)
    if (!hashes.length || hashes.some(hash => hash === undefined)) continue
    const key = hashes.join(',')
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  const oldest = (a: EncodedSearchDataEntry, b: EncodedSearchDataEntry) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.id.localeCompare(b.id, 'en', { numeric: true })
  const into = new Map<string, EncodedSearchDataEntry>()
  const merged = new Map<string, string[]>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [kept, ...others] = [...group].sort(oldest)
    const union = (lists: (string[] | undefined)[]) => [...new Set(lists.flatMap(list => list ?? []))]
    into.set(kept.id, {
      ...kept,
      words: union([kept.words, ...others.map(other => other.words)]),
      tags: union([kept.tags, ...others.map(other => other.tags)]),
      aliases: union([kept.aliases, ...others.flatMap(other => [[other.id], other.aliases])]),
    })
    merged.set(kept.id, others.map(other => other.id))
  }

  const gone = new Set([...merged.values()].flat())
  const result: EncodedSearchData = {}
  for (const [id, entry] of Object.entries(data)) {
    if (!gone.has(id)) result[id] = into.get(id) ?? entry
  }
  return { data: result, merged }
}
