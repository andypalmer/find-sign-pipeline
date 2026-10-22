// lookup word vectors in precomputed index
import { bytesToPrefixBits, bytesToString, chunkIterable, iterateLengthPrefixed, sha256 } from '@andypalmer/find-sign-util'
import varint from 'varint'
import type { Vector } from './vector-utilities.ts'

export type VectorLibrary = {
  path: string, // path to folder containing settings.json and shards
  settings: VectorLibrarySettings, // object with config information about the library build and encoding
  fetch?: typeof globalThis.fetch, // what fetches its shards, when not the global fetch
}

export type VectorLibrarySettings = {
  version: 5,
  shardBits: number, // normally around 13-14
  entries: number, // normally 500k
  vectorSize: number, // usually 300 with fasttext
  source: string, // url to fasttext vec text format dataset this derives from
  built: string, // iso timestamp string for when build was done
}

export type WordVector = Float32Array

/**
 * Open precomputed vectors library
 */
export async function open (path: string, fetch?: typeof globalThis.fetch): Promise<VectorLibrary> {
  const request = await (fetch ?? globalThis.fetch)(`${path}/info.json`, { mode: 'cors', cache: 'force-cache' })
  const settings = await request.json()
  // without a fetch of its own, lookups use the global fetch as it is then
  return fetch ? { path, settings, fetch } : { path, settings }
}

/**
 * Lookup an open vector library for a specified word, returns either an array of floats (vector) or undefined
 */
export async function lookup (library: VectorLibrary, word: string): Promise<WordVector | undefined> {
  const hash = await sha256(word)
  const bucket = parseInt(bytesToPrefixBits(hash, library.settings.shardBits), 2)
  const response = await (library.fetch ?? globalThis.fetch)(`${library.path}/${bucket}.lps`, { mode: 'cors', cache: 'force-cache' })
  const buffer = new Uint8Array(await response.arrayBuffer())
  for (const { word: entryWord, getVector } of parse(buffer)) {
    if (word === entryWord) return getVector()
  }
}

export function * parse (buffer: Uint8Array) {
  const entries = chunkIterable(iterateLengthPrefixed(buffer), 3)
  for (const [wordBuffer, scaleBuffer, entryPackedVector] of entries) {
    const word = bytesToString(wordBuffer)
    yield {
      word,
      getVector: () => {
        const scaleDataView = new DataView(scaleBuffer.buffer, scaleBuffer.byteOffset, scaleBuffer.byteLength)
        const entryScale = scaleDataView.getFloat32(0)
        const scaledVector = Float32Array.from(entryPackedVector, x =>
          (((x / 255) * 2.0) - 1.0) * entryScale
        )
        return scaledVector
      }
    }
  }
}

// builds a shard, returns a Uint8Array containing all the words packed in to an lps file's contents
// used by orthagonal index to build a word cache
// if fidelity is specified as a number < 1.0, the vectors will be compressed and scaled more aggressively
// in hopes of producing a more gzip/brotli compressible result
// entries may be number arrays or Float32Arrays; the arithmetic below runs in the entries' own precision
export function build (entries: { [word: string]: Vector }, fidelity = 1.0) {
  const pieces: Uint8Array[] = []
  const textEncoder = new TextEncoder()

  for (const word in entries) {
    // push the word
    const encodedWord = textEncoder.encode(word)
    pieces.push(lpsEncode(encodedWord))

    // compute the compressed vector
    const vector = entries[word]
    const scaling = Math.max(...Array.from(vector.map(x => Math.abs(x)))) / (fidelity ** 2)
    const scaledVector = vector.map(x => x / scaling)
    const discretizedVector = scaledVector.map(x => {
      const value = ((x + 1.0) / 2.0) * 255
      return Math.round(value)
    })

    // push the scaling value
    const scaleBuffer = new ArrayBuffer(4)
    const scaleDataView = new DataView(scaleBuffer, 0, 4)
    scaleDataView.setFloat32(0, scaling)
    pieces.push(lpsEncode(new Uint8Array(scaleBuffer)))

    // push the encoded vector
    pieces.push(lpsEncode(discretizedVector))
  }

  let byteLength = 0
  for (const buffer of pieces) byteLength += buffer.length

  const outputBuffer = new Uint8Array(byteLength)
  let offset = 0
  for (const buffer of pieces) {
    outputBuffer.set(buffer, offset)
    offset += buffer.length
  }

  return outputBuffer
}

// convert a buffer to a length prefixed buffer - creates a copy
function lpsEncode (buffer: ArrayLike<number>) {
  const prefix: number[] = varint.encode(buffer.length)
  const output = Uint8Array.from([...prefix, ...Array.from(buffer)])
  return output
}
