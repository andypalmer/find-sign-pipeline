// Encodes a video into what Find Sign plays: by default an h264 mp4 and a vp9 webm, both within 640×360, and a
// webp thumbnail. Videos are scaled down to fit, never up, keeping their shape: Find Sign shows every video in a
// 16:9 frame, so 640×360 is as much as any shape of video can show (a square one fills the frame's height at
// 360×360). Runs ffmpeg, ffprobe and cwebp, which must be installed.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Encode, Encoded } from '@andypalmer/records'

/** runs a command, giving its standard output */
export type Run = (command: string, args: string[]) => Promise<string>

export const run: Run = async (command, args) => (await promisify(execFile)(command, args, { maxBuffer: 16 * 1024 * 1024 })).stdout

/** one encode to make: the largest size it may be, the ffmpeg codec arguments, and how it's described */
export type EncodeProfile = Pick<Encode, 'type' | 'container' | 'codec' | 'version'> & {
  maxWidth: number,
  maxHeight: number,
  /** the end of the file's name, such as "x264-512x288.mp4" */
  suffix: string,
  args: string[],
}

export const defaultProfiles: EncodeProfile[] = [
  {
    type: 'video/mp4', container: 'mp4', codec: 'h264', version: 'mp4:x264:26@640x360', maxWidth: 640, maxHeight: 360, suffix: 'x264-640x360.mp4',
    args: ['-c:v', 'libx264', '-profile:v', 'high', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
  },
  {
    type: 'video/webm', container: 'webm', codec: 'vp9', version: 'webm:vp9:38@640x360', maxWidth: 640, maxHeight: 360, suffix: 'vp9-640x360.webm',
    args: ['-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'],
  },
]

export type EncodeOptions = {
  /** the folder the record file is in: urls in the result are relative to it */
  outputFolder: string,
  /** the folder under it the files go in, such as "deaf-nation-wsl-media" */
  mediaFolder: string,
  /** the start of each file's name. The source's fingerprint follows it, so a new encode never overwrites
   * files another dataset still serves */
  name: string,
  userAgent: string,
  /** when the encoding happened, an ISO timestamp */
  at: string,
  /** extra ffmpeg input arguments, such as headers a source needs */
  inputArgs?: string[],
  profiles?: EncodeProfile[],
  run?: Run,
  /** downloads the input as one file, such as with a spider's polite fetcher, so its sha256 can be kept
   * (sourceSha256). Without it ffmpeg reads the input itself, as it must for a stream */
  download?: (url: string) => Promise<Uint8Array>,
}

export async function encodeVideo (input: string, { outputFolder, mediaFolder, name, userAgent, at, inputArgs = [], profiles = defaultProfiles, run: exec = run, download }: EncodeOptions): Promise<Encoded> {
  const work = await mkdtemp(path.join(tmpdir(), 'find-sign-encode-'))
  try {
    let sourceSha256: string | undefined
    let from = ['-user_agent', userAgent, ...inputArgs, '-i', input]
    if (download) {
      const bytes = await download(input)
      sourceSha256 = createHash('sha256').update(bytes).digest('hex')
      const downloaded = path.join(work, 'download')
      await writeFile(downloaded, bytes)
      from = ['-i', downloaded]
    }
    // a local copy first, so a stream is downloaded once rather than once per encode. bitexact leaves out what
    // would differ between copies of the same video (the muxer's version, a random segment id)
    const source = path.join(work, 'source.mkv')
    await exec('ffmpeg', ['-v', 'error', '-y', ...from, '-map', '0:v:0', '-c', 'copy', '-fflags', '+bitexact', source])
    const sourceDuration = (await probe(exec, source)).duration

    // files are named for their source, so they're never overwritten: an index built before a video changed
    // keeps playing the encodes it points at
    const fingerprint = (sourceSha256 ?? createHash('sha256').update(await readFile(source)).digest('hex')).slice(0, 8)
    const encodes: Encode[] = []
    for (const profile of profiles) {
      const file = `${mediaFolder}/${name}-${fingerprint}-${profile.suffix}`
      // fit within the profile's size, keeping the shape, and never larger than the source
      const scale = `scale='min(${profile.maxWidth},iw)':'min(${profile.maxHeight},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
      await exec('ffmpeg', ['-v', 'error', '-y', '-i', source, '-an', '-vf', scale, ...profile.args, path.join(outputFolder, file)])
      const { width, height, duration } = await probe(exec, path.join(outputFolder, file))
      const { size } = await stat(path.join(outputFolder, file))
      encodes.push({ type: profile.type, width, height, container: profile.container, codec: profile.codec, version: profile.version, url: file, byteSize: size, duration })
    }

    // a frame from the middle of a short video, or 1.5s in, as a webp (cwebp, as ffmpeg often lacks libwebp)
    const thumbnail = `${mediaFolder}/${name}-${fingerprint}.webp`
    const frame = path.join(work, 'frame.png')
    await exec('ffmpeg', ['-v', 'error', '-y', '-ss', String(Math.min(1.5, sourceDuration / 2)), '-i', source, '-frames:v', '1', '-vf', `scale='min(640,iw)':'min(360,ih)':force_original_aspect_ratio=decrease`, frame])
    await exec('cwebp', ['-quiet', '-q', '80', frame, '-o', path.join(outputFolder, thumbnail)])

    return { thumbnail, encodedAt: at, encodes, ...(sourceSha256 && { sourceSha256 }) }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

async function probe (exec: Run, file: string): Promise<{ width: number, height: number, duration: number }> {
  const output = JSON.parse(await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]))
  return { width: output.streams[0].width, height: output.streams[0].height, duration: Math.round(Number(output.format.duration) * 1000) / 1000 }
}
