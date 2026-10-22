// Shared fixture data for characterisation tests: two small providers ("alpha" and "beta"),
// a tiny 4-dimensional word vector library, and helpers to publish them to a FakeDataServer.
import { EncodedSearchDataBase, VectorLibraryBase, testSettings } from './settings.ts'
import type { FakeDataServer } from './fake-data-server.ts'
import { build as buildVectors } from '@andypalmer/vectors'
import { buildSearchIndex } from '@andypalmer/indexer'
import { createHash } from 'node:crypto'
import { bytesToPrefixBits } from '@andypalmer/find-sign-util'

// independent of the util package's sha256, so a broken sha256 there makes vector lookups fail
const sha256 = async (word: string) => new Uint8Array(createHash('sha256').update(word).digest())

// 4 dimensional "meaning space": [feline, canine, vehicle, cargo]
export const wordVectors: { [word: string]: number[] } = {
  cat: [1, 0, 0, 0],
  kitten: [0.9, 0.1, 0, 0],
  feline: [0.95, 0.05, 0, 0], // only in the vector library, never in any index
  dog: [0.4, 0.6, 0, 0],
  car: [0, 0, 1, 0],
  truck: [0, 0, 0.8, 0.2],
  red: [0, 0, 0, 1],
}

export function media (name: string) {
  return {
    type: 'video',
    source: { method: 'fetch', url: `https://source.test/${name}.mp4`, version: '1' },
    thumbnail: `${name}-media/${name}-0.webp`,
    timestamp: 1000,
    encodes: [
      { type: 'video/mp4', width: 512, height: 288, container: 'mp4', codec: 'h264', version: 'mp4:x264:22@512x288', url: `${name}-media/${name}-0.mp4`, byteSize: 100, duration: 2 },
      { type: 'video/webm', width: 1024, height: 576, container: 'webm', codec: 'vp9', version: 'webm:vp9:32@1024x576', url: `${name}-media/${name}-0.webm`, byteSize: 50, duration: 2 },
    ]
  }
}

const alphaProvider = { id: 'alpha', name: 'Alpha Dictionary', verb: 'documented', link: 'https://alpha.test/' }
const betaProvider = { id: 'beta', name: 'Beta Community', verb: 'shared', link: 'https://beta.test/' }

export function alphaSearchData () {
  return {
    cat: {
      title: 'Cat', words: ['cat'], tags: ['animal'], body: 'A small feline.',
      link: 'https://alpha.test/cat', nav: [['Alpha', 'https://alpha.test/'], ['Cat', 'https://alpha.test/cat']],
      media: [media('cat')], timestamp: 3000, provider: alphaProvider,
    },
    dog: {
      title: 'Dog', words: ['dog'], tags: ['animal'], body: 'A canine.',
      link: 'https://alpha.test/dog', media: [media('dog')], timestamp: 1000, provider: alphaProvider,
    },
    car: {
      title: 'Car', words: ['car'], tags: ['vehicle', 'lexis.crude'], body: '',
      link: 'https://alpha.test/car', media: [media('car')], timestamp: 2000, provider: alphaProvider,
      author: { id: 'phoenix', name: 'Phoenix', link: 'https://alpha.test/phoenix' },
    },
    hidden: {
      title: 'Hidden', words: ['cat'], tags: [], body: '', media: [media('hidden')], published: false,
      timestamp: 9000, provider: alphaProvider,
    },
  }
}

export function betaSearchData () {
  return {
    kitten: {
      title: 'Kitten', words: ['Kitten'], tags: ['animal', 'invented'], body: 'Line one\nLine two',
      link: 'https://beta.test/kitten', media: [media('kitten')], timestamp: 4000, provider: betaProvider,
    },
    'red-truck': {
      title: 'Red truck', words: ['red', 'truck'], tags: ['vehicle'], body: '',
      link: 'https://beta.test/red-truck', media: [media('red-truck')], provider: betaProvider,
    },
  }
}

/** publish a fake fasttext-style sharded vector library, matching precomputed-vectors.ts lookup() */
export async function publishVectorLibrary (server: FakeDataServer, vectors = wordVectors, shardBits = 2) {
  server.set(`${VectorLibraryBase}/info.json`, { version: 5, shardBits, entries: Object.keys(vectors).length, vectorSize: 4, source: 'test', built: '2026-01-01T00:00:00Z' })
  const shards: { [bucket: number]: { [word: string]: number[] } } = {}
  for (const word in vectors) {
    const bucket = parseInt(bytesToPrefixBits(await sha256(word), shardBits), 2)
    shards[bucket] = { ...(shards[bucket] || {}), [word]: vectors[word] }
  }
  for (let bucket = 0; bucket < 2 ** shardBits; bucket++) {
    server.set(`${VectorLibraryBase}/${bucket}.lps`, buildVectors(shards[bucket] || {}))
  }
}

/** publish encoded-search-data json files for alpha and beta */
export function publishSearchData (server: FakeDataServer, data: { [provider: string]: object } = { alpha: alphaSearchData(), beta: betaSearchData() }) {
  for (const provider in data) {
    server.set(`${EncodedSearchDataBase}/${provider}.json`, data[provider])
  }
}

/** publish everything and run the real index build for both fixture providers */
export async function publishBuiltIndexes (server: FakeDataServer) {
  await publishVectorLibrary(server)
  publishSearchData(server)
  const quiet = { log: () => {}, progress: () => {} }
  await buildSearchIndex('alpha', testSettings(), quiet)
  await buildSearchIndex('beta', testSettings(), quiet)
  server.resetRequests()
}
