// A collection on a find-sign-data server. Every request carries a licence signed with the write identity, which
// the collection's keys.json must allow.
import { encodeBase64 } from 'tweetnacl-ts'
import { stringToBytes } from '@andypalmer/find-sign-util'
import { createLicense } from './licence.ts'
import type { DataStore, FileData } from './store.ts'

export type FileInfoJSON = {
  name: string, // filename
  type: string, // inferred mimetype
  size: number, // file size in bytes
  lastModified: string, // time when file was last modified,
  etag: string, // some unique string likely to change when file contents change
  created: string, // time when file was created
  path: string, // full path to file
  isFile: boolean, // is this item a file?
  isFolder: boolean, // is this item a folder?
}

export type MathFormat = 'u8' | 's8' | 'u16' | 's16' | 'u32' | 's32' | 'f32' | 'f64'
export type MathOperation = {
  address: number,
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'set',
  operand: number
}

export type FindSignDataOptions = {
  /** the collection's url, ending in / */
  collection: string,
  /** "<public key>-<secret key>" in hex, from the server's create identity page */
  identity: string | undefined,
  userAgent?: string,
  fetch?: typeof globalThis.fetch,
}

/** a DataStore, plus what else find-sign-data offers: file details, existence checks, and math writes */
export interface FindSignData extends DataStore {
  exists (path: string): Promise<boolean>,
  listFiles (folder: string): Promise<FileInfoJSON[]>,
  /** applies operations to a binary file of numbers, server side (analytics counters) */
  mathWrite (path: string, length: number, format: MathFormat, operations: MathOperation[]): Promise<void>,
}

export function findSignData ({ collection, identity, userAgent = 'find-sign', fetch }: FindSignDataOptions): FindSignData {
  async function request (path: string, init: RequestInit, ignoreError = false): Promise<Response> {
    if (!identity) throw new Error('data server requests need a write identity')
    const url = new URL(`${collection}${path}`)
    url.searchParams.set('license', createLicense(identity))
    // the global fetch as it is now, not when this was made, so it can be replaced (as tests do)
    const response = await (fetch ?? globalThis.fetch)(url.toString(), { ...init, headers: { 'User-Agent': userAgent, ...(init.headers || {}) } })
    if (!ignoreError && !response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`)
    }
    return response
  }

  /** the body of a request, or undefined for a 404 */
  async function optional<T> (path: string, init: RequestInit, body: (response: Response) => Promise<T>): Promise<T | undefined> {
    const response = await request(path, init, true)
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
    return await body(response)
  }

  return {
    async read (path) {
      return await optional(path, {}, async response => new Uint8Array(await response.arrayBuffer()))
    },

    async write (path, data) {
      await request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        // copied into a fresh ArrayBuffer, which is what fetch's types ask for
        body: new Uint8Array(typeof data === 'string' ? stringToBytes(data) : data),
      })
    },

    async writeMany (folder, files) {
      // json is inefficient but gets the job done
      await request(folder, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bulk',
          files: Object.fromEntries(Object.entries(files).map(([path, data]: [string, FileData]) =>
            [path, typeof data === 'string' ? { encoding: 'string', data } : { encoding: 'base64', data: encodeBase64(data) }]
          )),
        }),
      })
    },

    async list (folder) {
      const text = await optional(folder, { headers: { 'Accept': 'text/plain' } }, response => response.text())
      return text ? text.split('\n') : []
    },

    async delete (path) {
      await request(path, { method: 'DELETE' })
    },

    async exists (path) {
      const response = await request(path, { method: 'HEAD' }, true)
      return response.status !== 404
    },

    async listFiles (folder) {
      return (await optional(folder, {}, async response => (await response.json() as { files: FileInfoJSON[] }).files)) ?? []
    },

    async mathWrite (path, length, format, operations) {
      await request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'math', format, length, operations }),
      })
    },
  }
}
