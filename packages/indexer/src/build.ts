// Building a provider's search index: read its encoded-search-data, apply overrides, keep its record file (each
// sign's readable id), map its tags onto Find Sign's vocabulary and apply its tag claims, write the orthagonal
// index, then rebuild the global word vectors from every index.
import { fn } from '@andypalmer/find-sign-util'
import { parseRecordFile } from '@andypalmer/records'
import type { DataStore } from '@andypalmer/data-store'
import { writeIndex, type EncodedSearchData } from '@andypalmer/orthagonal'
import { applyClaims, decidingClaims, mappings, mapTags, type ProviderMapping } from '@andypalmer/tags'
import { claimsIn } from './claims.ts'
import { build as buildVectors, parse as parseVectors, type Vector, type WordVector } from '@andypalmer/vectors'
import { readEncodedSearchData } from './encoded-search-data.ts'
import { mergeIdenticalMedia } from './merge.ts'
import { overridesIn } from './overrides.ts'
import { recordStoreIn, type RecordStore } from './record-store.ts'
import { rebaseRecordFile, updateRecordFile } from './records.ts'
import relativeURL from './relative-url.ts'

export type IndexSettings = {
  /** the find-sign collection: indexes, overrides, claims and record files are kept in it */
  store: DataStore,
  /** that collection's url, ending in /. Media urls in indexes are made relative to it, and record files'
   * urls relative to their place in it */
  collectionURL: string,
  /** the url of the folder holding the encoded-search-data files, <provider>.json */
  encodedSearchDataURL: string,
  /** the folder in the collection the indexes are in, usually "index" */
  indexName: string,
  /** every provider's id: global-vectors.lps holds the words of all their indexes */
  indexes: string[],
  /** a word's vector, from the word vector library */
  lookupVector: (word: string) => Promise<Vector | undefined>,
  /** precision of global-vectors.lps, from 0 to 1 (default 1) */
  vectorFidelity?: number,
  /** for splitting titles into words, when an entry has none */
  locale?: string,
  /** reads the encoded-search-data. Default: the global fetch */
  fetch?: typeof globalThis.fetch,
  /** where record files are kept. Default: records/ in the collection */
  records?: RecordStore,
  /** index signs whose videos are identical (by source sha256) as one result, the others' ids leading to it.
   * Default: true */
  mergeIdenticalMedia?: boolean,
  /** how each provider's tags map onto Find Sign's vocabulary, by provider id. A provider without one keeps its
   * tags as they are. Default: @andypalmer/tags' mappings */
  tagMappings?: ReadonlyMap<string, ProviderMapping>,
}

/** the records a provider's spider keeps beside its encoded-search-data (<provider>.records.json), if it has any,
 * with urls rewritten for where the build keeps records. A first build starts from them, so signs keep the ids
 * and aliases the spider gave them, rather than being given ids of the build's own */
async function spiderRecords (provider: string, encodedSearchDataURL: string, recordsURL: string, fetch = globalThis.fetch) {
  const url = `${encodedSearchDataURL}/${provider}.records.json`
  const response = await fetch(url)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return await rebaseRecordFile(parseRecordFile(await response.text()), link => relativeURL(recordsURL, new URL(link, url).toString()))
}

export type BuildOptions = {
  log?: (...things: any[]) => void,
  progress?: (n: number) => void,
  /** reuse the vectors from the provider's last build instead of looking every word up in the vector library.
   * Don't use it when the vector library may have changed since */
  fast?: boolean,
}

