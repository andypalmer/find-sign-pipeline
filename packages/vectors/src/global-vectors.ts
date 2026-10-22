import { parse, type WordVector } from './precomputed-vectors.ts'

/** every word and its vector in a vectors.lps file, or undefined when there isn't one */
export default async function openGlobalVectors (path: string, fetch: typeof globalThis.fetch = globalThis.fetch): Promise<{ [word: string]: WordVector } | undefined> {
  const response = await fetch(path, { cache: 'no-cache' })
  if (response.ok) {
    const buffer = new Uint8Array(await response.arrayBuffer())

    const obj: { [word: string]: WordVector } = {}
    for (const { word, getVector} of parse(buffer)) {
      obj[word] = getVector()
    }

    return obj
  }
}
