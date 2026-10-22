// Reading encoded-search-data files: what the encoder makes from a provider's search-data, and the index
// build's input. Entries may leave out their id, title, words and more, which get defaults here.
import type { EncodedSearchData, EncodedSearchDataEntry } from '@andypalmer/orthagonal'

/** an encoded-search-data file, with defaults applied and its urls made absolute */
export async function readEncodedSearchData (url: string, { locale, fetch = globalThis.fetch }: { locale?: string, fetch?: typeof globalThis.fetch } = {}): Promise<EncodedSearchData> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return resolveSearchDataURLs(withSearchDataDefaults(await response.json(), locale), url)
}

/** fills in each entry's id, published, title, words, body, tags and media, as search-data files may leave
 * them out. Words come from the title, split with the locale's word rules */
export function withSearchDataDefaults (raw: Record<string, Partial<EncodedSearchDataEntry>>, locale: string | undefined): EncodedSearchData {
  const data: EncodedSearchData = {}
  for (const id in raw) {
    const entry = data[id] = {
      id: id,
      published: true,
      // search-data files don't usually include the id, it's the key
      ...raw[id]
    } as EncodedSearchDataEntry
    if (!entry.title && entry.words) {
      entry.title = entry.words.join(', ')
    }
    if (!entry.title) {
      entry.title = id
    }
    if (!entry.words) {
      const seg = new Intl.Segmenter(locale, { granularity: 'word' })
      entry.words = [...seg.segment(entry.title)].filter(x => x.isWordLike).map(x => x.segment)
    }
    if (!entry.body) {
      entry.body = ''
    }
    if (!entry.tags) {
      entry.tags = []
    }
    if (!entry.media) {
      entry.media = []
    }
  }
  return data
}

/** makes an encoded-search-data's links, thumbnails and encode urls absolute, against the file's url */
export function resolveSearchDataURLs (data: EncodedSearchData, url: string): EncodedSearchData {
  for (const entry of Object.values(data)) {
    if (entry.link) entry.link = (new URL(entry.link, url)).toString()
    if (entry.nav) entry.nav = entry.nav.map(([label, link]) => [label, (new URL(link, url)).toString()])
    if (entry.author && entry.author.link) {
      entry.author.link = (new URL(entry.author.link, url)).toString()
    }
    if (entry.author && entry.author.avatar) {
      entry.author.avatar = (new URL(entry.author.avatar, url)).toString()
    }
    if (entry.provider && entry.provider.link) {
      entry.provider.link = (new URL(entry.provider.link, url)).toString()
    }
    for (const mediaItem of entry.media) {
      mediaItem.thumbnail = (new URL(mediaItem.thumbnail, url)).toString()
      for (const encode of mediaItem.encodes) {
        encode.url = (new URL(encode.url, url)).toString()
      }
    }
  }
  return data
}
