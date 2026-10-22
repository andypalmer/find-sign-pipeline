// What counts as a change to a sign: a hash of its content, ignoring everything the content doesn't decide.
// Left out: provenance (when we saw it), what the encoder made (`encoded`), and the provider's own dates,
// which can move without the sign changing. Defaults are applied first, so writing a default out explicitly
// (kind: 'sign', published: true, body: '') isn't a change.
import { canonicalJSON, type JSONValue } from './canonical.ts'
import type { RecordContent } from './schema.ts'

/** a hash function over bytes, and the name it's labelled with in hashes, such as "sha256" */
export type Digest = {
  name: string,
  hash: (data: Uint8Array) => Promise<Uint8Array>,
}

/** SHA-256 with WebCrypto, which node and browsers both have */
export const sha256: Digest = {
  name: 'sha256',
  // copied into a fresh ArrayBuffer, which is what WebCrypto's types ask for
  hash: async (data) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data))),
}

/** the parts of a record's content its hash covers, with defaults applied */
export function hashedContent (content: RecordContent): JSONValue {
  return {
    kind: content.kind ?? 'sign',
    title: content.title,
    words: content.words,
    meaning: content.meaning,
    body: content.body ?? '',
    englishPhrases: content.englishPhrases,
    link: content.link,
    nav: content.nav,
    tags: content.tags,
    author: content.author,
    published: content.published ?? true,
    media: content.media.map(item => ({ type: item.type, source: item.source })),
  }
}

/** a hash of a record's content, as "<digest name>:<hex>". A whole SignRecord hashes the same as its content */
export async function contentHash (content: RecordContent, digest: Digest = sha256): Promise<string> {
  const bytes = await digest.hash(new TextEncoder().encode(canonicalJSON(hashedContent(content))))
  return `${digest.name}:${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}
