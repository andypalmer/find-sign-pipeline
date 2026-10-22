// convert a Uint8Array to an uppercase hex encoded string
export function byteArrayToHex (byteArray: Uint8Array): string {
  return [...byteArray].map(x => `0${x.toString(16).toUpperCase()}`.slice(-2)).join('')
}

// convert a hex encoded string to a byte array
export function hexToByteArray (string: string): Uint8Array {
  let pointer = 0
  const output = new Uint8Array(Math.ceil(string.length / 2))
  while (pointer < string.length) {
    const slice = string.slice(pointer, pointer + 2)
    output[pointer / 2] = parseInt(slice, 16)
    pointer += 2
  }

  return output
}