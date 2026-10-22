# @andypalmer/records

The sign record: what a Find Sign spider produces for each sign, and what the indexer builds search
indexes from. It also tracks signs across spider runs: when each was first and last found, when it last
changed, and whether it has gone missing.

It's plain TypeScript built to JavaScript, with [valibot](https://valibot.dev) as its only dependency, so
spiders in other repos can install it.

## Installing

It's published to GitHub Packages, which needs a token to install from, even for public packages. In the
spider's repo, add an `.npmrc`:

```
@andypalmer:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

then `npm install @andypalmer/records`, with `GITHUB_TOKEN` set to a token that can read packages (locally a
classic personal access token with `read:packages`; in GitHub Actions the workflow's own `GITHUB_TOKEN`, with
`permissions: packages: read`).

## Who writes what

| Part | Written by | Type |
| --- | --- | --- |
| The sign's content: sourceId, title, words, tags, links, media sources | the spider | `RecordContent` |
| Each media item's `encoded`: thumbnail and encodes | the encoder | `Encoded` |
| `id`, `aliases`: the sign's address | `reconcile`, with an `IdPolicy` | `SignRecord` |
| `provenance`: first seen, last seen, last changed, content hash, status | `reconcile` | `Provenance` |
| The provider's name and link, once per file | whoever writes the file | `ProviderInfo` |

A spider only needs `RecordContent` and `validateContent`.

## Rules

- **A sign has two identities.** `sourceId` is the spider's key for recognising the same sign on the next run:
  derive it from something the provider won't change (their own ID, a video ID plus the clip's start), unique
  within the provider. It needn't be readable. `id` is the sign's readable address, in its URL
  (`/sign/<provider>/<id>`). Spiders don't set it.
- **Ids are assigned once and kept.** A new sign's id comes from its title's first term (`air` from "air,
  breeze, mood"), or from a `slug` the spider suggests when the provider has a better name. A homonym gets its
  first two terms (`air-breeze`), then a number (`air-2`). The id then stays the same even if the title
  changes, and is never reused, even after the sign is removed.
- **`aliases` are old addresses** that still lead to the sign, such as permalinks from before readable ids.
- **URLs may be relative.** They resolve against the URL of the record file that holds them, so a data tree
  can move hosts. Cached media is usually relative; links to the provider's site are usually absolute.
- **Unknown fields are rejected**, so a misspelt field fails validation rather than disappearing.
- **A sign changes when its content hash changes.** The hash covers the content and the media sources (URL,
  version, clipping). It ignores provenance, what the encoder made, and the provider's own dates. Writing a
  default out explicitly (`kind: 'sign'`, `published: true`, `body: ''`) isn't a change.
- **Change the media's `version`** (or URL or clipping) when the video itself changes. That's what tells the
  encoder to encode it again; `keepEncodings` carries existing encodes over otherwise.
- **Phrases** (idioms, sentences) set `kind: 'phrase'` and give `meaning`: plain words for what the phrase
  means, which search uses in place of its own words.
- **Provider dates are optional.** Set `sourceCreated` and `sourceUpdated` when the provider says, for example
  a YouTube `publishedAt` or a sitemap `lastmod`.

## Tracking runs

```ts
import { reconcile, validateContent, createRecordFile, serialiseRecordFile, parseRecordFile } from '@andypalmer/records'

const previous = parseRecordFile(await readText('alpha.records.json')).records
const found = scraped.map(validateContent)
const { records, changes } = await reconcile(previous, found, { at: new Date().toISOString() })
// changes: { new, changed, unchanged, returned, missing, removed }, each a list of record ids
await writeText('alpha.records.json', serialiseRecordFile(createRecordFile(provider, records)))
```

Signs are matched to the previous run's records by `sourceId`. A sign a run doesn't find becomes `missing`, then `removed` after 3 runs in a row (pass
`{ removal: { removeAfterMissingRuns } }` to change that). Found again, it comes back as `returned`.
`reconcile` takes the run's time instead of reading the clock, and its options take the `Digest` (SHA-256 with
WebCrypto by default) and the `IdPolicy` (`readableId` by default), so runs can be replayed in tests.

## Files

A record file holds one provider: `{ format: 'find-sign-records', version: 1, provider, records }`.
`serialiseRecordFile` writes records sorted by id, so a run's changes show as small diffs.

## Releasing

release-please versions this package separately from the app, from Conventional Commits that touch
`packages/records` (tags `records-v1.2.3`). Merging its release PR publishes the new version to GitHub Packages.

## Developing

```sh
npm run build -w packages/records   # emits dist/, which other packages import: rebuild after changing src/
npm test -w packages/records
```
