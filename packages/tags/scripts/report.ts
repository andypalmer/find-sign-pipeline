// What the mappings make of a folder of record files: for each provider, how many signs get a topic and a part
// of speech from the vocabulary, and its most used tags that no rule maps, which are the next candidates for rules
// (or for tagging one sign at a time).
//   npm run report -- <folder of <provider>.records.json files>
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { canonicalTag, mappings, mapTags } from '../src/index.ts'

const folder = path.resolve(process.argv[2] ?? '.')
const files = (await readdir(folder)).filter(name => name.endsWith('.records.json'))

for (const name of files.sort()) {
  const provider = name.replace(/\.records\.json$/, '')
  const mapping = mappings.get(provider)
  if (!mapping) {
    console.log(`${provider}: no mapping\n`)
    continue
  }
  const { records } = JSON.parse(await readFile(path.join(folder, name), 'utf8')) as { records: { tags: string[] }[] }
  let topics = 0, parts = 0
  const unmapped = new Map<string, number>()
  for (const record of records) {
    const mapped = mapTags(mapping, record.tags)
    if (mapped.some(tag => tag.startsWith('semantic.'))) topics++
    if (mapped.some(tag => tag.startsWith('pos.'))) parts++
    for (const tag of record.tags) {
      if (mapping.own.includes(tag) || mapping.rules?.[tag] || (mapping.usesVocabulary && canonicalTag(tag))) continue
      if (mapping.drop?.some(prefix => tag.startsWith(prefix))) continue
      unmapped.set(tag, (unmapped.get(tag) ?? 0) + 1)
    }
  }
  const top = [...unmapped].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => `${tag} ${count}`)
  console.log(`${provider}: ${records.length} signs, ${topics} with a topic, ${parts} with a part of speech`)
  console.log(`  ${unmapped.size} tags without a rule${top.length ? `, most used: ${top.join(', ')}` : ''}\n`)
}