export async function buildSearchIndex (provider: string, settings: IndexSettings, opts: BuildOptions = {}) {
  const { store, collectionURL, encodedSearchDataURL, indexName, indexes, lookupVector, vectorFidelity = 1, locale, fetch } = settings
  const log = opts.log || ((...str) => console.log(...str))
  const progress = opts.progress || (() => {})
  const records = settings.records || recordStoreIn(store, collectionURL)
  const overrides = overridesIn(store)

  log(`Reading search data ${provider}...`)
  const encodedURL = `${encodedSearchDataURL}/${provider}.json`
  const allData = await readEncodedSearchData(encodedURL, { locale, fetch })
  progress(0.01)

  // unpublished entries aren't indexed, but stay in the records, so their ids stay reserved
  const published = Object.keys(allData).filter(key => allData[key].published !== false)

  log(`Reading overrides...`)
  // overrides apply only to published entries, so an override can't republish one
  const overridesList = (await overrides.list()).filter(x => x.provider === provider && published.includes(x.id))
  log(`Loading ${overridesList.length} override files...`)
  let overrideNum = 0
  for (const { id } of overridesList) {
    allData[id] = {
      ...allData[id],
      ...await overrides.get(provider, id)
    }
    overrideNum += 1
    progress(0.01 + (0.04 * (overrideNum / overridesList.length)))
  }

  log(`Updating records...`)
  const recordsURL = records.url(provider)
  const { file, changes } = await updateRecordFile(await records.read(provider) ?? await spiderRecords(provider, encodedSearchDataURL, recordsURL, fetch), allData, {
    provider,
    seenAt: new Date().toISOString(),
    locale,
    // stored relative to the record file. Media sources are still relative to the encoded-search-data file
    url: url => relativeURL(recordsURL, new URL(url, encodedURL).toString()),
    onQuirk: ({ id, message }) => log(`  ${id}: ${message}`),
  })
  await records.write(file)
  if (changes) {
    log(`Records: ${Object.entries(changes).filter(([, ids]) => ids.length).map(([change, ids]) => `${ids.length} ${change}`).join(', ') || 'none'}`)
  } else {
    log(`Records: created for ${file.records.length} signs`)
  }

  // index published entries at their readable ids
  // the records keep the provider's tags as it gave them: the index has them in Find Sign's vocabulary
  const tagMapping = (settings.tagMappings ?? mappings).get(provider)
  if (!tagMapping) log(`No tag mapping for ${provider}: its tags are indexed as they are`)
  log(`Reading claims...`)
  const claimed = await claimsIn(store).read(provider)
  for (const { claim, problem } of claimed?.problems ?? []) log(`  claim left out (${problem}): ${JSON.stringify(claim)}`)
  const decided = decidingClaims(claimed?.file.claims ?? [])
  const unknown = [...decided.keys()].filter(sourceId => !published.includes(sourceId))
  if (unknown.length) log(`  ${unknown.length} claimed signs aren't in this index: ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? ', ...' : ''}`)

  const bySourceId = new Map(file.records.map(record => [record.sourceId, record]))
  let searchData: EncodedSearchData = {}
  // the tags each sign's claims took away, by its id: a merged sign loses them too
  const removedTags = new Map<string, string[]>()
  for (const key of published) {
    const record = bySourceId.get(key)!
    const entry = allData[key]
    const { tags, removed } = applyClaims(tagMapping ? mapTags(tagMapping, entry.tags) : entry.tags, decided.get(key))
    if (removed.length) removedTags.set(record.id, removed)
    searchData[record.id] = { ...entry, id: record.id, sourceId: key, aliases: record.aliases, tags }
  }
  const claimedSigns = [...decided.keys()].filter(sourceId => published.includes(sourceId)).length
  if (claimedSigns) log(`Claims: applied to ${claimedSigns} signs`)

  if (settings.mergeIdenticalMedia ?? true) {
    const result = mergeIdenticalMedia(searchData)
    searchData = result.data
    // a tag a claim took from any of the signs stays off the one they're merged into
    for (const [kept, others] of result.merged) {
      const removed = new Set([kept, ...others].flatMap(id => removedTags.get(id) ?? []))
      if (removed.size) searchData[kept] = { ...searchData[kept], tags: searchData[kept].tags.filter(tag => !removed.has(tag)) }
    }
    const count = [...result.merged.values()].flat().length
    if (count) log(`Merged ${count} signs into ${result.merged.size} others with identical videos`)
  }

  // store media urls relative to the index folder, so the index works from whatever host serves it
  // (the reader resolves them back to absolute urls)
  const indexFolder = fn`${indexName}/${provider}`
  const indexFolderURL = `${collectionURL}${indexFolder}/`
  for (const id in searchData) {
    for (const mediaItem of searchData[id].media) {
      // only for merging: the site has no use for it
      delete mediaItem.sourceSha256
      mediaItem.thumbnail = relativeURL(indexFolderURL, mediaItem.thumbnail)
      for (const encode of mediaItem.encodes) {
        encode.url = relativeURL(indexFolderURL, encode.url)
      }
    }
  }

  let vectorCache: Map<string, WordVector> | undefined
  if (opts.fast) {
    log(`Reading previous build vector cache...`)
    const vectorCacheData = await store.read(`${indexFolder}/vectors.lps`)
    if (vectorCacheData) {
      vectorCache = new Map([...parseVectors(vectorCacheData)].map(({ word, getVector }) => [word, getVector()]))
    }
  }

  log(`Building orthagonal index in memory...`)
  const files = await writeIndex(searchData, {
    lookupVector: async word => vectorCache?.get(word) ?? await lookupVector(word),
    log,
    progress: (num) => progress(0.05 + (num * 0.90))
  })

  log(`Search index files constructed, writing...`)
  progress(0.96)
  await store.writeMany(indexFolder, files)
  // a smaller index than last time has fewer shards: the rest would be left behind
  const stale = (await store.list(indexFolder)).filter(name => /^shard-\d+\.json$/.test(name) && !(name in files))
  for (const name of stale) await store.delete(`${indexFolder}/${name}`)
  if (stale.length) log(`Removed ${stale.length} shards left from a larger build`)
  progress(0.97)
  log(`Rebuilding global word vector cache: Loading vector files...`)
  const vectorFiles = await Promise.all(indexes.map(async (index: string) => {
    const vectors = await store.read(fn`${indexName}/${index}/vectors.lps`)
    return vectors && parseVectors(vectors)
  }))
  progress(0.98)
  log(`Building global word vector cache...`)
  const globalVectors: { [word: string]: WordVector } = {}
  for (const vectors of vectorFiles) {
    if (vectors) { // only if the index existed and successfully loaded...
      for (const { word, getVector } of vectors) {
        if (!globalVectors[word]) globalVectors[word] = getVector()
      }
    }
  }
  progress(0.99)
  log(`Writing global word vector cache...`)
  await store.write(fn`${indexName}/global-vectors.lps`, buildVectors(globalVectors, vectorFidelity))
  progress(1.00)
  log('Build complete')
}
