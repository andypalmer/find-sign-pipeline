// Puts version 2 index builds in the store, and reads back what the last one left there.
//
// A build's files go out in three tiers: the files named after their bytes first (shards, scan files, vector
// buckets), then each index's own manifest, and manifest.json last. Visitors only follow manifest.json, so until
// that last write they see the old, complete build. The store writes a folder's files as one request in no
// particular order, so a tier is finished before the next starts, and a request never holds files of two tiers.
import type { DataStore } from '@andypalmer/data-store'
import {
  TOP_MANIFEST_NAME, looksContentNamed, readIndexManifest, readTopManifest,
  type IndexManifest, type PublishedFile, type PublishTiers, type TopManifest
} from '@andypalmer/orthagonal'
import { parse as parseVectors, type WordVector } from '@andypalmer/vectors'

/** what the last version 2 build left in the store */
export type LastBuild = {
  top?: TopManifest, // undefined when there has been no version 2 build yet
  indexManifests: { [indexName: string]: IndexManifest },
  words: { [word: string]: WordVector }, // every word in the shared vector buckets
}

export type PublishReport = { written: number, alreadyThere: number }

/** something that can say what the last build was, and put a new one in the store safely */
export interface IPublishVersion2Builds {
  lastBuild (): Promise<LastBuild>
  publish (tiers: PublishTiers): Promise<PublishReport>
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const textOf = (contents: string | Uint8Array) => typeof contents === 'string' ? contents : decode(contents)
const sizeOf = (file: PublishedFile) => typeof file.contents === 'string' ? new TextEncoder().encode(file.contents).length : file.contents.length

export class Version2Publisher implements IPublishVersion2Builds {
  private store: DataStore
  private folder: string
  private maxRequestBytes: number

  /** `folder` is where the version 2 files live in the store, beside each provider's own folder */
  constructor (store: DataStore, folder: string, options: { maxRequestBytes?: number } = {}) {
    this.store = store
    this.folder = folder
    this.maxRequestBytes = options.maxRequestBytes ?? 2_000_000
  }

  /**
   * Reads manifest.json, the index manifests it names and every vector bucket, so the next build can keep their
   * counts and words. Damage is an error, never "start again": starting again would write over a good build.
   */
  async lastBuild (): Promise<LastBuild> {
    const manifestBytes = await this.store.read(`${this.folder}/${TOP_MANIFEST_NAME}`)
    if (!manifestBytes) return { indexManifests: {}, words: {} }

    let json: unknown
    try {
      json = JSON.parse(decode(manifestBytes))
    } catch {
      throw new Error(`${this.folder}/${TOP_MANIFEST_NAME} is not valid JSON, so we won't write over it`)
    }
    const top = readTopManifest(json)

    const indexManifests: LastBuild['indexManifests'] = {}
    for (const [indexName, fileName] of Object.entries(top.indexes)) {
      indexManifests[indexName] = readIndexManifest(JSON.parse(decode(await this.mustRead(fileName))))
    }
    const words: LastBuild['words'] = {}
    for (const fileName of top.vectors) {
      for (const { word, getVector } of parseVectors(await this.mustRead(fileName))) words[word] = getVector()
    }
    return { top, indexManifests, words }
  }

  /** writes what the store doesn't have, tier by tier; says how many files it wrote and how many were there already */
  async publish (tiers: PublishTiers): Promise<PublishReport> {
    this.refuseAnUnsafePlan(tiers)
    // a name that is already there means the same bytes, so there is nothing to write
    const present = new Set(await this.store.list(this.folder))
    let written = 0
    let alreadyThere = 0

    for (const tier of [tiers.contentFiles, tiers.indexManifests]) {
      const missing = tier.filter(file => !present.has(file.name))
      alreadyThere += tier.length - missing.length
      for (const request of this.inRequests(missing)) {
        await this.store.writeMany(this.folder, Object.fromEntries(request.map(file => [file.name, file.contents])))
        written += request.length
      }
    }

    // manifest.json last: it is the one file that can change, and the one that makes the new build visible
    const { topManifest } = tiers
    const kept = await this.store.read(`${this.folder}/${TOP_MANIFEST_NAME}`)
    if (kept && decode(kept) === textOf(topManifest.contents)) {
      alreadyThere += 1
    } else {
      await this.store.write(`${this.folder}/${TOP_MANIFEST_NAME}`, topManifest.contents)
      written += 1
    }
    return { written, alreadyThere }
  }

  private async mustRead (fileName: string): Promise<Uint8Array> {
    const bytes = await this.store.read(`${this.folder}/${fileName}`)
    if (!bytes) throw new Error(`${TOP_MANIFEST_NAME} names ${fileName}, but it isn't in ${this.folder}`)
    return bytes
  }

  /** groups files into requests under the size limit; a file bigger than the limit goes alone */
  private inRequests (files: PublishedFile[]): PublishedFile[][] {
    const requests: PublishedFile[][] = []
    let current: PublishedFile[] = []
    let bytes = 0
    for (const file of files) {
      const size = sizeOf(file)
      if (current.length && bytes + size > this.maxRequestBytes) {
        requests.push(current)
        current = []
        bytes = 0
      }
      current.push(file)
      bytes += size
    }
    if (current.length) requests.push(current)
    return requests
  }

  private refuseAnUnsafePlan ({ contentFiles, indexManifests, topManifest }: PublishTiers) {
    const notContentNamed = [...contentFiles, ...indexManifests].filter(file => !looksContentNamed(file.name))
    if (notContentNamed.length) throw new Error(`These files should be named after their bytes, but aren't: ${notContentNamed.map(file => file.name).join(', ')}`)
    if (topManifest.name !== TOP_MANIFEST_NAME) throw new Error(`The top manifest must be called ${TOP_MANIFEST_NAME}, not ${topManifest.name}`)
  }
}
