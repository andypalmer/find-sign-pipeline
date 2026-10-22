// How one provider's tags become Find Sign's. A provider's own tags are kept, in the provider's namespace
// (sts.profanity-slang), so nothing it says is lost and a tag without a namespace is always Find Sign's. Rules
// add vocabulary tags for provider tags that mean them for every sign that carries them: a provider tag that
// mixes meanings gets no rule, and its signs are tagged one at a time instead.
import { canonicalTag } from './vocabulary.ts'

export type ProviderMapping = {
  /** the provider's id, as its index is named */
  provider: string,
  /** what its own tags are kept under */
  namespace: string,
  /** the tags its spider adds to say where a sign is from, kept as they are */
  own: readonly string[],
  /** its tags already use the vocabulary's names, as Signbank's do: those are kept as they are */
  usesVocabulary?: boolean,
  /** prefixes of its tags that say nothing about the sign, such as an editor's to-do list: left out */
  drop?: readonly string[],
  /** provider tag → the vocabulary tags every sign carrying it has */
  rules?: Readonly<Record<string, readonly string[]>>,
}

/** a sign's tags as Find Sign has them: its provider's own tags (namespaced unless they're the vocabulary's), and
 * the vocabulary tags its provider's tags mean, in the order its provider gave them */
export function mapTags (mapping: ProviderMapping, tags: readonly string[]): string[] {
  const mapped = new Set<string>()
  for (const tag of tags) {
    if (mapping.drop?.some(prefix => tag.startsWith(prefix))) continue
    if (mapping.own.includes(tag) || (mapping.usesVocabulary && canonicalTag(tag))) {
      mapped.add(tag)
    } else {
      mapped.add(`${mapping.namespace}.${tag}`)
    }
    for (const canonical of mapping.rules?.[tag] ?? []) mapped.add(canonical)
  }
  return [...mapped]
}
