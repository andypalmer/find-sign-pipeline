// The bookkeeping of a spider run: read each page, and keep the records of any page that wasn't read, so only a
// page discovery stopped finding counts as missing. A page goes unread when it fails, isn't due, is past the run's
// limit, or comes after the run was told to stop (such as when its time is up).
import type { RecordContent, SignRecord } from '@andypalmer/records'

export type CrawlOptions<Candidate> = {
  /** the records from the last run */
  previous: readonly SignRecord[],
  /** identifies a candidate (a page) */
  key: (candidate: Candidate) => string,
  /** the key of the candidate a record came from: a page can give several records, such as a word's variants */
  candidateOf: (record: SignRecord) => string,
  /** the signs on a candidate's page */
  read: (candidate: Candidate) => Promise<RecordContent[]>,
  /** whether to read a candidate this run. Default: every one */
  due?: (candidate: Candidate) => boolean,
  /** the most candidates to read, for trying a spider out or spreading a big crawl over several runs */
  limit?: number,
  /** asked before each read: true leaves this and every later candidate unread, such as when a run's time is up */
  stop?: () => boolean,
  log?: (message: string) => void,
}

export type Crawled<Candidate> = {
  /** every sign found, or kept from last time: what to reconcile */
  found: RecordContent[],
  /** the candidates read this run */
  read: Candidate[],
  failed: { candidate: Candidate, error: Error }[],
}

export async function crawl<Candidate> (candidates: readonly Candidate[], { previous, key, candidateOf, read, due = () => true, limit = Infinity, stop = () => false, log = () => {} }: CrawlOptions<Candidate>): Promise<Crawled<Candidate>> {
  const kept = new Map<string, RecordContent[]>()
  for (const record of previous) {
    const from = candidateOf(record)
    kept.set(from, [...(kept.get(from) ?? []), contentOf(record)])
  }

  const found: RecordContent[] = []
  const done: Candidate[] = []
  const failed: Crawled<Candidate>['failed'] = []
  let stopped = false
  for (const candidate of candidates) {
    const earlier = kept.get(key(candidate)) ?? []
    if (done.length + failed.length >= limit || !due(candidate) || (stopped ||= stop())) {
      found.push(...earlier)
      continue
    }
    try {
      found.push(...await read(candidate))
      done.push(candidate)
    } catch (error) {
      failed.push({ candidate, error: error as Error })
      log(`  failed: ${(error as Error).message}`)
      found.push(...earlier)
    }
  }
  return { found, read: done, failed }
}

/** a record's content as a spider would have found it: without the parts the framework adds */
export function contentOf ({ id: _id, aliases: _aliases, provenance: _provenance, ...content }: SignRecord): RecordContent {
  return content
}
