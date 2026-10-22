// An English phrase as searches match it: "Blow your top!" and "blow one's top" are the same phrase. Case,
// punctuation, a leading "to" or "(be)", and which person it's about are ignored.
const people = /\b(my|your|his|her|their|our|one's)\b/g
const selves = /\b(myself|yourself|himself|herself|themselves|ourselves|oneself)\b/g

export default function normalizePhrase (phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\((be|get)\)/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ')
    .replace(selves, 'oneself')
    .replace(people, "one's")
    .replace(/\bsomebody\b/g, 'someone')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|be) /, '')
}
