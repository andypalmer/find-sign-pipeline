// The fake hosts, keys and index settings the pipeline's tests use, matching the fixtures.
import { sign_keyPair_fromSeed, encodeHex } from 'tweetnacl-ts'
import { findSignData } from '@andypalmer/data-store'
import { vectorLibrary } from '@andypalmer/vectors'
import type { IndexSettings } from '@andypalmer/indexer'

export const DataBase = 'http://data.test/collections/find-sign/raw/'
export const EncodedSearchDataBase = 'http://data.test/collections/encoded-search-data/raw'
export const VectorLibraryBase = 'http://data.test/collections/wordvec/raw/test-vectors'
export const IndexBase = `${DataBase}index`

// deterministic data-server write identity, so license strings can be verified in tests
export const writeKeyPair = sign_keyPair_fromSeed(new Uint8Array(32).fill(7))
export const writeIdentity = `${encodeHex(writeKeyPair.publicKey)}-${encodeHex(writeKeyPair.secretKey)}`

/** index settings for the fixtures, through a find-sign-data client: install a FakeDataServer first. Each
 * call opens the vector library afresh, so its lookups can be counted */
export function testSettings (overrides: Partial<IndexSettings> = {}): IndexSettings {
  return {
    store: findSignData({ collection: DataBase, identity: writeIdentity, userAgent: 'find-sign-website' }),
    collectionURL: DataBase,
    encodedSearchDataURL: EncodedSearchDataBase,
    indexName: 'index',
    indexes: ['alpha', 'beta'],
    lookupVector: vectorLibrary(VectorLibraryBase).lookup,
    vectorFidelity: 1,
    locale: 'en-AU',
    ...overrides,
  }
}
