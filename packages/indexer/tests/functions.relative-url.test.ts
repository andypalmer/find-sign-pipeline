import { expect, describe, it } from 'vitest'
import relativeURL from '../src/relative-url.ts'

const base = 'http://data.test/collections/find-sign/raw/index/alpha/'

describe('/src/lib/functions/relative-url.ts', () => {
  it.each([
    ['http://data.test/collections/encoded-search-data/raw/cat-media/cat-0.webp', '../../../../encoded-search-data/raw/cat-media/cat-0.webp'],
    ['http://data.test/collections/find-sign/raw/index/alpha/shard-0.json', 'shard-0.json'],
    ['http://data.test/collections/find-sign/raw/index/alpha/sub/x.mp4', 'sub/x.mp4'],
    ['http://data.test/other.mp4', '../../../../../other.mp4'],
    ['http://data.test/a/b.mp4?v=2#t=1', '../../../../../a/b.mp4?v=2#t=1'],
  ])('relativises %s', (url, expected) => {
    expect(relativeURL(base, url)).toBe(expected)
    expect(new URL(expected, base).toString()).toBe(url)
  })

  it('leaves urls on another origin, or already relative urls, unchanged', () => {
    expect(relativeURL(base, 'https://cdn.test/x.mp4')).toBe('https://cdn.test/x.mp4')
    expect(relativeURL(base, 'http://data.test:8080/x.mp4')).toBe('http://data.test:8080/x.mp4')
    expect(relativeURL(base, 'cat-media/x.mp4')).toBe('cat-media/x.mp4')
  })
})
