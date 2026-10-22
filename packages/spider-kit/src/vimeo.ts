// Where to download a Vimeo video from. The player page holds its configuration, including the stream urls.
// Videos embedded on a site only play when the player is opened from that site, so the page is asked for with
// the embedding page as referrer.
import type { Fetcher } from './http.ts'

type PlayerConfig = {
  request?: {
    files?: {
      progressive?: { url: string, height?: number }[],
      hls?: { default_cdn?: string, cdns?: Record<string, { url: string }> },
    },
  },
}

/** a url ffmpeg can read the video from: the largest progressive file, or else the HLS stream */
export async function vimeoStreamURL (playerURL: string, referer: string, fetcher: Fetcher): Promise<string> {
  const html = await fetcher.text(playerURL, { Referer: referer })
  const json = html.match(/window\.playerConfig\s*=\s*(\{.*?\})\s*(?:;|<\/script>)/s)?.[1]
  if (!json) throw new Error(`${playerURL}: no player configuration in the page`)
  const files = (JSON.parse(json) as PlayerConfig).request?.files

  const progressive = [...(files?.progressive ?? [])].sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0]
  if (progressive) return progressive.url
  const hls = files?.hls
  const cdn = hls?.cdns?.[hls.default_cdn ?? ''] ?? Object.values(hls?.cdns ?? {})[0]
  if (cdn) return cdn.url
  throw new Error(`${playerURL}: the player configuration has no video files`)
}
