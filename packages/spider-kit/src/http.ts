// Fetching gently: one request at a time, a pause between them that grows when the server is slow to answer,
// retries when a server is struggling.

export interface Fetcher {
  /** the body of a successful response, as text. Throws a FetchError otherwise */
  text (url: string, headers?: Record<string, string>): Promise<string>,
}

/** downloads a whole file */
export interface Downloader {
  bytes (url: string, headers?: Record<string, string>): Promise<Uint8Array>,
}

export class FetchError extends Error {
  readonly url: string
  readonly status: number | undefined

  constructor (url: string, status: number | undefined, message: string) {
    super(`${url}: ${message}`)
    this.name = 'FetchError'
    this.url = url
    this.status = status
  }
}

export type PoliteOptions = {
  userAgent: string,
  /** least time between the start of one request and the next, in ms */
  interval?: number,
  /** attempts after the first, for network errors, 429 and 5xx responses, waiting twice as long each time
   * (default 5: about a minute in all, enough for a network to come back) */
  retries?: number,
  /** after a response that took t ms, wait at least t × slowdown before the next request (default 1), so a server
   * that slows down gets fewer requests: with 1, it spends at most half its time on ours. 0 turns it off */
  slowdown?: number,
  fetch?: typeof globalThis.fetch,
  wait?: (ms: number) => Promise<void>,
  now?: () => number,
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function politeFetcher ({ userAgent, interval = 1000, retries = 5, slowdown = 1, fetch, wait = sleep, now = Date.now }: PoliteOptions): Fetcher & Downloader {
  let queue: Promise<unknown> = Promise.resolve()
  // when the next request may start
  let next = -Infinity

  const finished = (start: number) => {
    const end = now()
    next = Math.max(start + interval, end + (end - start) * slowdown)
  }

  async function attempt<T> (url: string, headers: Record<string, string>, read: (response: Response) => Promise<T>): Promise<T> {
    for (let tries = 0; ; tries++) {
      await wait(Math.max(0, next - now()))
      const start = now()
      let response: Response
      let body: T
      try {
        response = await (fetch ?? globalThis.fetch)(url, { headers: { 'User-Agent': userAgent, ...headers } })
        // read inside the retry, as a connection can also fail partway through a body
        body = await read(response)
      } catch (err) {
        finished(start)
        if (tries < retries) { await wait(Math.max(interval, 1000) * 2 ** (tries + 1)); continue }
        throw new FetchError(url, undefined, (err as Error).message)
      }
      finished(start)
      if (response.ok) return body
      if ((response.status === 429 || response.status >= 500) && tries < retries) {
        await wait(Math.max(interval, 1000) * 2 ** (tries + 1))
        continue
      }
      throw new FetchError(url, response.status, `HTTP ${response.status}`)
    }
  }

  // one request at a time, in the order asked for
  function queued<T> (url: string, headers: Record<string, string>, read: (response: Response) => Promise<T>): Promise<T> {
    const result = queue.then(() => attempt(url, headers, read))
    queue = result.catch(() => {})
    return result
  }

  return {
    text: (url, headers = {}) => queued(url, headers, response => response.text()),
    bytes: (url, headers = {}) => queued(url, headers, async response => new Uint8Array(await response.arrayBuffer())),
  }
}
