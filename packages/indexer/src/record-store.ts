// Where providers' record files are kept between builds: they keep each sign's readable id from build to build.
import { parseRecordFile, serialiseRecordFile, type RecordFile } from '@andypalmer/records'
import { bytesToString, fn } from '@andypalmer/find-sign-util'
import type { DataStore } from '@andypalmer/data-store'

export interface RecordStore {
  /** the url the provider's record file is stored at: its relative urls resolve against this */
  url (provider: string): string,
  /** the provider's record file, or undefined when it has none yet */
  read (provider: string): Promise<RecordFile | undefined>,
  write (file: RecordFile): Promise<void>,
}

/** record files at records/<provider>.records.json in a collection, whose url is `collectionURL` */
export function recordStoreIn (store: DataStore, collectionURL: string): RecordStore {
  const path = (provider: string) => fn`records/${provider}.records.json`
  return {
    url: provider => `${collectionURL}${path(provider)}`,
    async read (provider) {
      const bytes = await store.read(path(provider))
      return bytes && parseRecordFile(bytesToString(bytes))
    },
    async write (file) {
      await store.write(path(file.provider.id), serialiseRecordFile(file))
    },
  }
}
