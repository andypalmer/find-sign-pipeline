// Where Find Sign keeps a collection's files: the find-sign-data server, or a folder on this machine. Paths are
// relative to the collection, with / between folders.

export type FileData = Uint8Array | string

export interface DataStore {
  /** a file's contents, or undefined when there's no such file */
  read (path: string): Promise<Uint8Array | undefined>,
  write (path: string, data: FileData): Promise<void>,
  /** writes several files in a folder together, which the data server does in one request */
  writeMany (folder: string, files: Record<string, FileData>): Promise<void>,
  /** the names of what's in a folder: empty when there's no such folder */
  list (folder: string): Promise<string[]>,
  delete (path: string): Promise<void>,
}
