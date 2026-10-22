export type OrthagonalIndex = {
  buildTimestamp: number, // epochMs
  buildID: string, // unique id which changes whenever the data is rebuilt
  vectorCachePath?: string, // [relative] url to a precomputed vectors shard file containing vectors
  entriesPerShard: number, // modulus number for calculating shard file from index
  entries: number, // total number of entries
  columns: OrthagonalColumns
}

export type OrthagonalColumns = {
  [key: string]: OrthagonalColumnSpec
}

export type OrthagonalColumnSpec = {
  path: string, // path relative to location of orthagonal index file, to this column
  type: 'number' | 'number[]' | 'string' | 'string[]' | 'object'
  isVectorIndexed?: true, // for string types, are the strings included in the vectorCachePath
}

export type OrthagonalColumnData = {
  buildID: string, // unique ID which matches the buildID in the OrthagonalIndex
  entries: any[], // entries in this column
}

export type EncodedSearchData = { [key: string]: EncodedSearchDataEntry }

export type EncodedSearchDataEntry = {
  id: string, // id of entry, used when in array form instead of object form
  sourceId?: string, // in an index: the entry's key in its encoded-search-data file, when its id is a readable one
  aliases?: string[], // in an index: earlier ids (old permalinks) that redirect to this entry
  title: string, // human friendly entry title
  words: string[], // human friendly list of searchable words
  link?: string, // url to page about this sign
  nav?: SearchDataNavEntry[], // breadcrumbs in to site
  body: string, // markdown-like text body
  media: SearchDataEncodedMedia[], // videos for the carousel
  tags: string[], // hashtags
  published?: boolean, // is this entry 'published'? if it's true or unset, entry should be included in search results
  provider?: {
    id?: string, // url component sort of label like auslan-signbank
    name?: string, // friendly name for site
    verb?: string, // discovery verb, e.g. 'shared' or 'documented'
    link?: string, // link to provider
  },
  author?: {
    id?: string, // like a username on social media etc, string with tag-like character rules
    name?: string, // name of author
    link?: string, // link to author's profile
    avatar?: string, // link to a square avatar image
  },
  timestamp?: number, // epochMs
  englishPhrases?: string[], // English expressions the sign translates, matched whole: "kick the bucket"
  // epochMs: what the source says about when the sign was made and last changed, when it says
  sourceCreated?: number,
  sourceUpdated?: number,
}

export function validateEncodedSearchDataEntry (entry: EncodedSearchDataEntry) {
  if (typeof entry !== 'object') throw new Error('entry is not an object')
  if (!('id' in entry) || typeof entry.id !== 'string') throw new Error('entry does not have an id string')
  if (!('words' in entry) || !Array.isArray(entry.words)) throw new Error('entry does not have a words array')
  if (!('title' in entry) || typeof entry.title !== 'string') throw new Error('entry does not have a title string')
  if (!('body' in entry) || typeof entry.body !== 'string') throw new Error('entry does not have a body string')
  if (!('media' in entry) || !Array.isArray(entry.media)) throw new Error('entry does not have a media array')
  for (const media of entry.media) {
    validateSearchDataEncodedMedia(media)
  }
}

export function isEncodedSearchDataEntry (entry: unknown): entry is EncodedSearchDataEntry {
  try {
    validateEncodedSearchDataEntry(entry as EncodedSearchDataEntry)
    return true
  } catch (err) {
    return false
  }
}

export type SearchDataNavEntry = [title: string, url: string]

export type SearchDataEncodedMedia = {
  type: 'video' | 'audio',
  source: { 'method': 'fetch', url: string, clipping?: { start?: number, end?: number}, version: string },
  timestamp: number, // epochMs time when oldest video transcode was made
  thumbnail: string, // string url to a thumbnail in a web compatible image format like webp or jpeg
  encodes: SearchDataEncode[], // each version of the same video source
  sourceSha256?: string, // sha256 of the source file, as hex, when known: identical videos have the same one
}

export function validateSearchDataEncodedMedia (entry: SearchDataEncodedMedia) {
  if (typeof entry !== 'object') throw new Error('media entry is not an object')
  if (!('type' in entry) || (entry.type !== 'video' && entry.type !== 'audio')) throw new Error('media entry has unacceptable type value')
  if (!('source' in entry) || typeof entry.source !== 'object') throw new Error('media entry source is not an object')
  if (!('timestamp' in entry) || typeof entry.timestamp !== 'number') throw new Error('media entry timestamp is not a number')
  if (!('thumbnail' in entry) || typeof entry.thumbnail !== 'string') throw new Error('media entry thumbnail is not a string')
  if (!('encodes' in entry) || !Array.isArray(entry.encodes)) return false
  for (const encode of entry.encodes) {
    validateSearchDataEncode(encode)
  }
}

export function isSearchDataEncodedMedia (entry: unknown): entry is SearchDataEncodedMedia {
  try {
    validateSearchDataEncodedMedia(entry as SearchDataEncodedMedia)
    return true
  } catch (err) {
    return false
  }
}

export type SearchDataEncode = {
  type: 'video/mp4' | 'video/webm' | 'video/x-matroska',
  width: number, // video actual width in pixels
  height: number, // video actual height in pixels,
  container: 'mp4' | 'webm' | 'mkv',
  codec: 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1',
  version: string, // media invalidation string, used internally by encoder, e.g. "mp4:x264:22@512x288"
  url: string, // relative path to video file, e.g. "auslan-signbank-media/BOY.NTH-0-x264-512x288.mp4"
  byteSize: number, // size in bytes
  duration: number, // duration in seconds
}

export function validateSearchDataEncode (entry: SearchDataEncode) {
  if (typeof entry !== 'object') return false
  if (entry.type !== 'video/mp4' && entry.type !== 'video/webm' && entry.type !== 'video/x-matroska') throw new Error('encode type is not a known acceptable mime type')
  if (typeof entry.width !== 'number' || typeof entry.height !== 'number') throw new Error('encode width/height is not a number')
  if (entry.container !== 'mp4' && entry.container !== 'webm' && entry.container !== 'mkv') throw new Error('encode container is not a known container')
  if (!['h264', 'h265', 'vp8', 'vp9', 'av1'].includes(entry.codec)) throw new Error('encode codec is not a known codec')
  if (typeof entry.version !== 'string') throw new Error('encode version is not a string')
  if (typeof entry.url !== 'string') throw new Error('encode url is not a string')
  if (typeof entry.byteSize !== 'number') throw new Error('encode byteSize is not a number')
  if (typeof entry.duration !== 'number') throw new Error('encode duration is not a number')
  if (entry.duration <= 0) throw new Error('encode duration is negative or zero')
}

export function isSearchDataEncode (entry: unknown): entry is SearchDataEncode {
  try {
    validateSearchDataEncode(entry as SearchDataEncode)
    return true
  } catch (err) {
    return false
  }
}
