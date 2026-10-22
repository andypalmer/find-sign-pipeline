import type { EncodedSearchDataEntry, OrthagonalColumnData, OrthagonalIndex } from './types.ts'
import { parseVectorPack, type WordVector } from './vectors.ts'
import { times } from '@andypalmer/find-sign-util'

export type LoadedOrthagonalIndex = {
  url: string,
  meta: OrthagonalIndex,
  entries: LoadedOrthagonalEntry[]
}

export type LoadedOrthagonalEntry = {
  id?: string, // entry name
  aliases?: string[], // old ids (permalinks) that redirect to this entry
  title?: string, // entry string title
  words?: string[], // normalized searchable words
  vectors?: WordVector[], // searchable word vectors
  link?: string, // link this entry points to
  tags?: string[], // list of hashtags
  author?: {
    id?: string, // author username with tag-like character rules
    name?: string, // human friendly name e.g. display name or real name
    link?: string, // url to author's site/profile
    avatar?: string, // url to author's avatar image
  },
  provider?: {
    id?: string,
    name?: string, // friendly name
    link?: string, // url link to provider website
    verb?: string, // discovery verb like 'shared' or 'invented'
  }
  timestamp?: number, // epochMs timestamp
  englishPhrases?: string[], // English expressions the sign translates
  sourceCreated?: number, // epochMs, when the source says the sign was made
  sourceUpdated?: number, // epochMs, when the source says it last changed
  load: () => Promise<EncodedSearchDataEntry>,
  indexURL: string
}

export class OutdatedError extends Error {
  indexURL: string

  constructor (message: string, indexURL: string) {
    super(`${message}: ${indexURL}`)
    this.indexURL = indexURL
  }
}

/** load the search index. A requested column the index doesn't have (such as aliases, in indexes built
 * before it existed) is left unset on its entries */
export async function loadIndex (url: string, columns: string[] = [], forceReload = false, globalVectors?: { [word: string]: WordVector }): Promise<LoadedOrthagonalIndex> {
  try {
    const columnData: { [name: string]: OrthagonalColumnData } = {}
    const forceRecheck: RequestInit = { cache: 'no-cache' }
    const lazyCache: RequestInit = { cache: 'default' }
    const loadOptions: RequestInit = forceReload ? forceRecheck : lazyCache

    const [meta, vectors] = await Promise.all([
      fetch(`${url}/meta.json`, forceRecheck).then(x => x.json() as Promise<OrthagonalIndex>),
      columns.includes('vectors') && !globalVectors ? fetch(`${url}/vectors.lps`, loadOptions)
        .then(x => x.arrayBuffer())
        .then(arrayBuffer => {
          const output: { [word: string]: WordVector } = {}
          for (const { word, getVector } of parseVectorPack(new Uint8Array(arrayBuffer))) {
            output[word] = getVector()
          }
          return output
        }) : Promise.resolve(globalVectors),
      ...columns.filter(x => x !== 'vectors').map(async (name: string) => {
        const response = await fetch(`${url}/${name}.json`, loadOptions)
        if (response.status === 404) return
        const data: OrthagonalColumnData = await response.json()
        columnData[name] = data
      })
    ])

    const index: LoadedOrthagonalIndex = {
      url,
      meta,
      entries: [...times(meta.entries, idx => {
        const obj: LoadedOrthagonalEntry & { [column: string]: any } = {
          /** searchable vectors */
          vectors: [] as WordVector[],
          /** load this entry's full definition file */
          load: async () => loadEntry(index, idx),
          indexURL: url
        }
        for (const columnName of columns) {
          if (columnName === 'vectors') continue
          if (!meta.columns[columnName]) continue
          const { isVectorIndexed, type: columnType } = meta.columns[columnName]
          const data = columnData[columnName]
          if (data.buildID !== meta.buildID) throw new OutdatedError('Column buildID doesn’t match meta buildID', url)
          if (data.entries[idx] !== null) {
            obj[columnName] = data.entries[idx]
          } else {
            obj[columnName] = {
              'string': '',
              'string[]': [],
              'number': 0,
              'number[]': [],
              'object': {}
            }[columnType]
          }
          if (isVectorIndexed && columns.includes('vectors')) {
            for (const word of data.entries[idx]) {
              const vector = vectors?.[word] || vectors?.[word.toLowerCase()]
              if (vector) (obj.vectors as WordVector[]).push(vector)
            }
          }
        }
        return obj
      })]
    }

    return index
  } catch (err) {
    if (forceReload === false && err instanceof OutdatedError) {
      return await loadIndex(url, columns, true)
    } else {
      throw err
    }
  }
}

/** load an entry from an index using it's entry number */
export async function loadEntry (index: LoadedOrthagonalIndex, number: number): Promise<EncodedSearchDataEntry> {
  const shardNumber = Math.floor(number / index.meta.entriesPerShard)
  const entryNumber = number % index.meta.entriesPerShard
  const response = await fetch(`${index.url}/shard-${shardNumber}.json`, { cache: 'no-store' })
  const json: OrthagonalColumnData = await response.json()
  if (json.buildID !== index.meta.buildID) throw new OutdatedError('Entry buildID unsyncronized, reload', index.url)
  const entry: EncodedSearchDataEntry = json.entries[entryNumber]
  // media urls are stored relative to the index folder (older builds stored absolute urls, which pass through)
  const indexFolderURL = `${index.url}/`
  for (const mediaItem of entry.media || []) {
    mediaItem.thumbnail = (new URL(mediaItem.thumbnail, indexFolderURL)).toString()
    for (const encode of mediaItem.encodes || []) {
      encode.url = (new URL(encode.url, indexFolderURL)).toString()
    }
  }
  return entry
}
