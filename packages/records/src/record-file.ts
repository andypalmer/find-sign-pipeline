// Reading and writing a provider's record file (find-sign-records, version 1).
import type { ProviderInfo, RecordFile, SignRecord } from './schema.ts'
import { validateRecordFile } from './validate.ts'

/** a record file, records sorted by id */
export function createRecordFile (provider: ProviderInfo, records: readonly SignRecord[]): RecordFile {
  return validateRecordFile({ format: 'find-sign-records', version: 1, provider, records: sortedById(records) })
}

/** parses and validates a record file's JSON text */
export function parseRecordFile (json: string): RecordFile {
  return validateRecordFile(JSON.parse(json))
}

/** JSON text for a record file, records sorted by id so that a run's changes show as small diffs */
export function serialiseRecordFile (file: RecordFile): string {
  return JSON.stringify({ ...validateRecordFile(file), records: sortedById(file.records) }, null, 2) + '\n'
}

function sortedById (records: readonly SignRecord[]): SignRecord[] {
  return [...records].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
