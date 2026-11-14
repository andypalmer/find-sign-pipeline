// The two kinds of manifest in a version 2 index. `manifest.json` is the one file that can change: it names
// each index's own manifest. An index manifest never changes (it is named after its bytes) and lists the
// files that make up that index. We read them strictly: a file name goes on the end of the data server's
// address, and a missing list must never be mistaken for an empty one.

export const SUPPORTED_VERSION = 2

export type TopManifest = {
  version: 2,
  indexes: { [indexName: string]: string }, // index name -> file name of that index's own manifest
}

export type IndexManifest = {
  shardCount: number,
  shards: string[], // files of whole signs
  scans: string[], // files of what every search looks at
  vectors: string[], // files of word vectors
}

const PLAIN_FILE_NAME = /^[A-Za-z0-9._-]+$/

/** read manifest.json (already parsed from its JSON) */
export function readTopManifest (json: unknown): TopManifest {
  const manifest = requireObject(json, 'manifest.json')
  if (manifest.version !== SUPPORTED_VERSION) {
    throw new Error(`manifest.json is version ${JSON.stringify(manifest.version)}, and we only know version ${SUPPORTED_VERSION}`)
  }
  const indexes = manifest.indexes
  if (!isPlainObject(indexes)) throw new Error('manifest.json has no indexes list')
  const checked: { [indexName: string]: string } = {}
  for (const [indexName, fileName] of Object.entries(indexes)) {
    checked[indexName] = requirePlainFileName(fileName, `the manifest for index "${indexName}"`)
  }
  return { version: SUPPORTED_VERSION, indexes: checked }
}

/** read one index's manifest (already parsed from its JSON) */
export function readIndexManifest (json: unknown): IndexManifest {
  const manifest = requireObject(json, 'index manifest')
  const { shardCount } = manifest
  if (typeof shardCount !== 'number' || !Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`The index manifest's shard count must be a whole number above zero, not ${JSON.stringify(shardCount)}`)
  }
  return {
    shardCount,
    shards: readFileNameList(manifest.shards, 'shards'),
    scans: readFileNameList(manifest.scans, 'scans'),
    vectors: readFileNameList(manifest.vectors, 'vectors'),
  }
}

function readFileNameList (list: unknown, listName: string): string[] {
  if (!Array.isArray(list)) throw new Error(`The index manifest has no ${listName} list`)
  return list.map(fileName => requirePlainFileName(fileName, `a file in the ${listName} list`))
}

function requirePlainFileName (fileName: unknown, what: string): string {
  if (typeof fileName !== 'string' || !PLAIN_FILE_NAME.test(fileName) || fileName.includes('..') || fileName === '.') {
    throw new Error(`${what} must be one plain file name, not ${JSON.stringify(fileName)}`)
  }
  return fileName
}

function requireObject (value: unknown, what: string): { [key: string]: unknown } {
  if (!isPlainObject(value)) throw new Error(`${what} is not a manifest (it should be a JSON object)`)
  return value
}

function isPlainObject (value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
