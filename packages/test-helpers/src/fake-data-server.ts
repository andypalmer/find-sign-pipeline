// In-memory stand-in for the find-sign-data server (and any other http host the code fetches from).
// It is installed as globalThis.fetch, records every request, and implements just enough of the
// find-sign-data protocol used by @find-sign/data-io: GET/HEAD files, GET directory listings
// (JSON or text/plain), PUT, DELETE, and POST {type:'bulk'} / {type:'math'}.
import { vi } from 'vitest'

export type RecordedRequest = {
  method: string,
  url: string, // full url including query string
  path: string, // url without query string
  cache?: RequestCache,
  headers: Record<string, string>,
  body?: any,
}

const encoder = new TextEncoder()

function toBytes (data: string | Uint8Array | object): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'string') return encoder.encode(data)
  return encoder.encode(JSON.stringify(data))
}

function base64ToBytes (b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

export class FakeDataServer {
  files = new Map<string, Uint8Array>()
  requests: RecordedRequest[] = []
  // urls which respond with an http error status instead of their contents, or 'network' to reject
  failures = new Map<string, number | 'network'>()

  /** put a file on the server, url must be absolute and have no query string */
  set (url: string, data: string | Uint8Array | object) {
    this.files.set(url, toBytes(data))
  }

  /** add every file in a {relativePath: data} object under a base folder url */
  setAll (baseURL: string, files: { [path: string]: string | Uint8Array }) {
    for (const path in files) this.set(`${baseURL}/${path}`, files[path])
  }

  get (url: string): Uint8Array | undefined {
    return this.files.get(url)
  }

  getText (url: string): string | undefined {
    const data = this.get(url)
    return data && new TextDecoder().decode(data)
  }

  getJSON (url: string): any {
    const text = this.getText(url)
    return text === undefined ? undefined : JSON.parse(text)
  }

  /** requests matching a predicate, handy for asserting on network behaviour */
  requestsTo (match: string | RegExp): RecordedRequest[] {
    return this.requests.filter(r => typeof match === 'string' ? r.path.includes(match) : match.test(r.path))
  }

  /** total bytes served for GET requests matching a predicate */
  bytesServed (match: string | RegExp = /./): number {
    return this.requestsTo(match).filter(r => r.method === 'GET').reduce((total, r) => {
      const file = this.files.get(r.path)
      return total + (file ? file.byteLength : 0)
    }, 0)
  }

  resetRequests () {
    this.requests = []
  }

  private listing (dirURL: string) {
    const prefix = dirURL.endsWith('/') ? dirURL : `${dirURL}/`
    const names = new Set<string>()
    for (const url of this.files.keys()) {
      if (url.startsWith(prefix)) names.add(url.slice(prefix.length).split('/')[0])
    }
    return [...names].sort()
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const path = `${url.origin}${url.pathname}`
    const method = (init.method || 'GET').toUpperCase()
    const headers = Object.fromEntries(new Headers(init.headers || {}).entries())
    let body: any = init.body
    if (typeof body === 'string' && headers['content-type'] === 'application/json') body = JSON.parse(body)
    this.requests.push({ method, url: url.toString(), path, cache: init.cache, headers, body })

    if (this.failures.has(path)) {
      const failure = this.failures.get(path)
      if (failure === 'network') throw new TypeError('fetch failed')
      return new Response(`forced failure`, { status: failure })
    }

    if (method === 'GET' || method === 'HEAD') {
      const file = this.files.get(path)
      if (file) return new Response(method === 'HEAD' ? null : file as BodyInit, { status: 200 })
      const names = this.listing(path)
      if (names.length > 0) {
        if (headers['accept'] === 'text/plain') return new Response(names.join('\n'), { status: 200 })
        return new Response(JSON.stringify({ files: names.map(name => ({ name, path: `${url.pathname}/${name}` })) }), { status: 200 })
      }
      return new Response('Not Found', { status: 404 })
    } else if (method === 'PUT') {
      this.files.set(path, new Uint8Array(body))
      return new Response('', { status: 200 })
    } else if (method === 'DELETE') {
      if (!this.files.has(path)) return new Response('Not Found', { status: 404 })
      this.files.delete(path)
      return new Response('', { status: 200 })
    } else if (method === 'POST' && body && body.type === 'bulk') {
      for (const [filePath, { encoding, data }] of Object.entries<any>(body.files)) {
        this.files.set(`${path}/${filePath}`, encoding === 'base64' ? base64ToBytes(data) : toBytes(data))
      }
      return new Response('', { status: 200 })
    } else if (method === 'POST' && body && body.type === 'math') {
      return new Response('', { status: 200 })
    }
    return new Response('Method Not Allowed', { status: 405 })
  }

  install () {
    vi.stubGlobal('fetch', this.fetch)
    return this
  }
}
