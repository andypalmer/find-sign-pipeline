// Reads a version 2 index from a data server. We keep the manifests we last saw and work out each file's
// name from them. Files named after their bytes never change, so a 404 for one means our manifests are old
// (a later build cleared the file away). Then we ask for manifest.json again, ignoring the cache, work the
// file's name out again from the new manifests, and try once more. Any other failure is passed on as it is.
import type { EncodedSearchDataEntry } from './types.ts'
import type { LoadedOrthagonalEntry } from './read.ts'
import { readIndexManifest, readTopManifest, type IndexManifest, type TopManifest } from './manifest.ts'
import { TOP_MANIFEST_NAME } from './write-version-2.ts'
import { whichShardHoldsSign } from './placement.ts'
import { parseVectorPack, type WordVector } from './vectors.ts'
import normalizeWord from './normalize-word.ts'

export type LoadedVersion2Index = {
  url: string,
  indexName: string,
  entries: LoadedOrthagonalEntry[],
}

export type IndexReaderOptions = {
  fetch?: typeof globalThis.fetch, // what fetches files, when not the global fetch
  mediaBaseURL?: string, // what a sign's relative media addresses are relative to; the base address when not given
}

// what a sign without that field gets, as in version 1
const SCAN_DEFAULTS: { [field: string]: () => unknown } = {
  id: () => '', title: () => '', words: () => [], tags: () => [], link: () => '', author: () => ({}),
  timestamp: () => 0, englishPhrases: () => [], sourceCreated: () => 0, sourceUpdated: () => 0, aliases: () => []
}

export class IndexReader {
  private baseURL: string
  private mediaBaseURL: string
  private fetchFn?: typeof globalThis.fetch
  private top?: Promise<TopManifest>
  private indexManifests = new Map<string, { fileName: string, manifest: IndexManifest }>()
  private generation = 0 // goes up each time we ask for manifest.json again
  private refreshing?: Promise<void>

  constructor (baseURL: string, { fetch, mediaBaseURL }: IndexReaderOptions = {}) {
    this.baseURL = baseURL.replace(/\/+$/, '')
    this.mediaBaseURL = (mediaBaseURL ?? baseURL).replace(/\/*$/, '/')
    this.fetchFn = fetch
  }

  /** load what every search looks at for each sign in the index; shards and vectors only when needed */
  async loadIndex (indexName: string, { withVectors = false }: { withVectors?: boolean } = {}): Promise<LoadedVersion2Index> {
    const manifest = await this.indexManifestFor(indexName)
    const [scans, vectors] = await Promise.all([
      Promise.all(manifest.scans.map((_, number) => this.fetchPart(indexName, m => m.scans[number]).then(response => response.json()))),
      withVectors ? this.loadVectors(indexName, manifest.vectors.length) : Promise.resolve(undefined)
    ])

    const entries = scans.flatMap(scan => (scan.entries as { [field: string]: any }[]).map(row => {
      const entry: LoadedOrthagonalEntry & { [field: string]: any } = {
        vectors: [] as WordVector[],
        load: () => this.loadWholeSign(indexName, row.id),
        indexURL: this.baseURL
      }
      for (const field in SCAN_DEFAULTS) entry[field] = row[field] ?? SCAN_DEFAULTS[field]()
      if (vectors) {
        for (const word of entry.words as string[]) {
          const vector = vectors[normalizeWord(word)]
          if (vector) entry.vectors!.push(vector)
        }
      }
      return entry
    }))
    return { url: this.baseURL, indexName, entries }
  }

  private async loadWholeSign (indexName: string, id: string): Promise<EncodedSearchDataEntry> {
    const response = await this.fetchPart(indexName, async manifest => manifest.shards[await whichShardHoldsSign(id, manifest.shardCount)])
    const shard: { entries: EncodedSearchDataEntry[] } = await response.json()
    const found = shard.entries.find(entry => entry.id === id)
    if (!found) throw new Error(`There is no sign with the id "${id}" in index "${indexName}" any more`)
    // media addresses are relative to where the media lives; we hand out a copy with full ones
    const entry: EncodedSearchDataEntry = structuredClone(found)
    for (const mediaItem of entry.media || []) {
      mediaItem.thumbnail = new URL(mediaItem.thumbnail, this.mediaBaseURL).toString()
      for (const encode of mediaItem.encodes || []) encode.url = new URL(encode.url, this.mediaBaseURL).toString()
    }
    return entry
  }

  private async loadVectors (indexName: string, bucketCount: number) {
    const words: { [word: string]: WordVector } = {}
    await Promise.all(Array.from({ length: bucketCount }, async (_, number) => {
      const response = await this.fetchPart(indexName, m => m.vectors[number])
      for (const { word, getVector } of parseVectorPack(new Uint8Array(await response.arrayBuffer()))) words[word] = getVector()
    }))
    return words
  }

  /** fetch a content-named file of the index, working its name out from the manifests we hold; if it has gone, once more after asking for manifest.json again */
  private async fetchPart (indexName: string, pickName: (manifest: IndexManifest) => string | undefined | Promise<string | undefined>): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      // noted before we read the manifests, so a name worked out from old ones is never mistaken for a new look
      const generation = this.generation
      const manifest = await this.indexManifestFor(indexName)
      const fileName = await pickName(manifest)
      if (fileName === undefined) throw new Error(`Index "${indexName}" has no such file in its manifest`)
      const response = await this.get(fileName)
      if (response.ok) return response
      if (response.status !== 404) throw new Error(`Fetching ${fileName} failed with status ${response.status}`)
      if (attempt === 2) throw new Error(`${fileName} is missing, even after asking for ${TOP_MANIFEST_NAME} again`)
      await this.askForTopManifestAgain(generation)
    }
  }

  private async indexManifestFor (indexName: string): Promise<IndexManifest> {
    const top = await this.topManifest()
    const fileName = top.indexes[indexName]
    if (fileName === undefined) throw new Error(`There is no index called "${indexName}" in ${TOP_MANIFEST_NAME}`)
    const held = this.indexManifests.get(indexName)
    if (held?.fileName === fileName) return held.manifest
    const response = await this.get(fileName)
    if (!response.ok) throw new Error(`Fetching ${fileName} failed with status ${response.status}`)
    const manifest = readIndexManifest(await response.json())
    this.indexManifests.set(indexName, { fileName, manifest })
    return manifest
  }

  private topManifest (): Promise<TopManifest> {
    this.top ??= this.get(TOP_MANIFEST_NAME).then(async response => {
      if (!response.ok) throw new Error(`Fetching ${TOP_MANIFEST_NAME} failed with status ${response.status}`)
      return readTopManifest(await response.json())
    })
    this.top.catch(() => { this.top = undefined }) // a failed look is not remembered
    return this.top
  }

  // several files can go missing at once: the first to notice asks, and the rest wait for that answer
  private askForTopManifestAgain (generationWhenMissed: number): Promise<void> {
    if (this.generation !== generationWhenMissed) return Promise.resolve() // someone has already asked since
    this.refreshing ??= (async () => {
      try {
        const response = await this.get(TOP_MANIFEST_NAME, { cache: 'no-cache' })
        if (!response.ok) throw new Error(`Fetching ${TOP_MANIFEST_NAME} failed with status ${response.status}`)
        const top = readTopManifest(await response.json())
        this.top = Promise.resolve(top)
        this.generation += 1
      } finally {
        this.refreshing = undefined
      }
    })()
    return this.refreshing
  }

  private get (fileName: string, init?: RequestInit): Promise<Response> {
    return (this.fetchFn ?? globalThis.fetch)(`${this.baseURL}/${fileName}`, init)
  }
}
