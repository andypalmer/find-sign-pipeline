// express an absolute url relative to a base directory url (which should end with "/")
// so that new URL(relativeURL(base, url), base) gives back url
// returns url unchanged when it is on a different origin, or isn't an absolute url
export default function relativeURL (base: string, url: string): string {
  let baseURL: URL, targetURL: URL
  try {
    baseURL = new URL(base)
    targetURL = new URL(url)
  } catch (err) {
    return url
  }
  if (baseURL.origin !== targetURL.origin) return url

  const baseSegments = baseURL.pathname.split('/').slice(0, -1)
  const targetSegments = targetURL.pathname.split('/')
  let common = 0
  while (common < baseSegments.length && common < targetSegments.length - 1 && baseSegments[common] === targetSegments[common]) {
    common += 1
  }

  const up = '../'.repeat(baseSegments.length - common)
  const down = targetSegments.slice(common).join('/')
  return `${up}${down}${targetURL.search}${targetURL.hash}` || './'
}
