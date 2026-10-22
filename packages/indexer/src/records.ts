// Converts between today's encoded-search-data files and record files (@andypalmer/records), in both
// directions, keeping urls relative to the file as stored. Converting a file to records and back gives the
// entries readEncodedSearchData would have read from it, apart from the quirks the record schema doesn't
// allow, which are fixed and reported (see Quirk).
//
// An entry's key becomes its record's sourceId, and its old permalink: on the first conversion each record gets
// a readable id from its title, with the key kept as an alias when they differ, so old urls can still lead to
// it. Later conversions (updateRecordFile) keep those ids.
import { contentHash, createRecordFile, firstObservation, readableId, reconcile, type Change, type Digest, type IdPolicy, type MediaItem, type ProviderInfo, type RecordContent, type RecordFile, type SignRecord } from '@andypalmer/records'
import type { EncodedSearchData, EncodedSearchDataEntry, SearchDataEncodedMedia } from '@andypalmer/orthagonal'
import { withSearchDataDefaults } from './encoded-search-data.ts'

export type FromEncodedSearchDataOptions = {
  /** the provider's id, the file's name without .json */
  provider: string,
  /** when the conversion ran (an ISO timestamp): first seen, for entries without a timestamp, and last seen */
  seenAt: string,
  /** for splitting titles into words, when an entry has no words */
  locale?: string,
  digest?: Digest,
  /** how each record's readable id is chosen */
  ids?: IdPolicy,
  /** told about each quirk fixed on the way in */
  onQuirk?: (quirk: Quirk) => void,
  /** rewrites every url on the way in, such as to make it relative to where the record file will be stored.
   * By default urls are kept as they are */
  url?: (url: string) => string,
}

/** how entries become record content */
type EntryConversion = { quirk: (message: string) => void, url: (url: string) => string }

/** something in an encoded-search-data entry the record schema doesn't allow, and what was done about it */
export type Quirk = { id: string, message: string }

/** records for an encoded-search-data file, as stored (urls not yet resolved) */
export async function recordFileFromEncodedSearchData (raw: Record<string, Partial<EncodedSearchDataEntry>>, { provider, seenAt, locale, digest, ids = readableId, onQuirk = () => {}, url = same }: FromEncodedSearchDataOptions): Promise<RecordFile> {
  const data = withSearchDataDefaults(raw, locale)
  // the entry's timestamp is when it was added, so it's the best guess at when it was first seen
  const firstSeen = (entry: EncodedSearchDataEntry) => entry.timestamp === undefined ? seenAt : new Date(entry.timestamp).toISOString()
  // earliest first, so of the signs with the same title, the oldest gets the plain id
  const entries = Object.values(data).sort((a, b) => firstSeen(a).localeCompare(firstSeen(b)) || a.id.localeCompare(b.id))

  // every old permalink stays taken, so a new id can't send an old url to a different sign. A sign may still
  // take its own old permalink as its id
  const taken = new Set(entries.map(entry => entry.id))
  const records: SignRecord[] = []
  for (const entry of entries) {
    const content = contentFromEntry(entry, { quirk: message => onQuirk({ id: entry.id, message }), url })
    taken.delete(entry.id)
    const id = ids(content, taken)
    taken.add(id).add(entry.id)
    const record = await firstObservation(content, id, { at: firstSeen(entry) }, { digest })
    records.push({ ...record, aliases: id === entry.id ? undefined : [entry.id], provenance: { ...record.provenance, lastSeen: seenAt } })
  }
  return createRecordFile(providerInfo(provider, data), records)
}

/** the records after another conversion of a provider's encoded-search-data: the first conversion when there
 * are no records yet, otherwise every entry reconciled with the records from before, so signs keep their ids
 * and new ones get readable ids. `changes` lists the record ids by what happened to them, after the first */
export async function updateRecordFile (previous: RecordFile | undefined, raw: Record<string, Partial<EncodedSearchDataEntry>>, options: FromEncodedSearchDataOptions): Promise<{ file: RecordFile, changes?: Record<Change, string[]> }> {
  if (!previous) return { file: await recordFileFromEncodedSearchData(raw, options) }
  const { provider, seenAt, locale, digest, ids, onQuirk = () => {}, url = same } = options
  const data = withSearchDataDefaults(raw, locale)
  const contents = Object.values(data).map(entry => contentFromEntry(entry, { quirk: message => onQuirk({ id: entry.id, message }), url }))
  const { records, changes } = await reconcile(previous.records, contents, { at: seenAt }, { digest, ids })
  // an empty file has no provider details of its own
  const info = Object.keys(data).length ? providerInfo(provider, data) : previous.provider
  return { file: createRecordFile(info, records), changes }
}

export type ToEncodedSearchDataOptions = {
  /** what keys the entries: their readable ids, or their sourceIds, which for converted data are the old
   * permalinks the search site serves today */
  keys: 'id' | 'sourceId',
  /** which records to include: by default, all but removed ones */
  include?: (record: SignRecord) => boolean,
}

/** the encoded-search-data entries for a record file, as stored. Media not yet encoded is left out, as it
 * can't be played */
