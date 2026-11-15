// A word vector library opened once, with recent lookups remembered.
import { lru } from '@andypalmer/find-sign-util'
import { lookup as lookupIn, open, type VectorLibrary, type WordVector } from './precomputed-vectors.ts'

export type VectorLookup = {
  /** opens the library, if it isn't already */
  preload (): Promise<VectorLibrary>,
  /** a word's vector, or undefined for a word the library doesn't have */
  lookup (word: string): Promise<WordVector | undefined>,
}

export function vectorLibrary (url: string, { cacheSize = 250, fetch }: { cacheSize?: number, fetch?: typeof globalThis.fetch } = {}): VectorLookup {
  let library: Promise<VectorLibrary> | undefined
  const cache = lru(cacheSize)
  // a failed open is forgotten, so the next lookup tries again: one failed request must not spoil the rest of the page
  const preload = () => {
    if (!library) {
      const attempt = open(url, fetch)
      library = attempt
      attempt.catch(() => { if (library === attempt) library = undefined })
    }
    return library
  }
  return {
    preload,
    lookup: async word => await cache<WordVector>(word, async word => lookupIn(await preload(), word)),
  }
}
