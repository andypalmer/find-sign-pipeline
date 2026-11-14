// Files in a version 2 index are named after what is inside them: `shard-12.4f9a1c07be.json` is a stem,
// the first ten hex digits of the SHA-256 of the file's bytes, and an ending. Same bytes, same name, so
// anyone who already holds the file keeps it; changed bytes, new name, so no one is handed a file that
// doesn't match its name.
import { sha256 } from '@andypalmer/find-sign-util'

const DIGIT_COUNT = 10
const PLAIN_STEM = /^[A-Za-z0-9_-]+$/
const CONTENT_NAMED = /^[A-Za-z0-9_-]+\.[0-9a-f]{10}\.(json|lps)$/

/** what should we call a file with these bytes? The stem says what kind of file it is: "shard-12" */
export async function nameFileAfterItsBytes (stem: string, extension: 'json' | 'lps', bytes: Uint8Array | string): Promise<string> {
  if (!PLAIN_STEM.test(stem)) throw new Error(`The stem must be letters, numbers, dashes and underscores only, not "${stem}"`)
  const hash = await sha256(bytes)
  const digits = [...hash.slice(0, DIGIT_COUNT / 2)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${stem}.${digits}.${extension}`
}

/** is this the name of a file that never changes? The data server uses the same test to cache it for good */
export function looksContentNamed (fileName: string): boolean {
  return CONTENT_NAMED.test(fileName)
}
