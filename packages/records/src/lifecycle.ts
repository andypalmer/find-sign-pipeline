// How records change from one spider run to the next. Pure: the run's time and the policies come in as
// arguments, so the same inputs always give the same records. Signs are matched across runs by sourceId.
import { canonicalJSON } from './canonical.ts'
import { contentHash, sha256, type Digest } from './content-hash.ts'
import { readableId, type IdPolicy } from './ids.ts'
import type { MediaItem, Provenance, RecordContent, SignRecord } from './schema.ts'

/** one spider run, identified by when it started (an ISO timestamp) */
export type Run = { at: string }

/** what happened to a sign in a run */
export type Change = 'new' | 'changed' | 'unchanged' | 'returned' | 'missing' | 'removed'

/** when a sign that discovery stops finding is removed, rather than kept as missing */
export type RemovalPolicy = {
  /** removed once this many consecutive runs haven't found it */
  removeAfterMissingRuns: number,
}

export const defaultRemovalPolicy: RemovalPolicy = { removeAfterMissingRuns: 3 }

export type LifecycleOptions = {
  digest?: Digest,
  removal?: RemovalPolicy,
  /** how a new sign's readable id is chosen */
  ids?: IdPolicy,
  /** the old permalinks of a sign seen for the first time, such as from a provider's data from before it had
   * records. They become its aliases, and no other sign can be given one; the sign itself may take one as its id */
  formerIds?: (content: RecordContent) => readonly string[] | undefined,
}

/** the record for a sign seen for the first time, at the id given (see IdPolicy) */
export async function firstObservation (content: RecordContent, id: string, run: Run, { digest = sha256 }: LifecycleOptions = {}): Promise<SignRecord> {
  const provenance: Provenance = { firstSeen: run.at, lastSeen: run.at, lastChanged: run.at, contentHash: await contentHash(content, digest), status: 'present', missingRuns: 0 }
  return { id, ...content, provenance }
}

/** a sign found again: its new content, keeping its id, aliases, first sighting and unchanged media's encodes */
export async function nextObservation (previous: SignRecord, content: RecordContent, run: Run, { digest = sha256 }: LifecycleOptions = {}): Promise<{ record: SignRecord, change: Change }> {
  if (content.sourceId !== previous.sourceId) throw new Error(`"${content.sourceId}" is a different sign from "${previous.sourceId}"`)
  const hash = await contentHash(content, digest)
  const changed = hash !== previous.provenance.contentHash
  const provenance: Provenance = {
    ...previous.provenance,
    lastSeen: run.at,
    lastChanged: changed ? run.at : previous.provenance.lastChanged,
    contentHash: hash,
    status: 'present',
    missingRuns: 0,
  }
  const change: Change = previous.provenance.status !== 'present' ? 'returned' : changed ? 'changed' : 'unchanged'
  const record: SignRecord = { id: previous.id, aliases: previous.aliases, ...content, media: keepEncodings(previous.media, content.media), provenance }
  return { record, change }
}

/** a sign this run didn't find: missing, then removed once the policy says so */
export function markMissing (record: SignRecord, { removal = defaultRemovalPolicy }: LifecycleOptions = {}): { record: SignRecord, change: Change } {
  if (record.provenance.status === 'removed') return { record, change: 'removed' }
  const missingRuns = record.provenance.missingRuns + 1
  const status = missingRuns >= removal.removeAfterMissingRuns ? 'removed' : 'missing'
  return { record: { ...record, provenance: { ...record.provenance, status, missingRuns } }, change: status }
}

export type Reconciled = {
  /** every record, sorted by id */
  records: SignRecord[],
  /** record ids by what happened to them in this run */
  changes: Record<Change, string[]>,
}

/** a whole run: every sign discovery found, against the records from before it. New signs get ids in the
 * order they were found */
export async function reconcile (previous: readonly SignRecord[], found: readonly RecordContent[], run: Run, options: LifecycleOptions = {}): Promise<Reconciled> {
  const { ids = readableId, formerIds = () => undefined } = options
  const before = new Map(previous.map(record => [record.sourceId, record]))
  // ids are never reused, so removed signs' ids and every alias stay taken
  const held = new Set(previous.flatMap(record => [record.id, ...(record.aliases ?? [])]))
  const taken = new Set(held)
  // and so are new signs' old permalinks, so a new id can't send an old url to a different sign
  const formerOf = (content: RecordContent) => (formerIds(content) ?? []).filter(id => !held.has(id))
  for (const content of found) if (!before.has(content.sourceId)) for (const id of formerOf(content)) taken.add(id)
  const seen = new Set<string>()
  const changes: Record<Change, string[]> = { new: [], changed: [], unchanged: [], returned: [], missing: [], removed: [] }
  const records: SignRecord[] = []

  for (const content of found) {
    if (seen.has(content.sourceId)) throw new Error(`run found the sourceId "${content.sourceId}" more than once`)
    seen.add(content.sourceId)
    const earlier = before.get(content.sourceId)
    if (earlier) {
      const { record, change } = await nextObservation(earlier, content, run, options)
      records.push(record)
      changes[change].push(record.id)
    } else {
      const former = formerOf(content)
      for (const alias of former) taken.delete(alias)
      const id = ids(content, taken)
      if (taken.has(id)) throw new Error(`id policy chose "${id}", which is already taken`)
      taken.add(id)
      for (const alias of former) taken.add(alias)
      const record = await firstObservation(content, id, run, options)
      const aliases = former.filter(alias => alias !== id)
      records.push(aliases.length ? { ...record, aliases } : record)
      changes.new.push(id)
    }
  }

  for (const record of previous) {
    if (seen.has(record.sourceId)) continue
    const result = markMissing(record, options)
    records.push(result.record)
    changes[result.change].push(record.id)
  }

  records.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return { records, changes }
}

/** carries the encoder's output over to media whose source hasn't changed, so it isn't encoded again */
export function keepEncodings (previous: readonly MediaItem[], next: readonly MediaItem[]): MediaItem[] {
  const key = (item: MediaItem) => canonicalJSON({ type: item.type, source: item.source })
  const encoded = new Map(previous.flatMap(item => item.encoded ? [[key(item), item.encoded] as const] : []))
  return next.map(item => {
    const kept = item.encoded ?? encoded.get(key(item))
    return kept ? { ...item, encoded: kept } : item
  })
}
