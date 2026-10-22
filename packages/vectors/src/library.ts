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
  const preload = () => (library ??= open(url, fetch))
  return {
    preload,
    lookup: async word => await cache<WordVector>(word, async word => lookupIn(await preload(), word)),
  }
}
