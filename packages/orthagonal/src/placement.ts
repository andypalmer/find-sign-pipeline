// Where things live in a version 2 index. A sign's place comes from its name, not from its position in a
// list, so adding or removing one sign never moves another. We turn the name into a number by taking the
// first four bytes of its SHA-256, then deal that number out like cards into a fixed number of piles.
import { sha256 } from '@andypalmer/find-sign-util'

export const DEFAULT_VECTOR_BUCKET_COUNT = 64

/** which shard file holds the sign with this id? */
export async function whichShardHoldsSign (id: string, shardCount: number): Promise<number> {
  requireWholeNumberAboveZero(shardCount, 'shard count')
  return (await firstFourBytesOf(id)) % shardCount
}

/** which vector bucket file holds this word's vector? */
export async function whichBucketHoldsWord (word: string, bucketCount: number = DEFAULT_VECTOR_BUCKET_COUNT): Promise<number> {
  requireWholeNumberAboveZero(bucketCount, 'bucket count')
  return (await firstFourBytesOf(word)) % bucketCount
}

async function firstFourBytesOf (text: string): Promise<number> {
  const hash = await sha256(text)
  return new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, false)
}

function requireWholeNumberAboveZero (value: number, what: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`The ${what} must be a whole number above zero, not ${value}`)
}
