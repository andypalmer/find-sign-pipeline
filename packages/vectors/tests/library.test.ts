import { describe, expect, it } from 'vitest'
import { vectorLibrary } from '../src/library.ts'

const info = { version: 5, shardBits: 13, entries: 3, vectorSize: 300, source: 'test', built: '2026-01-01T00:00:00.000Z' }

/** a server that can be told to fail, and counts what it was asked for. Bucket files are empty, so a lookup finds nothing */
function fakeServer (failures: { [path: string]: number[] } = {}) {
  const asked: string[] = []
  const fetch = (async (input: RequestInfo | URL) => {
    const path = String(input).split('/').pop()!
    asked.push(path)
    const failing = failures[path]
    if (failing?.length) return new Response('forbidden', { status: failing.shift()! })
    if (path === 'info.json') return new Response(JSON.stringify(info))
    return new Response(new ArrayBuffer(0))
  }) as typeof globalThis.fetch
  return { fetch, asked }
}

const url = 'https://data.example/wordvec'

describe('vectorLibrary() after a failure', () => {
  it('reports the failure of the first lookup', async () => {
    const { fetch } = fakeServer({ 'info.json': [403] })
    const library = vectorLibrary(url, { fetch })
    await expect(library.lookup('elderly')).rejects.toThrow()
  })

  it('tries to open the library again on the next lookup, so one failed request does not spoil the rest of the page', async () => {
    const { fetch, asked } = fakeServer({ 'info.json': [403] })
    const library = vectorLibrary(url, { fetch })
    await expect(library.lookup('elderly')).rejects.toThrow()
    await expect(library.lookup('elderly')).resolves.toBeUndefined()
    expect(asked.filter(path => path === 'info.json')).toHaveLength(2)
  })

  it('tries again on the next preload too', async () => {
    const { fetch } = fakeServer({ 'info.json': [500] })
    const library = vectorLibrary(url, { fetch })
    await expect(library.preload()).rejects.toThrow()
    await expect(library.preload()).resolves.toMatchObject({ settings: { version: 5 } })
  })

  it('says which address failed and with what status, not just a parsing error', async () => {
    const { fetch } = fakeServer({ 'info.json': [403] })
    const error = await vectorLibrary(url, { fetch }).lookup('elderly').catch(error => error)
    expect(error.message).toMatch(/info\.json/)
    expect(error.message).toMatch(/403/)
  })

  it('a word\'s bucket that fails is reported too, rather than read as an empty or garbled bucket', async () => {
    const { fetch } = fakeServer()
    const library = vectorLibrary(url, { fetch })
    await library.preload()
    const bucketFetch = (async (input: RequestInfo | URL) => String(input).endsWith('.lps') ? new Response('forbidden', { status: 403 }) : new Response(JSON.stringify(info))) as typeof globalThis.fetch
    const broken = vectorLibrary(url, { fetch: bucketFetch })
    await expect(broken.lookup('elderly')).rejects.toThrow(/403/)
  })
})

describe('vectorLibrary() when it works', () => {
  it('opens the library once, however many lookups there are, while it is working', async () => {
    const { fetch, asked } = fakeServer()
    const library = vectorLibrary(url, { fetch })
    await Promise.all(['a', 'b', 'c', 'd'].map(word => library.lookup(word)))
    await library.lookup('e')
    expect(asked.filter(path => path === 'info.json')).toHaveLength(1)
  })

  it('shares one attempt between lookups that arrive during a failing open, rather than making one request per lookup', async () => {
    const { fetch, asked } = fakeServer({ 'info.json': [403] })
    const library = vectorLibrary(url, { fetch })
    const results = await Promise.allSettled(['a', 'b', 'c'].map(word => library.lookup(word)))
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(asked.filter(path => path === 'info.json')).toHaveLength(1)
  })
})
