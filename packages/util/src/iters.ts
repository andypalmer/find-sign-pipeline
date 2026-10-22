import varint from 'varint'

// call a callback function count many times, with arg 0, 1, 2, 3, ...; yields each return value
export function * times<Type> (count: number, fn: (i: number) => Type): Generator<Type> {
  for (let i = 0; i < count; i++) {
    yield fn(i)
  }
}

// iterable that counts up from zero to count - 1
export function * count (count: number) {
  yield * times(count, i => i)
}

// sync version of it-length-prefixed decoder basically
export function * iterateLengthPrefixed (buffer: Uint8Array): Generator<Uint8Array> {
  let cursor = 0
  while (cursor < buffer.length) {
    const length = varint.decode(buffer, cursor)
    cursor += varint.decode.bytes as number
    yield buffer.subarray(cursor, cursor + length)
    cursor += length
  }
}

// returns an iterable which calls a callback with (index, times) `times` many times, returning the results of the callback
export function * timesIterable<Type> (times: number, callback: (index: number, times: number) => Type): Generator<Type> {
  if (times < 1) return

  let index = 0
  while (index < times) {
    yield callback(index, times)
    index += 1
  }
}

type Sliceable<T> = {
  length: number,
  slice: (start: number, end: number) => T
}

// given a sliceable object like an Array, Buffer, or String, returns an array of slices, chunkSize large, up to maxChunks or the whole thing
// the last chunk may not be full size
export function chunk<Type> (sliceable: Sliceable<Type>, chunkSize: number, maxChunks = Infinity): Type[] {
  return [...chunkIterSliceable(sliceable, chunkSize, maxChunks)]
}

// takes a sliceable and chunks it in to arrays and yields those arrays
export function * chunkIterSliceable<T> (sliceable: Sliceable<T>, chunkSize: number, maxChunks: number = Infinity): Generator<T> {
  if (sliceable.length === 0) {
    yield sliceable.slice(0, 0)
    return
  }
  for (let cursor = 0; cursor < sliceable.length && maxChunks > 0; cursor += chunkSize) {
    const slice = sliceable.slice(cursor, cursor + chunkSize)
    yield slice
    maxChunks -= 1
  }
}

// iterable version, takes an iterable as input, and provides an iterable as output with entries grouped in to arrays
export function * chunkIterable<Type> (iterable: Iterable<Type>, chunkSize: number, maxChunks: number = Infinity): Generator<Type[]> {
  const input = iterable[Symbol.iterator]()
  while (maxChunks > 0) {
    const chunk: Type[] = []
    while (chunk.length < chunkSize) {
      const output = input.next()
      if (output.done) {
        if (chunk.length > 0) yield chunk
        return
      } else {
        chunk.push(output.value)
      }
    }
    yield chunk
    maxChunks -= 1
  }
}

export async function * chunkIterableAsync<Type> (sliceable: AsyncIterable<Type>, chunkSize: number, maxChunks: number = Infinity): AsyncGenerator<Type[]> {
  const input = sliceable[Symbol.asyncIterator]()
  while (maxChunks > 0) {
    const chunk: Type[] = []
    while (chunk.length < chunkSize) {
      const output = await input.next()
      if (output.done) {
        if (chunk.length > 0) yield chunk
        return
      } else {
        chunk.push(output.value)
      }
    }
    yield chunk
    maxChunks -= 1
  }
}

// Chunks a iterable of stringifiable values, yielding concatinated strings
export function * chunkStringIterable (string: string, chunkSize: number, maxChunks: number = Infinity) {
  for (const array of chunkIterable(string, chunkSize, maxChunks)) {
    yield array.join('')
  }
}
