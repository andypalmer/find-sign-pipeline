// Writes an orthagonal index: meta.json, a json file per search column, shards of full entries, and a vector
// cache of the entries' words. Every file carries the build's id, which readers check against meta.json.
import { buildVectorShard } from './vectors.ts'
import type { OrthagonalColumns, EncodedSearchData, EncodedSearchDataEntry, OrthagonalIndex } from './types.ts'
import normalizeWord from './normalize-word.ts'
import { chunk, times } from '@andypalmer/find-sign-util'
import { nanoid } from 'nanoid'
import type { Vector } from '@andypalmer/vectors'

export type WriteIndexOptions = {
  lookupVector: (word: string) => Promise<Vector | undefined>,
  log?: (...things: any[]) => void,
  progress?: (value: number) => void,
}

export async function writeIndex (searchData: EncodedSearchData, { lookupVector, log = undefined, progress = undefined }: WriteIndexOptions) {
  const exportedColumns: OrthagonalColumns = {
    id: { type: 'string', path: 'id.json' },
    title: { type: 'string', path: 'title.json' },
    words: { type: 'string[]', isVectorIndexed: true, path: 'words.json' },
    link: { type: 'string', path: 'link.json' },
    tags: { type: 'string[]', path: 'tags.json' },
    author: { type: 'object', path: 'author.json' },
    timestamp: { type: 'number', path: 'timestamp.json' },
    // English expressions the sign translates, so a search for a whole phrase can find it
    englishPhrases: { type: 'string[]', path: 'englishPhrases.json' },
    // the source's dates, so signs added together can be shown in the order their source added them
    sourceCreated: { type: 'number', path: 'sourceCreated.json' },
    sourceUpdated: { type: 'number', path: 'sourceUpdated.json' },
    // old ids that redirect to the entry, so the site can find a sign from an old permalink
    aliases: { type: 'string[]', path: 'aliases.json' }
  }

  // contents of the meta.json
  const indexFile: OrthagonalIndex = {
    buildTimestamp: Date.now(),
    buildID: nanoid(),
    entriesPerShard: 8,
    entries: Object.keys(searchData).length,
    vectorCachePath: 'vectors.lps',
    columns: exportedColumns
  }

  // setup empty arrays for the exports
  const exportDatas: { [columnName: string]: { buildID: string, entries: any[] } } = Object.fromEntries(Object.keys(exportedColumns).map(columnName => [columnName, {
    buildID: indexFile.buildID,
    entries: []
  }]))

  if (progress) progress(0.01)
  if (log) log('Building metadata...')

  const outputFiles: { [path: string]: string | Uint8Array } = { 'meta.json': JSON.stringify(indexFile) }

  if (progress) progress(0.02)
  if (log) log('Building shards and orthagonal views...')

  // build the shards and indexes
  chunk(Object.keys(searchData), indexFile.entriesPerShard).forEach((entryIDs, shardNum) => {
    if (log) log(`Building shard-${shardNum}.json`)
    outputFiles[`shard-${shardNum}.json`] = JSON.stringify({
      buildID: indexFile.buildID,
      entries: entryIDs.map(id => {
        const output: { [key: string]: any } = { id, ...(searchData[id] as Partial<EncodedSearchDataEntry>) }
        for (const key in exportedColumns) {
          const value = output[key]
          exportDatas[key].entries.push(value === undefined ? null : value)
        }
        return output
      })
    })
    if (progress) progress(0.02 + (0.07) * (shardNum / (indexFile.entries / indexFile.entriesPerShard)))
  })

  if (progress) progress(0.09)
  if (log) log('Collecting every unique word from search-data...')

  const uniqueWords: Set<string> = new Set()
  // add word vectors to cache index
  for (const id in searchData) {
    const { words } = searchData[id]
    for (const word of words) uniqueWords.add(normalizeWord(word))
  }

  if (progress) progress(0.10)
  if (log) log(`${uniqueWords.size} unique words found`)
  if (log) log('Beginning looking up word vectors, building vector cache')

  const wordsQueue = [...uniqueWords]
  let wordsLookedUp = 0
  const vectorIndex: { [word: string]: Vector } = {}
  await Promise.all([...times(3, async () => {
    while (wordsQueue.length) {
      const word = wordsQueue.shift() as string
      const vector = await lookupVector(word)
      if (vector) vectorIndex[word] = vector
      wordsLookedUp += 1
      if (progress) progress(0.10 + ((wordsLookedUp / uniqueWords.size) * 0.87))
    }
  })])

  if (progress) progress(0.98)
  if (log) log('Serializing word vector cache...')

  // export vector cache
  outputFiles['vectors.lps'] = buildVectorShard(vectorIndex)

  if (progress) progress(0.99)
  if (log) log('Serializing orthagonal json’s...')

  for (const key in exportDatas) {
    outputFiles[exportedColumns[key].path] = JSON.stringify(exportDatas[key])
  }

  if (progress) progress(1.0)
  if (log) log('Search Index data prepared')

  return outputFiles
}
