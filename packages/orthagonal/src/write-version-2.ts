// Writes a version 2 collection in memory, and says what order to publish its files in. Each index is written
// on its own (its shards, its scan files, its manifest). The word vectors are written once for the whole
// collection, because the indexes share most of their words.
// The order is what keeps visitors safe: every file named after its bytes goes out first, then each index's
// manifest, and `manifest.json` last. Until that last write, visitors still see the old, complete build.
import type { Vector } from '@andypalmer/vectors'
import type { EncodedSearchData } from './types.ts'
import type { IndexManifest, TopManifest } from './manifest.ts'
import { SUPPORTED_VERSION } from './manifest.ts'
import { nameFileAfterItsBytes } from './content-name.ts'
import { cutSigns, nextScanCount, nextShardCount } from './cut-signs.ts'
import { cutVectors } from './cut-vectors.ts'
import normalizeWord from './normalize-word.ts'

export const TOP_MANIFEST_NAME = 'manifest.json'

export type PublishedFile = { name: string, contents: string | Uint8Array }

export type WrittenIndex = {
  manifestName: string, // file name of this index's own manifest
  manifest: IndexManifest,
  files: PublishedFile[], // every file of the index, its manifest last
}

export type WriteVersion2IndexOptions = {
  // The last build's index manifest. With it, we keep that build's counts (see nextShardCount) so signs stay
  // where they were. Without it this is a first build and we pick the counts.
  previous?: IndexManifest,
  // counts to use whatever the last build had
  shardCount?: number,
  scanCount?: number,
}

export type WrittenVectors = {
  vectorNames: string[], // file name of each vector bucket, in bucket number order
  files: PublishedFile[],
}

export type WriteVersion2VectorsOptions = {
  lookupVector: (word: string) => Promise<Vector | undefined>,
  keepVectors?: { [word: string]: Vector }, // words to keep even if no sign uses them now (the last build's)
  previous?: TopManifest, // the last build's manifest.json: we keep its bucket count
  bucketCount?: number, // a count to use whatever the last build had
}

const LOOKUPS_AT_ONCE = 3
const PLAIN_INDEX_NAME = /^[A-Za-z0-9_-]+$/

export async function writeVersion2Index (indexName: string, searchData: EncodedSearchData, options: WriteVersion2IndexOptions = {}): Promise<WrittenIndex> {
  if (!PLAIN_INDEX_NAME.test(indexName)) throw new Error(`The index name must be letters, numbers, dashes and underscores only, not "${indexName}"`)

  const { previous } = options
  const signCount = Object.keys(searchData).length
  const signs = await cutSigns(searchData, {
    shardCount: options.shardCount ?? (previous && nextShardCount(previous.shardCount, signCount)),
    scanCount: options.scanCount ?? (previous && nextScanCount(previous.scans.length, signCount))
  })

  const manifest: IndexManifest = {
    shardCount: signs.shardNames.length,
    shards: signs.shardNames,
    scans: signs.scanNames
  }
  const manifestContents = JSON.stringify(manifest)
  const manifestName = await nameFileAfterItsBytes(`index-${indexName}`, 'json', manifestContents)

  const files: PublishedFile[] = [
    ...[...signs.shardNames, ...signs.scanNames].map(name => ({ name, contents: signs.files[name] })),
    { name: manifestName, contents: manifestContents }
  ]
  return { manifestName, manifest, files }
}

/**
 * the word vectors for every index of a collection, in one set of buckets. Indexes share most of their words,
 * so one set means a visitor fetches each word's vector once, not once per index. We look up each word once,
 * and with the last build's manifest we keep its bucket count, since changing it would move every word.
 */
export async function writeVersion2Vectors (collection: { [indexName: string]: EncodedSearchData }, options: WriteVersion2VectorsOptions): Promise<WrittenVectors> {
  const found = await lookUpVectorsForWordsIn(Object.values(collection), options.lookupVector)
  const cut = await cutVectors({ ...options.keepVectors, ...found }, { bucketCount: options.bucketCount ?? options.previous?.vectors.length })
  return { vectorNames: cut.vectorNames, files: cut.vectorNames.map(name => ({ name, contents: cut.files[name] })) }
}

/** the one file that can change: it says which manifest each index has now */
export function writeTopManifest (manifestNames: { [indexName: string]: string }, vectorNames: string[]): PublishedFile {
  const manifest: TopManifest = { version: SUPPORTED_VERSION, indexes: manifestNames, vectors: vectorNames }
  return { name: TOP_MANIFEST_NAME, contents: JSON.stringify(manifest) }
}

/** every file of these indexes, once each, in the order that is never wrong to publish them in */
export function planPublishOrder (indexes: { [indexName: string]: WrittenIndex }, vectors: WrittenVectors): PublishedFile[] {
  const written = Object.values(indexes)
  const manifestNames = new Set(written.map(index => index.manifestName))
  const contentFiles = [...written.flatMap(index => index.files.filter(file => !manifestNames.has(file.name))), ...vectors.files]
  const manifestFiles = written.map(index => index.files.find(file => file.name === index.manifestName)!)
  const manifestNamesByIndex = Object.fromEntries(Object.entries(indexes).map(([name, index]) => [name, index.manifestName]))
  return withoutRepeats([...contentFiles, ...manifestFiles, writeTopManifest(manifestNamesByIndex, vectors.vectorNames)])
}

function withoutRepeats (files: PublishedFile[]): PublishedFile[] {
  const seen = new Set<string>()
  return files.filter(file => !seen.has(file.name) && !!seen.add(file.name))
}

async function lookUpVectorsForWordsIn (searchDatas: EncodedSearchData[], lookupVector: WriteVersion2VectorsOptions['lookupVector']) {
  const uniqueWords = new Set<string>()
  for (const searchData of searchDatas) {
    for (const entry of Object.values(searchData)) {
      for (const word of entry.words) uniqueWords.add(normalizeWord(word))
    }
  }
  const queue = [...uniqueWords]
  const found: { [word: string]: Vector } = {}
  await Promise.all(Array.from({ length: LOOKUPS_AT_ONCE }, async () => {
    while (queue.length) {
      const word = queue.shift() as string
      const vector = await lookupVector(word)
      if (vector) found[word] = vector
    }
  }))
  return found
}
