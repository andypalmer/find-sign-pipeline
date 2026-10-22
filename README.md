# Find Sign pipeline

How signs get into [Find Sign](https://find.auslan.fyi), outside the website: the record contract spiders write
to, what spiders share, encoding sign videos, and building the search indexes the website reads. Each package is
published to GitHub Packages; the website and the spiders (in their own repos) install them from there.

```
spider (own repo) ──records──▶ encoder ──▶ encoded-search-data ──▶ indexer ──▶ search index ──▶ website
```

| Package | What it does |
| --- | --- |
| `@andypalmer/records` | The sign record: what spiders produce, with change tracking across runs and readable ids. The contract between spiders and the indexer. |
| `@andypalmer/tags` | Find Sign's tag vocabulary, based on Auslan Signbank's, and how each provider's tags map onto it. The index build maps each provider's tags with it. |
| `@andypalmer/spider-kit` | What spiders share: polite fetching, crawl bookkeeping (a page that fails or isn't due keeps its signs), reusing encodings, Vimeo streams, and writing encoded-search-data. |
| `@andypalmer/encoder` | Encodes sign videos with ffmpeg: an h264 mp4 and a vp9 webm within 640×360 (never upscaled), and a webp thumbnail. |
| `@andypalmer/indexer` | Builds a provider's search index from its encoded-search-data, applying overrides, mapping its tags onto the vocabulary and keeping signs' readable ids, then rebuilds global-vectors.lps. Has a command line (below). |
| `@andypalmer/orthagonal` | The search index format: types, a reader (the website's search uses it) and a writer. |
| `@andypalmer/vectors` | The `.lps` word vector format, and lookups in a sharded word vector library. |
| `@andypalmer/data-store` | Where data lives: a storage interface, the find-sign-data server client (signed requests), and a local folder store. |
| `@andypalmer/find-sign-util` | Small shared utilities: the filename encoding for ids, iterators, string and hex encoding, hashing, an LRU cache. |

None of them read the website's settings: everything they need (urls, stores, the vector library) is passed in.

## Building indexes outside the website

```sh
npm install
node packages/indexer/dist/cli.js --collections ../collections deaf-nation-wsl
SEARCH_WRITE_IDENTITY=… node packages/indexer/dist/cli.js --collections https://data.auslan.fyi/collections/ community
```

`--collections` is a folder holding `find-sign/raw` and `encoded-search-data/raw` (a local copy of the data
server's collections), or a data server's collections url. Either way the index is the same, as its media urls
are relative. See the top of `packages/indexer/src/cli.ts` for the options.

## Developing

```sh
npm install     # also builds every package (tsc -b, dependencies first)
npm test
npm run check
npm run build   # after changing a package, so packages and repos that use it see the change
```

The website and spiders link these packages from a folder next to them (`file:../find-sign-pipeline/...`) until
they're published. Once published, they install them from GitHub Packages, with an `.npmrc` like:

```
@andypalmer:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

GitHub Packages needs a token to install from, even for public packages: locally a classic personal access token
with `read:packages`; in another repo's GitHub Actions, its workflow token, once that repo is given access in each
package's settings (Manage Actions access).

## Releasing

release-please (`.github/workflows/release-please.yml`) keeps a release PR open on main for each package with
unreleased changes, versioned from Conventional Commits (`fix:` patch, `feat:` minor, `!` major); a package's
dependents are bumped with it. Merging the PR tags each release (`records-v0.2.0` and so on) and publishes the
released packages, dependencies first. Repo settings: Actions → General → Workflow permissions → "Allow GitHub
Actions to create and approve pull requests".
