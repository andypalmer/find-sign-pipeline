// Canonical JSON: the same data always serialises to the same string, whatever order its keys were set in.
// Object keys are sorted, undefined values are left out (as JSON.stringify does), and array order is kept.

export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue | undefined }

export function canonicalJSON (value: JSONValue | undefined): string {
  if (value === undefined) throw new TypeError('canonicalJSON needs a value')
  return serialise(value)
}

function serialise (value: JSONValue): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`can't serialise ${value}`)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => serialise(item)).join(',')}]`
  }
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${serialise(value[key] as JSONValue)}`).join(',')}}`
}
