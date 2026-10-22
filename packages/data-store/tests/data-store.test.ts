import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { decodeHex, sign_open } from 'tweetnacl-ts'
import { FakeDataServer } from '@andypalmer/test-helpers/fake-data-server.ts'
import { DataBase, writeIdentity, writeKeyPair } from '@andypalmer/test-helpers/settings.ts'
import { createLicense, fetchWithFiles, findSignData, folderStore, type DataStore } from '../src/index.ts'

describe('createLicense()', () => {
  afterEach(() => { vi.useRealTimers() })

  it('signs "validFrom-validTo" (30s ago to 2 minutes ahead) with the identity secret key', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const [scheme, publicKey, signature] = createLicense(writeIdentity).split('-')
    expect(scheme).toBe('ed25519')
    expect(decodeHex(publicKey)).toEqual(writeKeyPair.publicKey)
    expect(new TextDecoder().decode(sign_open(decodeHex(signature), writeKeyPair.publicKey))).toBe('970000-1120000')
  })

  it('rejects identities without a 64 byte secret key', () => {
    expect(() => createLicense('00-11')).toThrow('invalid secret key length')
  })
})

describe('findSignData()', () => {
  let server: FakeDataServer
  const store = () => findSignData({ collection: DataBase, identity: writeIdentity, userAgent: 'test-agent' })
  beforeEach(() => { server = new FakeDataServer().install() })

  it('prefixes paths with the collection, adding a licence and the user agent', async () => {
    await store().read('some/file.json')
    const [request] = server.requests
    expect(request.path).toBe(`${DataBase}some/file.json`)
    expect(new URL(request.url).searchParams.get('license')).toMatch(/^ed25519-/)
    expect(request.headers['user-agent']).toBe('test-agent')
  })

  it('reads files, giving undefined for one that is not there', async () => {
    server.set(`${DataBase}a.json`, { a: 1 })
    expect(new TextDecoder().decode(await store().read('a.json'))).toBe('{"a":1}')
    expect(await store().read('missing.json')).toBeUndefined()
  })

  it('writes several files in one bulk request: text as strings, bytes as base64', async () => {
    await store().writeMany('index/alpha', { 'meta.json': '{}', 'vectors.lps': new Uint8Array([1, 2]) })
    const bulk = server.requests.find(r => r.method === 'POST')!
    expect(bulk.body).toEqual({ type: 'bulk', files: { 'meta.json': { encoding: 'string', data: '{}' }, 'vectors.lps': { encoding: 'base64', data: 'AQI=' } } })
    expect(server.getText(`${DataBase}index/alpha/meta.json`)).toBe('{}')
  })

  it('lists a folder, giving nothing for one that is not there', async () => {
    server.set(`${DataBase}overrides/alpha:cat.json`, {})
    expect(await store().list('overrides')).toEqual(['alpha:cat.json'])
    expect(await store().list('nothing')).toEqual([])
  })

  it('refuses to make requests without an identity', async () => {
    await expect(findSignData({ collection: DataBase, identity: undefined }).read('a')).rejects.toThrow('write identity')
  })
})

describe('folderStore()', () => {
  let folder: string
  let store: DataStore
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'data-store-test-'))
    store = folderStore(folder)
  })
  afterEach(async () => { await rm(folder, { recursive: true, force: true }) })

  it('reads, writes, lists and deletes files in the folder, making folders as needed', async () => {
    await store.write('index/alpha/meta.json', '{}')
    await store.writeMany('index/alpha', { 'id.json': '[]', 'vectors.lps': new Uint8Array([1]) })
    expect((await store.list('index/alpha')).sort()).toEqual(['id.json', 'meta.json', 'vectors.lps'])
    expect(await readFile(path.join(folder, 'index/alpha/meta.json'), 'utf8')).toBe('{}')
    await store.delete('index/alpha/id.json')
    expect(await store.read('index/alpha/id.json')).toBeUndefined()
    expect(await store.list('nowhere')).toEqual([])
  })

  it('decodes escaped names, as paths are url-like', async () => {
    await store.write('overrides/alpha%3Acat.json', 'x')
    expect(await store.list('overrides')).toEqual(['alpha:cat.json'])
  })

  it('refuses paths outside the folder', async () => {
    await expect(store.write('../escape.json', 'x')).rejects.toThrow('outside')
  })
})

describe('fetchWithFiles()', () => {
  it('reads file: urls from disk, as 404 when missing', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'fetch-test-'))
    await folderStore(folder).write('a.txt', 'hello')
    expect(await (await fetchWithFiles(pathToFileURL(path.join(folder, 'a.txt')))).text()).toBe('hello')
    expect((await fetchWithFiles(pathToFileURL(path.join(folder, 'b.txt')))).status).toBe(404)
    await rm(folder, { recursive: true, force: true })
  })
})
