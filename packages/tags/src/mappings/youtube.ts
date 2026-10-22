// The YouTube providers' tags are written by hand in the YouTube spider's curation files, mostly with the
// vocabulary's names.
import type { ProviderMapping } from '../mapping.ts'

export const asphyxia: ProviderMapping = {
  provider: 'asphyxia',
  namespace: 'asphyxia',
  own: ['asphyxia'],
  usesVocabulary: true,
  rules: {
    // its lessons' phrases are example sentences ("Where is the pain?"): the odd set phrase is claimed instead
    'phrase': ['example'],
    'fingerspelling': ['lexis.fingerspell'],
    'classifier': ['lexis.classifier'],
    'asl': ['language.asl'],
  },
}

export const community: ProviderMapping = {
  provider: 'community',
  namespace: 'community',
  own: ['community'],
  usesVocabulary: true,
}

// every Signpedia sign is "iconic": that's Signpedia's description of its signs, so it stays Signpedia's
export const signpedia: ProviderMapping = {
  provider: 'signpedia',
  namespace: 'signpedia',
  own: ['signpedia'],
  usesVocabulary: true,
  rules: {
    'noun': ['pos.noun'],
    'verb': ['pos.verb'],
    'adjective': ['pos.adjective'],
    'adverb': ['pos.adverb'],
    'preposition': ['pos.preposition'],
  },
}
