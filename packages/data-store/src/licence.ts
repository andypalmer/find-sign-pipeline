import { sign } from 'tweetnacl-ts'
import { byteArrayToHex, hexToByteArray, stringToBytes } from '@andypalmer/find-sign-util'

// create a license (temporarily valid identity document signed with secret key)
export function createLicense (identity: string, options?: { validFrom?: Date, validTo?: Date }): string {
  const [publicKey, secretKey] = identity.split('-').map(x => hexToByteArray(x))
  if (secretKey.length !== 64) throw new Error('invalid secret key length')

  let validFrom = Date.now() - (1000 * 30) // past 30 seconds acceptable
  let validTo = Date.now() + (1000 * 120) // future 2 minutes acceptable
  if (options && options.validFrom) validFrom = options.validFrom.getTime()
  if (options && options.validTo) validTo = options.validTo.getTime()
  const message = stringToBytes([validFrom, validTo].map(n => Math.round(n)).join('-'))
  const signature = sign(message, secretKey)
  return 'ed25519-' + [publicKey, signature].map(x => byteArrayToHex(x)).join('-')
}
