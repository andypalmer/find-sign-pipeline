import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { looksContentNamed, nameFileAfterItsBytes } from '../src/content-name.ts'

// worked out separately from the code under test
const firstTenHexDigits = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex').slice(0, 10)

describe('nameFileAfterItsBytes()', () => {
  it('puts the stem, the first ten lowercase hex digits of the SHA-256 of the bytes, then the extension', async () => {
    const bytes = new TextEncoder().encode('{"entries":[]}')
    expect(await nameFileAfterItsBytes('shard-12', 'json', bytes)).toBe(`shard-12.${firstTenHexDigits(bytes)}.json`)
    expect(await nameFileAfterItsBytes('vectors-3', 'lps', bytes)).toBe(`vectors-3.${firstTenHexDigits(bytes)}.lps`)
  })

  it('treats a string as its UTF-8 bytes', async () => {
    const text = '{"title":"Café"}'
    expect(await nameFileAfterItsBytes('scan-0', 'json', text)).toBe(`scan-0.${firstTenHexDigits(text)}.json`)
    expect(await nameFileAfterItsBytes('scan-0', 'json', text)).toBe(await nameFileAfterItsBytes('scan-0', 'json', new TextEncoder().encode(text)))
  })

  it('gives the same name for the same bytes and a different name when one byte changes', async () => {
    const same = await nameFileAfterItsBytes('shard-1', 'json', 'abc')
    expect(await nameFileAfterItsBytes('shard-1', 'json', 'abc')).toBe(same)
    expect(await nameFileAfterItsBytes('shard-1', 'json', 'abd')).not.toBe(same)
  })

  it('makes names that looksContentNamed() recognises', async () => {
    expect(looksContentNamed(await nameFileAfterItsBytes('index-alpha', 'json', 'x'))).toBe(true)
  })

  it('refuses a stem that is not one plain file name piece (no dots, slashes or spaces)', async () => {
    for (const bad of ['', 'a.b', '../shard', 'a/b', 'a b', 'shard-1.json']) {
      await expect(nameFileAfterItsBytes(bad, 'json', 'x')).rejects.toThrow(/stem/i)
    }
  })
})

describe('looksContentNamed()', () => {
  it('says yes to a dot, ten lowercase hex digits, then .json or .lps', () => {
    expect(looksContentNamed('shard-12.4f9a1c07be.json')).toBe(true)
    expect(looksContentNamed('vectors-0.b1b2b3b4b5.lps')).toBe(true)
    expect(looksContentNamed('index-alpha.1a2b3c4d5e.json')).toBe(true)
  })

  it('says no to the one file that can change, and to files with the wrong ending or digits', () => {
    expect(looksContentNamed('manifest.json')).toBe(false)
    expect(looksContentNamed('meta.json')).toBe(false)
    expect(looksContentNamed('shard-12.4f9a1c07be.txt')).toBe(false)
    expect(looksContentNamed('shard-12.4f9a1c07b.json')).toBe(false) // nine digits
    expect(looksContentNamed('shard-12.4f9a1c07bef.json')).toBe(false) // eleven digits
    expect(looksContentNamed('shard-12.4F9A1C07BE.json')).toBe(false) // capitals
    expect(looksContentNamed('shard-12.4f9a1c07bg.json')).toBe(false) // not hex
    expect(looksContentNamed('folder/shard-12.4f9a1c07be.json')).toBe(false)
  })
})
