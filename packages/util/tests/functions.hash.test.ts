import { expect, describe, it } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256 } from '../src/hash.ts'

const nodeSha256 = (data: string | Uint8Array) => new Uint8Array(createHash('sha256').update(data).digest())

// sha256 uses crypto.subtle, which browsers only provide in secure contexts (https or localhost)
describe('/src/lib/functions/hash.ts sha256()', () => {
  it.each(['', 'cat', 'thankyou', 'Ünïcödé 手话', 'x'.repeat(1000)])('matches node crypto for %j', async (input) => {
    expect(await sha256(input)).toEqual(nodeSha256(input))
  })

  it('hashes byte arrays', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255])
    expect(await sha256(bytes)).toEqual(nodeSha256(bytes))
  })
})
