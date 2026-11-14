// Cuts a set of signs into the two kinds of file a version 2 index is made of:
//  - shards hold whole signs (the body, the videos). About 16 signs each, so a page of results is ten small files.
//  - scan files hold only what every search looks at. About 1,300 signs each, so a search is a few bigger files.
// A sign goes in the shard and scan file its id hashes to, so adding or removing a sign touches one of each.
// Signs are sorted by id and keys are sorted too, so the same signs always make the same bytes, and a file
// that didn't change keeps its name.
import type { EncodedSearchData, EncodedSearchDataEntry } from './types.ts'
import { nameFileAfterItsBytes } from './content-name.ts'
import { whichShardHoldsSign } from './placement.ts'

const SIGNS_PER_SHARD = 16
const SIGNS_PER_SCAN_FILE = 1300

// what a search needs to look at every sign for, and to show it in a list
const SCAN_FIELDS = ['id', 'title', 'words', 'tags', 'englishPhrases', 'aliases', 'link', 'author', 'timestamp', 'sourceCreated', 'sourceUpdated']

export type CutSigns = {
  shardNames: string[], // file name of each shard, in shard number order
  scanNames: string[], // file name of each scan file, in scan number order
  files: { [fileName: string]: string }, // every file's contents, by file name
}

export type CutSignsOptions = {
  shardCount?: number, // keep an index's old count to avoid moving signs about; otherwise we pick one
  scanCount?: number,
}

/** how many shard files suit this many signs? */
export function howManyShards (signCount: number): number {
  return Math.max(1, Math.ceil(signCount / SIGNS_PER_SHARD))
}

/** how many scan files suit this many signs? */
export function howManyScans (signCount: number): number {
  return Math.max(1, Math.ceil(signCount / SIGNS_PER_SCAN_FILE))
}

export async function cutSigns (searchData: EncodedSearchData, options: CutSignsOptions = {}): Promise<CutSigns> {
  // as in version 1, a sign's own id wins over the key it was stored under, and the id is what places it
  const entries = Object.entries(searchData)
    .map(([key, data]): { [field: string]: unknown, id: string } => ({ id: key, ...(data as Partial<EncodedSearchDataEntry>) }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const shardCount = options.shardCount ?? howManyShards(entries.length)
  const scanCount = options.scanCount ?? howManyScans(entries.length)
  requireWholeNumberAboveZero(shardCount, 'shard count')
  requireWholeNumberAboveZero(scanCount, 'scan count')

  const shardRows: object[][] = Array.from({ length: shardCount }, () => [])
  const scanRows: object[][] = Array.from({ length: scanCount }, () => [])
  const places = await Promise.all(entries.map(async ({ id }) => [await whichShardHoldsSign(id, shardCount), await whichShardHoldsSign(id, scanCount)] as const))
  entries.forEach((entry, position) => {
    const [shard, scan] = places[position]
    shardRows[shard].push(entry)
    scanRows[scan].push(Object.fromEntries(SCAN_FIELDS.filter(field => entry[field] !== undefined).map(field => [field, entry[field]])))
  })

  const files: { [fileName: string]: string } = {}
  const nameAll = (stem: string, rowsByNumber: object[][]) => Promise.all(rowsByNumber.map(async (entries, number) => {
    const contents = canonicalJSON({ entries })
    const fileName = await nameFileAfterItsBytes(`${stem}-${number}`, 'json', contents)
    files[fileName] = contents
    return fileName
  }))
  const [shardNames, scanNames] = await Promise.all([nameAll('shard', shardRows), nameAll('scan', scanRows)])
  return { shardNames, scanNames, files }
}

function requireWholeNumberAboveZero (value: number, what: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`The ${what} must be a whole number above zero, not ${value}`)
}

// JSON with the keys of every object in sorted order, so two objects that mean the same make the same text
function canonicalJSON (value: unknown): string {
  return JSON.stringify(value, (_key, inner) => {
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    }
    return inner
  })
}
