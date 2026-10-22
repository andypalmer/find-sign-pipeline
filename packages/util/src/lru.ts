type CacheEntry = {
  key: string,
  value: any
}

type MaybePromise<Type> = Promise<Type> | Type

/**
 * Create a Least Recently Used cache of a given size, which returns items from it's cache when the match key
 * or calls an async callback to get the item if it isn't in the cache
 */
export default function lru (size: number) {
  const cacheList: CacheEntry[] = []

  async function cache<Type> (key: string, getValue: (key: string) => MaybePromise<Type | undefined>): Promise<Type | undefined> {
    let result = cacheList.find(entry => entry.key === key)
    if (result === undefined) {
      const value = await getValue(key)
      if (value !== undefined) {
        result = { key, value }
      }
    }

    if (result) {
      cacheList.unshift(result)
      if (cacheList.length > size) cacheList.pop()
      return result.value
    }
  }

  return cache
}