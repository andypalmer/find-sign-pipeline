// Writes a whole version 2 index in memory, and says what order to publish its files in.
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
  lookupVector: (word: string) => Promise<Vector | undefined>,
  keepVectors?: { [word: string]: Vector }, // words to keep even if no sign uses them now (the last build's)
  // The last build's index manifest. With it, we keep that build's counts (see nextShardCount) so signs and
  // words stay where they were. Without it this is a first build and we pick the counts.
  previous?: IndexManifest,
  // counts to use whatever the last build had
  shardCount?: number,
  scanCount?: number,
  bucketCount?: number,
}

const LOOKUPS_AT_ONCE = 3
const PLAIN_INDEX_NAME = /^[A-Za-z0-9_-]+$/

export async function writeVersion2Index (indexName: string, searchData: EncodedSearchData, options: WriteVersion2IndexOptions): Promise<WrittenIndex> {
  if (!PLAIN_INDEX_NAME.test(indexName)) throw new Error(`The index name must be letters, numbers, dashes and underscores only, not "${indexName}"`)

  const vectorsByWord = { ...options.keepVectors, ...await lookUpVectorsForWordsIn(searchData, options.lookupVector) }
  const { previous } = options
  const signCount = Object.keys(searchData).length
  const [signs, vectors] = await Promise.all([
    cutSigns(searchData, {
      shardCount: options.shardCount ?? (previous && nextShardCount(previous.shardCount, signCount)),
      scanCount: options.scanCount ?? (previous && nextScanCount(previous.scans.length, signCount))
    }),
    // a word's bucket is its hash modulo the bucket count, so the count never changes once an index has one
    cutVectors(vectorsByWord, { bucketCount: options.bucketCount ?? previous?.vectors.length })
  ])

  const manifest: IndexManifest = {
    shardCount: signs.shardNames.length,
    shards: signs.shardNames,
    scans: signs.scanNames,
    vectors: vectors.vectorNames
  }
  const manifestContents = JSON.stringify(manifest)
  const manifestName = await nameFileAfterItsBytes(`index-${indexName}`, 'json', manifestContents)

  const files: PublishedFile[] = [
    ...[...signs.shardNames, ...signs.scanNames].map(name => ({ name, contents: signs.files[name] })),
    ...vectors.vectorNames.map(name => ({ name, contents: vectors.files[name] })),
    { name: manifestName, contents: manifestContents }
  ]
  return { manifestName, manifest, files }
}

/** the one file that can change: it says which manifest each index has now */
export function writeTopManifest (manifestNames: { [indexName: string]: string }): PublishedFile {
  const manifest: TopManifest = { version: SUPPORTED_VERSION, indexes: manifestNames }
  return { name: TOP_MANIFEST_NAME, contents: JSON.stringify(manifest) }
}

/** every file of these indexes, once each, in the order that is never wrong to publish them in */
export function planPublishOrder (indexes: { [indexName: string]: WrittenIndex }): PublishedFile[] {
  const written = Object.values(indexes)
  const manifestNames = new Set(written.map(index => index.manifestName))
  const contentFiles = written.flatMap(index => index.files.filter(file => !manifestNames.has(file.name)))
  const manifestFiles = written.map(index => index.files.find(file => file.name === index.manifestName)!)
  const manifestNamesByIndex = Object.fromEntries(Object.entries(indexes).map(([name, index]) => [name, index.manifestName]))
  return withoutRepeats([...contentFiles, ...manifestFiles, writeTopManifest(manifestNamesByIndex)])
}

function withoutRepeats (files: PublishedFile[]): PublishedFile[] {
  const seen = new Set<string>()
  return files.filter(file => !seen.has(file.name) && !!seen.add(file.name))
}

async function lookUpVectorsForWordsIn (searchData: EncodedSearchData, lookupVector: WriteVersion2IndexOptions['lookupVector']) {
  const uniqueWords = new Set<string>()
  for (const entry of Object.values(searchData)) {
    for (const word of entry.words) uniqueWords.add(normalizeWord(word))
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
