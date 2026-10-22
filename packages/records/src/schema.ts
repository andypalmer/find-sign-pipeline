// The shape of a sign record, as validators with the types inferred from them, so the two can't drift.
// Who writes what:
//   spiders write RecordContent (what a provider says about a sign) and its media sources
//   the encoder writes each media item's `encoded` (thumbnails and encodes)
//   the framework writes `id` and `aliases` (the sign's address) and `provenance` (when it was seen, whether it
//   changed)
// A sign has two identities: `sourceId`, the spider's key for finding the same sign again on the next run,
// and `id`, the readable address in its url, assigned once and then kept.
// URLs may be relative: they resolve against the url of the record file holding them, so a data tree can
// move hosts without rewriting its records.
import * as v from 'valibot'

const text = v.pipe(v.string(), v.minLength(1))
const url = v.pipe(v.string(), v.minLength(1))
const timestamp = v.pipe(v.string(), v.isoTimestamp())

/** a readable, url-safe id: lowercase letters and digits, in words joined by single hyphens */
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const slugRule = v.regex(slugPattern, 'must be lowercase letters and digits, in words joined by hyphens')
const slug = v.pipe(v.string(), slugRule, v.maxLength(64))
// shorter, leaving room for a -2 when another sign already has it
const suggestedSlug = v.pipe(v.string(), slugRule, v.maxLength(56))

export const Author = v.strictObject({
  id: v.optional(text),
  name: v.optional(text),
  link: v.optional(url),
  avatar: v.optional(url),
})

/** a breadcrumb into the provider's site: [label, url] */
export const NavEntry = v.tuple([v.string(), url])

/** part of a longer media file, in seconds */
export const Clipping = v.pipe(
  v.strictObject({
    start: v.optional(v.pipe(v.number(), v.minValue(0))),
    end: v.optional(v.pipe(v.number(), v.minValue(0))),
  }),
  v.check(({ start = 0, end }) => end === undefined || end > start, 'clipping end must be after its start'),
)

/** where a media item comes from. A new `version` (or url or clipping) means the media changed */
export const MediaSource = v.strictObject({
  method: v.optional(v.literal('fetch')),
  url,
  version: v.optional(v.string()),
  clipping: v.optional(Clipping),
})

export const Encode = v.strictObject({
  type: v.picklist(['video/mp4', 'video/webm', 'video/x-matroska']),
  width: v.number(),
  height: v.number(),
  container: v.picklist(['mp4', 'webm', 'mkv']),
  codec: v.picklist(['h264', 'h265', 'vp8', 'vp9', 'av1']),
  version: v.string(),
  url,
  byteSize: v.number(),
  duration: v.pipe(v.number(), v.gtValue(0)),
})

/** what the encoder made from a media source */
export const Encoded = v.strictObject({
  thumbnail: v.optional(url),
  encodedAt: timestamp,
  encodes: v.array(Encode),
  /** the sha256 of the source file the encoder read, as hex, when it downloaded the whole file: the same video
   * published twice (such as under two words) has the same one */
  sourceSha256: v.optional(v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))),
})

export const MediaItem = v.strictObject({
  type: v.picklist(['video', 'audio']),
  source: MediaSource,
  encoded: v.optional(Encoded),
})

/** what a spider says about one sign */
export const RecordContent = v.strictObject({
  /** the spider's key for this sign: stable across runs, unique within its provider, never reused. It needn't
   * be readable (a video id and start time is fine) */
  sourceId: text,
  /** a suggestion for the sign's readable id, when the provider has a better one than its title */
  slug: v.optional(suggestedSlug),
  /** a phrase is a concept (an idiom, a sentence) rather than a single sign; unset means 'sign' */
  kind: v.optional(v.picklist(['sign', 'phrase'])),
  title: text,
  words: v.array(text),
  /** for phrases: plain words for what it means, searched instead of the phrase's own words */
  meaning: v.optional(v.array(text)),
  body: v.optional(v.string()),
  /** English expressions the sign translates, kept whole, so searching for one finds it: "kick the bucket" for
   * DIE. Its words aren't searched one by one, so "bucket" alone doesn't find DIE */
  englishPhrases: v.optional(v.array(text)),
  link: v.optional(url),
  nav: v.optional(v.array(NavEntry)),
  tags: v.array(text),
  author: v.optional(Author),
  media: v.array(MediaItem),
  /** false hides the sign from search; unset means true */
  published: v.optional(v.boolean()),
  /** what the provider says about when it was made and last changed, when it says */
  sourceCreated: v.optional(timestamp),
  sourceUpdated: v.optional(timestamp),
})

/** what the framework records about a sign across runs */
export const Provenance = v.strictObject({
  /** the first run that found it */
  firstSeen: timestamp,
  /** the last run whose discovery found it */
  lastSeen: timestamp,
  /** the run in which its content hash last changed */
  lastChanged: timestamp,
  contentHash: text,
  /** present: found by the last run. missing: not found lately. removed: missing for too many runs */
  status: v.picklist(['present', 'missing', 'removed']),
  /** consecutive runs that didn't find it */
  missingRuns: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export const SignRecord = v.strictObject({
  /** the sign's readable address within its provider, as in /sign/<provider>/<id>: assigned when first seen,
   * then kept even if the title changes, and never reused */
  id: slug,
  /** earlier ids (old permalinks) that still lead to this sign */
  aliases: v.optional(v.array(text)),
  ...RecordContent.entries,
  provenance: Provenance,
})

export const ProviderInfo = v.strictObject({
  id: text,
  name: text,
  /** how the provider relates to its signs, e.g. "documented" or "shared" */
  verb: v.optional(text),
  link: v.optional(url),
})

function unique (values: string[]) {
  return new Set(values).size === values.length
}

/** one provider's records, as stored */
export const RecordFile = v.pipe(
  v.strictObject({
    format: v.literal('find-sign-records'),
    version: v.literal(1),
    provider: ProviderInfo,
    records: v.array(SignRecord),
  }),
  v.check(file => unique(file.records.map(r => r.sourceId)), 'record sourceIds must be unique'),
  v.check(file => unique(file.records.flatMap(r => [r.id, ...(r.aliases ?? [])])), 'record ids and aliases must all be different'),
)

export type Author = v.InferOutput<typeof Author>
export type NavEntry = v.InferOutput<typeof NavEntry>
export type Clipping = v.InferOutput<typeof Clipping>
export type MediaSource = v.InferOutput<typeof MediaSource>
export type Encode = v.InferOutput<typeof Encode>
export type Encoded = v.InferOutput<typeof Encoded>
export type MediaItem = v.InferOutput<typeof MediaItem>
export type RecordContent = v.InferOutput<typeof RecordContent>
export type Provenance = v.InferOutput<typeof Provenance>
export type SignRecord = v.InferOutput<typeof SignRecord>
export type ProviderInfo = v.InferOutput<typeof ProviderInfo>
export type RecordFile = v.InferOutput<typeof RecordFile>
