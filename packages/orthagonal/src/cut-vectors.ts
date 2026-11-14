// Deals word vectors into bucket files, by the hash of the word. A word's vector never changes, so a bucket
// only changes when a new word lands in it. Words are sorted inside a bucket, so the same words always make
// the same bytes, and a bucket that didn't change keeps its name. The reader can tell how many buckets there
// are from the length of the manifest's vectors list.
//
// We only bucket the words we are given. Keeping a word after its last sign has gone (a stale word is small and
// harmless) is up to whoever gathers the words: they pass the old ones in too.
import { build, type Vector } from '@andypalmer/vectors'
import { nameFileAfterItsBytes } from './content-name.ts'
import { DEFAULT_VECTOR_BUCKET_COUNT, whichBucketHoldsWord } from './placement.ts'

export type CutVectors = {
  vectorNames: string[], // file name of each bucket, in bucket number order
  files: { [fileName: string]: Uint8Array }, // every bucket's contents, by file name
}

export type CutVectorsOptions = {
  bucketCount?: number,
}

export async function cutVectors (vectorsByWord: { [word: string]: Vector }, { bucketCount = DEFAULT_VECTOR_BUCKET_COUNT }: CutVectorsOptions = {}): Promise<CutVectors> {
  if (!Number.isInteger(bucketCount) || bucketCount < 1) throw new Error(`The bucket count must be a whole number above zero, not ${bucketCount}`)

  const wordsInBucket: { [word: string]: Vector }[] = Array.from({ length: bucketCount }, () => ({}))
  const sortedWords = Object.keys(vectorsByWord).sort()
  const buckets = await Promise.all(sortedWords.map(word => whichBucketHoldsWord(word, bucketCount)))
  sortedWords.forEach((word, position) => { wordsInBucket[buckets[position]][word] = vectorsByWord[word] })

  const files: { [fileName: string]: Uint8Array } = {}
  const vectorNames = await Promise.all(wordsInBucket.map(async (words, number) => {
    const contents = build(words)
    const fileName = await nameFileAfterItsBytes(`vectors-${number}`, 'lps', contents)
    files[fileName] = contents
    return fileName
  }))
  return { vectorNames, files }
}
