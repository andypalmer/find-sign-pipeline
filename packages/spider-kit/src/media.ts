// Getting every present sign's media encoded: reusing an encoding made before where there is one (seeds, such
// as Find Sign's existing encoded-search-data), otherwise encoding it.
import { createHash } from 'node:crypto'
import type { Encoded, SignRecord } from '@andypalmer/records'

/** encodes one media item, from its source url */
export type Encoder = (record: SignRecord, sourceURL: string) => Promise<Encoded>

export type EncodeMissingOptions = {
  encode?: Encoder,
  /** encodings that already exist, by source url */
  seeds?: ReadonlyMap<string, Encoded>,
  /** how many to encode at once (default 1). More only for media from a CDN such as Vimeo's: each encode downloads
   * its video, and a sign site's own media server should get one download at a time */
  concurrency?: number,
  log?: (message: string) => void,
}

/** fills in `encoded` on present records' media that have none, in place. Gives the record ids by how, in the
 * records' order */
export async function encodeMissing (records: SignRecord[], { encode, seeds = new Map(), concurrency = 1, log = () => {} }: EncodeMissingOptions): Promise<{ encoded: string[], reused: string[], failed: string[] }> {
  const result = { encoded: [] as string[], reused: [] as string[], failed: [] as string[] }
  const jobs: { record: SignRecord, index: number, url: string, outcome?: 'encoded' | 'failed' }[] = []
  for (const record of records) {
    if (record.provenance.status !== 'present') continue
    for (const [index, item] of record.media.entries()) {
      if (item.encoded) continue
      const seed = seeds.get(item.source.url)
      if (seed) {
        record.media[index] = { ...item, encoded: seed }
        result.reused.push(record.id)
      } else if (encode) {
        jobs.push({ record, index, url: item.source.url })
      }
    }
  }

  if (jobs.length || result.reused.length) log(`${jobs.length} videos to encode${result.reused.length ? `, ${result.reused.length} existing encodings reused` : ''}`)
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      const { record, index, url } = job
      log(`  encoding ${record.id} (${next} of ${jobs.length})`)
      try {
        const encoded = await encode!(record, url)
        record.media[index] = { ...record.media[index], encoded }
        job.outcome = 'encoded'
      } catch (error) {
        log(`  couldn't encode ${record.id}: ${(error as Error).message}`)
        job.outcome = 'failed'
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker))
  for (const job of jobs) result[job.outcome!].push(job.record.id)
  return result
}

export type HashMissingOptions = {
  /** the source file of a record's media, from its source url */
  download: (record: SignRecord, sourceURL: string) => Promise<Uint8Array>,
  /** asked before each download: true leaves the rest for another run, such as when a run's time is up */
  stop?: () => boolean,
  log?: (message: string) => void,
}

/** fills in `sourceSha256` on encoded media of present records that have none, in place, by downloading each
 * source, so media encoded before sources were hashed can be compared too. Gives the record ids by how */
export async function hashMissing (records: SignRecord[], { download, stop = () => false, log = () => {} }: HashMissingOptions): Promise<{ hashed: string[], failed: string[], left: number }> {
  const jobs = records.filter(record => record.provenance.status === 'present')
    .flatMap(record => record.media.flatMap((item, index) => item.encoded && !item.encoded.sourceSha256 ? [{ record, index }] : []))
  const result = { hashed: [] as string[], failed: [] as string[], left: 0 }
  if (jobs.length) log(`${jobs.length} videos to hash`)
  for (const [n, { record, index }] of jobs.entries()) {
    if (stop()) { result.left = jobs.length - n; break }
    const item = record.media[index]
    try {
      const sourceSha256 = sha256(await download(record, item.source.url))
      record.media[index] = { ...item, encoded: { ...item.encoded!, sourceSha256 } }
      result.hashed.push(record.id)
    } catch (error) {
      log(`  couldn't hash ${record.id}: ${(error as Error).message}`)
      result.failed.push(record.id)
    }
    if ((n + 1) % 500 === 0) log(`  ${n + 1} of ${jobs.length} hashed`)
  }
  return result
}

/** a file's sha256, as hex */
export function sha256 (bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** media as it appears in Find Sign's encoded-search-data and index entries */
export type LegacyMedia = {
  source: { url: string },
  thumbnail?: string,
  timestamp: number,
  encodes?: Encoded['encodes'],
}

/** encodings from existing Find Sign entries (encoded-search-data, or an index's shards), by source url, with
 * their urls rewritten by `url`, such as to make them relative to where the records will be */
export function seedsFromEntries (entries: Iterable<{ media?: LegacyMedia[] }>, url: (url: string) => string): Map<string, Encoded> {
  const seeds = new Map<string, Encoded>()
  for (const entry of entries) {
    for (const media of entry.media ?? []) {
      if (!media.encodes?.length) continue
      seeds.set(media.source.url, {
        thumbnail: media.thumbnail && url(media.thumbnail),
        encodedAt: new Date(media.timestamp).toISOString(),
        encodes: media.encodes.map(encode => ({ ...encode, url: url(encode.url) })),
      })
    }
  }
  return seeds
}
