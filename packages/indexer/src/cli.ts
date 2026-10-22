#!/usr/bin/env node
// Builds search indexes outside the website.
//   find-sign-index [options] <provider>...
//     --collections <folder or url>  the collections folder (holding find-sign/raw and encoded-search-data/raw),
//                                    or a data server's collections url, such as https://data.auslan.fyi/collections/
//     --index-name <name>            the folder in find-sign/raw holding the indexes (default: index)
//     --indexes <a,b,c>              every provider, for global-vectors.lps (default: the folders in the index folder)
//     --vectors <url or folder>      the word vector library (default: <collections>/wordvec/raw/commoncrawl-english-300)
//     --fidelity <0 to 1>            precision of global-vectors.lps (default: 1)
//     --locale <locale>              for splitting titles into words (default: en-AU)
//     --fast                         reuse each provider's vectors from its last build
//     --keep-identical               index signs with identical videos separately, rather than as one
// Writing to a data server needs its write identity in the SEARCH_WRITE_IDENTITY environment variable.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { fetchWithFiles, findSignData, folderStore } from '@andypalmer/data-store'
import { vectorLibrary } from '@andypalmer/vectors'
import { buildSearchIndex } from './build.ts'

const { values, positionals: providers } = parseArgs({
  allowPositionals: true,
  options: {
    collections: { type: 'string' },
    'index-name': { type: 'string', default: 'index' },
    indexes: { type: 'string' },
    vectors: { type: 'string' },
    fidelity: { type: 'string', default: '1' },
    locale: { type: 'string', default: 'en-AU' },
    fast: { type: 'boolean', default: false },
    'keep-identical': { type: 'boolean', default: false },
  },
})

if (!values.collections || !providers.length) {
  console.error('usage: find-sign-index --collections <folder or url> [options] <provider>...')
  process.exit(2)
}

// a folder or a url, as a url ending in /
const asURL = (place: string) => {
  const url = /^https?:\/\//.test(place) ? new URL(place) : pathToFileURL(path.resolve(place))
  return url.toString().replace(/\/?$/, '/')
}
const collections = asURL(values.collections)
const collectionURL = `${collections}find-sign/raw/`
const store = collectionURL.startsWith('file:')
  ? folderStore(new URL(collectionURL).pathname)
  : findSignData({ collection: collectionURL, identity: process.env.SEARCH_WRITE_IDENTITY, userAgent: 'find-sign-index' })
const indexName = values['index-name']!
const indexes = values.indexes?.split(',') ?? (await store.list(indexName)).filter(name => !name.includes('.'))
const vectors = vectorLibrary(values.vectors ? asURL(values.vectors).replace(/\/$/, '') : `${collections}wordvec/raw/commoncrawl-english-300`, { fetch: fetchWithFiles })

for (const provider of providers) {
  await buildSearchIndex(provider, {
    store,
    collectionURL,
    encodedSearchDataURL: `${collections}encoded-search-data/raw`,
    indexName,
    indexes: indexes.includes(provider) ? indexes : [...indexes, provider],
    lookupVector: vectors.lookup,
    vectorFidelity: Number(values.fidelity),
    locale: values.locale,
    fetch: fetchWithFiles,
    mergeIdenticalMedia: !values['keep-identical'],
  }, { fast: values.fast })
}