export function encodedSearchDataFromRecordFile (file: RecordFile, { keys, include = record => record.provenance.status !== 'removed' }: ToEncodedSearchDataOptions): EncodedSearchData {
  const data: EncodedSearchData = {}
  // oldest first, as files were written: record files are sorted by id instead
  const byAge = [...file.records].sort((a, b) => a.provenance.firstSeen.localeCompare(b.provenance.firstSeen) || a.sourceId.localeCompare(b.sourceId))
  for (const record of byAge) {
    if (!include(record)) continue
    const key = record[keys]
    data[key] = {
      id: key,
      title: record.title,
      words: record.words,
      link: record.link,
      nav: record.nav,
      body: record.body ?? '',
      englishPhrases: record.englishPhrases,
      media: record.media.flatMap(mediaFromItem),
      tags: record.tags,
      published: record.published ?? true,
      provider: { ...file.provider },
      author: record.author,
      timestamp: Date.parse(record.provenance.firstSeen),
      sourceCreated: record.sourceCreated === undefined ? undefined : Date.parse(record.sourceCreated),
      sourceUpdated: record.sourceUpdated === undefined ? undefined : Date.parse(record.sourceUpdated),
    }
  }
  return data
}

/** a record file with every url rewritten, such as to keep its relative urls working from another place, and each
 * record's content hash to match */
export async function rebaseRecordFile (file: RecordFile, url: (url: string) => string, digest?: Digest): Promise<RecordFile> {
  const records = await Promise.all(file.records.map(async (record): Promise<SignRecord> => {
    const rebased: SignRecord = {
      ...record,
      ...(record.link !== undefined && { link: url(record.link) }),
      ...(record.nav && { nav: record.nav.map(([label, link]) => [label, url(link)] as [string, string]) }),
      ...(record.author && { author: { ...record.author, ...(record.author.link !== undefined && { link: url(record.author.link) }), ...(record.author.avatar !== undefined && { avatar: url(record.author.avatar) }) } }),
      media: record.media.map(item => ({
        ...item,
        source: { ...item.source, url: url(item.source.url) },
        ...(item.encoded && { encoded: {
          ...item.encoded,
          ...(item.encoded.thumbnail !== undefined && { thumbnail: url(item.encoded.thumbnail) }),
          encodes: item.encoded.encodes.map(encode => ({ ...encode, url: url(encode.url) })),
        } }),
      })),
    }
    return { ...rebased, provenance: { ...record.provenance, contentHash: await contentHash(rebased, digest) } }
  }))
  return { ...file, records }
}

function same (url: string) {
  return url
}

function contentFromEntry (entry: EncodedSearchDataEntry, conversion: EntryConversion): RecordContent {
  const { url } = conversion
  const author = entry.author && {
    ...entry.author,
    link: entry.author.link && url(entry.author.link),
    avatar: entry.author.avatar && url(entry.author.avatar),
  }
  return {
    sourceId: entry.id,
    title: entry.title,
    words: entry.words,
    body: entry.body,
    englishPhrases: entry.englishPhrases?.length ? entry.englishPhrases : undefined,
    link: entry.link && url(entry.link),
    nav: entry.nav?.map(([label, link]) => [label, url(link)]),
    tags: entry.tags,
    author,
    media: entry.media.map(media => itemFromMedia(media, conversion)),
    // true is the default, so only an unpublished entry says so
    published: entry.published === false ? false : undefined,
    sourceCreated: entry.sourceCreated === undefined ? undefined : new Date(entry.sourceCreated).toISOString(),
    sourceUpdated: entry.sourceUpdated === undefined ? undefined : new Date(entry.sourceUpdated).toISOString(),
  }
}

function itemFromMedia (media: SearchDataEncodedMedia, { quirk, url: rewrite }: EntryConversion): MediaItem {
  const { method, url, version, clipping } = media.source
  // null meant no version
  if ((version as string | null) === null) quirk(`media ${url}: version null, dropped`)
  // an impossible clipping: keep where it starts, the part the encoder will have used
  let clip = clipping
  if (clipping?.end !== undefined && clipping.end <= (clipping.start ?? 0)) {
    quirk(`media ${url}: clipping ends (${clipping.end}) before it starts (${clipping.start ?? 0}), end dropped`)
    clip = { start: clipping.start }
  }
  return {
    type: media.type,
    source: { method, url: rewrite(url), version: version ?? undefined, clipping: clip },
    encoded: media.encodes ? {
      thumbnail: media.thumbnail && rewrite(media.thumbnail),
      encodedAt: new Date(media.timestamp).toISOString(),
      encodes: media.encodes.map(encode => ({ ...encode, url: rewrite(encode.url) })),
      ...(media.sourceSha256 && { sourceSha256: media.sourceSha256 }),
    } : undefined,
  }
}

function mediaFromItem (item: MediaItem): SearchDataEncodedMedia[] {
  if (!item.encoded) return []
  return [{
    type: item.type,
    source: { ...item.source, method: item.source.method ?? 'fetch' } as SearchDataEncodedMedia['source'],
    timestamp: Date.parse(item.encoded.encodedAt),
    thumbnail: item.encoded.thumbnail as string,
    encodes: item.encoded.encodes,
    ...(item.encoded.sourceSha256 && { sourceSha256: item.encoded.sourceSha256 }),
  }]
}

/** every entry in a file carries the same provider details: they become the file's */
function providerInfo (id: string, data: EncodedSearchData): ProviderInfo {
  const given = Object.values(data).find(entry => entry.provider)?.provider
  return { id, name: given?.name ?? id, verb: given?.verb, link: given?.link }
}
