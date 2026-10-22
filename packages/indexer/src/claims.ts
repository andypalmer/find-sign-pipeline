// Where providers' tag claims are kept: claims/<provider>.json in the find-sign collection, beside overrides.
// The admin app writes them; the build reads them.
import { bytesToString, fn } from '@andypalmer/find-sign-util'
import type { DataStore } from '@andypalmer/data-store'
import { parseClaimFile, serialiseClaimFile, type ClaimFile } from '@andypalmer/tags'

export interface ClaimStore {
  /** the provider's claims, leaving out any that can't be used (each with what's wrong with it), or undefined
   * when it has none */
  read (provider: string): Promise<ReturnType<typeof parseClaimFile> | undefined>,
  write (file: ClaimFile): Promise<void>,
}

export function claimsIn (store: DataStore): ClaimStore {
  const path = (provider: string) => fn`claims/${provider}.json`
  return {
    async read (provider) {
      const bytes = await store.read(path(provider))
      return bytes && parseClaimFile(bytesToString(bytes))
    },
    async write (file) {
      await store.write(path(file.provider), serialiseClaimFile(file))
    },
  }
}
