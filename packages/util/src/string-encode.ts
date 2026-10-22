
const encoder = new TextEncoder()
export function stringToBytes (str: string): Uint8Array {
  return encoder.encode(str)
}

const decoder = new TextDecoder()
export function bytesToString (bytes: Uint8Array): string {
  return decoder.decode(bytes)
}