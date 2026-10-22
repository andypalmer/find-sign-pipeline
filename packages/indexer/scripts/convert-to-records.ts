// Converts a folder of encoded-search-data files to record files, and checks each converts back unchanged.
//   node packages/indexer/scripts/convert-to-records.ts <encoded-search-data folder> <output folder> [locale]
// Writes <provider>.records.json to the output folder. Files starting with # (such as #keys.json) are skipped.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { serialiseRecordFile } from '@andypalmer/records'
import { encodedSearchDataFromRecordFile, recordFileFromEncodedSearchData, type Quirk } from '../src/records.ts'
import { withSearchDataDefaults } from '../src/encoded-search-data.ts'

const [input, output, locale = 'en-AU'] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: convert-to-records <encoded-search-data folder> <output folder> [locale]')
  process.exit(2)
}

const seenAt = new Date().toISOString()
// JSON drops undefined values, so compare what would be written
const asWritten = (value: unknown) => JSON.parse(JSON.stringify(value))
let failed = false

await mkdir(output, { recursive: true })
for (const name of (await readdir(input)).filter(name => name.endsWith('.json') && !name.startsWith('#')).sort()) {
  const provider = name.slice(0, -'.json'.length)
  let raw
  try {
    raw = JSON.parse(await readFile(path.join(input, name), 'utf8'))
  } catch (err) {
    console.log(`${provider}: skipped, not readable JSON (${(err as Error).message})`)
    continue
  }

  try {
    const quirks: Quirk[] = []
    const file = await recordFileFromEncodedSearchData(raw, { provider, seenAt, locale, onQuirk: quirk => quirks.push(quirk) })
    await writeFile(path.join(output, `${provider}.records.json`), serialiseRecordFile(file))

    // the round trip should give back the original, except that entries without a timestamp gain one, and
    // entries with quirks were changed on purpose
    const expected = asWritten(withSearchDataDefaults(structuredClone(raw), locale))
    for (const entry of Object.values(expected) as { timestamp?: number }[]) entry.timestamp ??= Date.parse(seenAt)
    const back = asWritten(encodedSearchDataFromRecordFile(file, { keys: 'sourceId' }))
    const quirky = new Set(quirks.map(quirk => quirk.id))
    const differing = Object.keys(expected).filter(id => !quirky.has(id) && !isDeepStrictEqual(expected[id], back[id]))

    const renamed = file.records.filter(r => r.aliases)
    const clipped = file.records.filter(r => r.media.some(m => m.source.clipping)).length
    const unpublished = file.records.filter(r => r.published === false).length
    console.log(`${provider}: ${file.records.length} records, ${clipped} clipped, ${unpublished} unpublished, ${quirks.length} quirks fixed, ${renamed.length} with a new readable id${differing.length ? `, ${differing.length} DIFFER after a round trip, e.g. ${differing.slice(0, 3).join(', ')}` : ''}`)
    if (renamed.length) console.log(`  e.g. ${renamed.slice(0, 4).map(r => `${r.aliases![0]} → ${r.id}`).join(', ')}`)
    for (const quirk of quirks.slice(0, 3)) console.log(`  ${quirk.id}: ${quirk.message}`)
    if (quirks.length > 3) console.log(`  ...and ${quirks.length - 3} more`)
    if (differing.length) failed = true
  } catch (err) {
    console.log(`${provider}: FAILED\n${(err as Error).message}`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
