// The encoded-search-data file Find Sign's index build reads today, made from the records. Entries are keyed
// by sourceId, which the build keeps as each sign's sourceId while giving it a readable id of its own. Only
// encoded media is included, as media that isn't encoded can't be played.
import type { RecordFile } from '@andypalmer/records'

export function encodedSearchData (file: RecordFile): Record<string, object> {
  const data: Record<string, object> = {}
  const present = file.records.filter(record => record.provenance.status !== 'removed')
  for (const record of present.sort((a, b) => a.provenance.firstSeen.localeCompare(b.provenance.firstSeen) || a.sourceId.localeCompare(b.sourceId))) {
    data[record.sourceId] = {
      title: record.title,
      words: record.words,
      tags: record.tags,
      link: record.link,
      nav: record.nav,
      body: record.body ?? '',
      ...(record.englishPhrases?.length && { englishPhrases: record.englishPhrases }),
      media: record.media.flatMap(item => item.encoded ? [{
        type: item.type,
        source: item.source,
        thumbnail: item.encoded.thumbnail,
        timestamp: Date.parse(item.encoded.encodedAt),
        encodes: item.encoded.encodes,
        ...(item.encoded.sourceSha256 && { sourceSha256: item.encoded.sourceSha256 }),
      }] : []),
      timestamp: Date.parse(record.provenance.firstSeen),
      ...(record.sourceCreated && { sourceCreated: Date.parse(record.sourceCreated) }),
      ...(record.sourceUpdated && { sourceUpdated: Date.parse(record.sourceUpdated) }),
      provider: file.provider,
      ...(record.published === false ? { published: false } : {}),
    }
  }
  return data
}
