// Admin corrections to encoded-search-data entries, kept in a collection at overrides/<provider>:<id>.json, where
// id is the entry's key in its encoded-search-data file. A build merges each over its entry.
import { bytesToString, decodeFilename, fn } from '@andypalmer/find-sign-util'
import type { DataStore } from '@andypalmer/data-store'
import type { SearchDataEncodedMedia } from '@andypalmer/orthagonal'

export type IndexOverride = {
  id?: string,
  published?: boolean,
  title?: string,
  words?: string[],
  tags?: string[],
  body?: string,
  link?: string,
  nav?: [label: string, link: string][],
  provider?: {
    id: string,
    name: string,
    link: string,
  },
  author?: {
    id: string,
    name: string,
    link: string,
    avatar: string,
  }
  media?: SearchDataEncodedMedia[],
  timestamp?: number,
}

export type Overrides = {
  list (): Promise<{ provider: string, id: string }[]>,
  /** the override for an entry. Throws when there's none */
  get (provider: string, id: string): Promise<IndexOverride>,
  set (provider: string, id: string, data: IndexOverride): Promise<void>,
  delete (provider: string, id: string): Promise<void>,
}

export function overridesIn (store: DataStore): Overrides {
  return {
    async list () {
      const filenames = await store.list('overrides')
      return filenames.filter(x => x.endsWith('.json')).map(x => {
        const [provider, id] = x.replace(/\.json$/, '').split(':').map(decodeFilename)
        return { provider, id }
      })
    },
    async get (provider, id) {
      const data = await store.read(fn`overrides/${provider}:${id}.json`)
      if (!data) throw new Error(`No override for ${provider}:${id}`)
      return JSON.parse(bytesToString(data))
    },
    async set (provider, id, data) {
      await store.write(fn`overrides/${provider}:${id}.json`, JSON.stringify(data))
    },
    async delete (provider, id) {
      await store.delete(fn`overrides/${provider}:${id}.json`)
    },
  }
}
