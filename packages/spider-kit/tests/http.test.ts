import { expect, describe, it } from 'vitest'
import { FetchError, politeFetcher } from '../src/index.ts'

function server (responses: (number | 'network')[]) {
  const seen: { url: string, agent: string | null }[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, agent: new Headers(init.headers).get('User-Agent') })
    const next = responses.shift() ?? 200
    if (next === 'network') throw new TypeError('fetch failed')
    return new Response(`body of ${url}`, { status: next })
  }) as typeof globalThis.fetch
  return { seen, fetch }
}

describe('politeFetcher()', () => {
  it('sends its user agent, and one request at a time, spaced out', async () => {
    const waits: number[] = []
    const { seen, fetch } = server([])
    const fetcher = politeFetcher({ userAgent: 'TestSpider', interval: 1000, fetch, wait: async ms => { waits.push(ms) } })
    const bodies = await Promise.all([fetcher.text('a'), fetcher.text('b')])
    expect(bodies).toEqual(['body of a', 'body of b'])
    expect(seen).toEqual([{ url: 'a', agent: 'TestSpider' }, { url: 'b', agent: 'TestSpider' }])
    expect(waits[1]).toBeGreaterThan(900)
  })

  it('waits longer after a slow response: at least as long as it took', async () => {
    let clock = 0
    const waits: number[] = []
    const took = [100, 2000, 100]
    const fetch = (async (url: string) => { clock += took.shift()!; return new Response(url) }) as typeof globalThis.fetch
    const fetcher = politeFetcher({ userAgent: 'x', interval: 250, fetch, now: () => clock, wait: async ms => { waits.push(ms); clock += ms } })
    await Promise.all(['a', 'b', 'c'].map(url => fetcher.text(url)))
    // a quick answer: just the interval; a two-second one: two seconds more
    expect(waits).toEqual([0, 150, 2000])
  })

  it('retries a struggling server, then gives up with the status', async () => {
    const { seen, fetch } = server(['network', 503, 200])
    const fetcher = politeFetcher({ userAgent: 'x', retries: 2, fetch, wait: async () => {} })
    expect(await fetcher.text('a')).toBe('body of a')
    expect(seen).toHaveLength(3)

    const failing = politeFetcher({ userAgent: 'x', retries: 1, fetch: server([500, 500]).fetch, wait: async () => {} })
    await expect(failing.text('a')).rejects.toMatchObject({ status: 500 })
  })

  it('retries a response whose body fails partway through', async () => {
    let calls = 0
    const fetch = (async () => {
      calls++
      if (calls === 1) return { ok: true, status: 200, text: async () => { throw new TypeError('terminated') } } as unknown as Response
      return new Response('whole body')
    }) as typeof globalThis.fetch
    const fetcher = politeFetcher({ userAgent: 'x', fetch, wait: async () => {} })
    expect(await fetcher.text('a')).toBe('whole body')
    expect(calls).toBe(2)
  })

  it('downloads files whole, in the same queue', async () => {
    const { fetch } = server([])
    const fetcher = politeFetcher({ userAgent: 'x', fetch, wait: async () => {} })
    expect(new TextDecoder().decode(await fetcher.bytes('v.mp4'))).toBe('body of v.mp4')
  })

  it('does not retry a page that is not there', async () => {
    const { seen, fetch } = server([404])
    const fetcher = politeFetcher({ userAgent: 'x', fetch, wait: async () => {} })
    await expect(fetcher.text('a')).rejects.toBeInstanceOf(FetchError)
    expect(seen).toHaveLength(1)
  })
})
