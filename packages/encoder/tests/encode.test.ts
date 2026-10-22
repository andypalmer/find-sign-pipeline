import { expect, describe, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { encodeVideo, type Run } from '../src/index.ts'

/** stands in for ffmpeg and friends: writes the files a command would, and says what ffprobe would */
function fakeTools (size: { width: number, height: number }) {
  const calls: string[][] = []
  const run: Run = async (command, args) => {
    calls.push([command, ...args])
    if (command === 'ffprobe') return JSON.stringify({ streams: [size], format: { duration: '4.0004' } })
    const output = args.at(-1)!
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, 'x'.repeat(10))
    return ''
  }
  return { calls, run }
}

describe('encodeVideo()', () => {
  it('makes an mp4 and a webm within 640x360, never larger than the source, and a webp thumbnail', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'encode-test-'))
    const { calls, run } = fakeTools({ width: 320, height: 240 })
    const encoded = await encodeVideo('https://media.test/1.mp4', { outputFolder: folder, mediaFolder: 'p-media', name: '1', userAgent: 'ua', at: '2026-10-21T00:00:00.000Z', run })

    expect(calls[0]).toEqual(['ffmpeg', '-v', 'error', '-y', '-user_agent', 'ua', '-i', 'https://media.test/1.mp4', '-map', '0:v:0', '-c', 'copy', '-fflags', '+bitexact', expect.stringMatching(/source\.mkv$/)])
    const scales = calls.filter(c => c.includes('-vf')).map(c => c[c.indexOf('-vf') + 1])
    expect(scales).toEqual([
      "scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease",
    ])
    // named for the local copy of the source, as there was no download to hash (the fake writes ten x's)
    const fingerprint = createHash('sha256').update('x'.repeat(10)).digest('hex').slice(0, 8)
    expect(encoded).toEqual({
      thumbnail: `p-media/1-${fingerprint}.webp`,
      encodedAt: '2026-10-21T00:00:00.000Z',
      encodes: [
        { type: 'video/mp4', width: 320, height: 240, container: 'mp4', codec: 'h264', version: 'mp4:x264:26@640x360', url: `p-media/1-${fingerprint}-x264-640x360.mp4`, byteSize: 10, duration: 4 },
        { type: 'video/webm', width: 320, height: 240, container: 'webm', codec: 'vp9', version: 'webm:vp9:38@640x360', url: `p-media/1-${fingerprint}-vp9-640x360.webm`, byteSize: 10, duration: 4 },
      ],
    })
    await rm(folder, { recursive: true, force: true })
  })

  it('downloads the source itself when given a way to, keeping its sha256', async () => {
    const folder = await mkdtemp(path.join(tmpdir(), 'encode-test-'))
    const { calls, run } = fakeTools({ width: 320, height: 240 })
    const downloads: string[] = []
    const download = async (url: string) => { downloads.push(url); return new TextEncoder().encode('video') }
    const encoded = await encodeVideo('https://media.test/1.mp4', { outputFolder: folder, mediaFolder: 'p-media', name: '1', userAgent: 'ua', at: '2026-10-21T00:00:00.000Z', run, download })
    expect(downloads).toEqual(['https://media.test/1.mp4'])
    expect(calls[0]).toEqual(['ffmpeg', '-v', 'error', '-y', '-i', expect.stringMatching(/download$/), '-map', '0:v:0', '-c', 'copy', '-fflags', '+bitexact', expect.stringMatching(/source\.mkv$/)])
    // sha256 of "video", which also names the files
    expect(encoded.sourceSha256).toBe('0cab1c9617404faf2b24e221e189ca5945813e14d3f766345b09ca13bbe28ffc')
    expect(encoded.thumbnail).toBe('p-media/1-0cab1c96.webp')
    expect(encoded.encodes[0].url).toBe('p-media/1-0cab1c96-x264-640x360.mp4')
    await rm(folder, { recursive: true, force: true })
  })
})
