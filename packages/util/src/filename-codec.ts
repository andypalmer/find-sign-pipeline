
/** convert any utf-8 string to a url and filesystem safe string */
export function encodeFilename (str: string): string {
  return str.replace(/[^a-z0-9*'()_.!-]/gmiu, char =>
    `~${(char.codePointAt(0) as number).toString(36).toLowerCase()}.`
  ) // - _ . ! ~ * ' ( )
}

/** convert an encodeFilename() encoded string back in to the original utf-8 string */
export function decodeFilename (str: string): string {
  return str.replace(/~[0-9a-z]+\./gmu, str =>
    String.fromCodePoint(parseInt(str.slice(1, -1), 36))
  )
}

/** tagged template literal function to encode paths */
export function fn (strings: TemplateStringsArray, ...args: any[]) {
  const output = []
  for (const str of strings) {
    output.push(str)
    if (args.length > 0) {
      const value = args.shift()
      output.push(encodeFilename(`${value}`))
    }
  }
  return output.join('')
}