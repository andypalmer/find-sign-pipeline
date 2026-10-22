// Signbank's tags are the vocabulary, so they're kept as they are. Its spider also adds Find Sign's region
// tags and "described". Tags the vocabulary doesn't have yet (b92.*, corpus.attested, and its stray state and
// school tags) are kept under signbank.
import type { ProviderMapping } from '../mapping.ts'

export const auslanSignbank: ProviderMapping = {
  provider: 'auslan-signbank',
  namespace: 'signbank',
  own: ['auslan-signbank'],
  usesVocabulary: true,
  // its editors' to-do list: needs video, problematic, redo video
  drop: ['workflow.'],
}
