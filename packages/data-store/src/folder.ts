// A collection in a folder on this machine, such as a local copy of the data server's collections. Paths can't
// leave the folder.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DataStore } from './store.ts'

export function folderStore (root: string): DataStore {
  const base = path.resolve(root)
  const inside = (relative: string) => {
    const full = path.resolve(base, decodeURIComponent(relative))
    if (full !== base && !full.startsWith(base + path.sep)) throw new Error(`${relative} is outside ${base}`)
    return full
  }
  const write = async (relative: string, data: Uint8Array | string) => {
    const file = inside(relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }

  return {
    async read (relative) {
      try {
        return new Uint8Array(await readFile(inside(relative)))
      } catch (err) {
        if (missing(err)) return undefined
        throw err
      }
    },
    write,
    async writeMany (folder, files) {
      for (const [name, data] of Object.entries(files)) await write(`${folder}/${name}`, data)
    },
    async list (folder) {
      try {
        return (await readdir(inside(folder))).filter(name => !name.startsWith('.'))
      } catch (err) {
        if (missing(err)) return []
        throw err
      }
    },
    async delete (relative) {
      await rm(inside(relative), { recursive: true, force: true })
    },
  }
}

/** fetch, but also reading file: urls from disk, so code that fetches can work on local copies */
export const fetchWithFiles: typeof globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  if (url.protocol !== 'file:') return await globalThis.fetch(input, init)
  try {
    return new Response(new Uint8Array(await readFile(url)), { status: 200 })
  } catch (err) {
    if (missing(err)) return new Response('not found', { status: 404 })
    throw err
  }
}

function missing (err: unknown) {
  return (err as NodeJS.ErrnoException).code === 'ENOENT'
}
