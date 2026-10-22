// Providers with few tags of their own.
import type { ProviderMapping } from '../mapping.ts'

// what kind of place a sign names: country, state, province, territory, region, district
export const deafNation: ProviderMapping = {
  provider: 'deaf-nation-wsl',
  namespace: 'deaf-nation',
  own: ['deaf-nation', 'world-sign-languages'],
}

export const theatre101: ProviderMapping = {
  provider: 'theatre-101',
  namespace: 'theatre-101',
  own: ['theatre-101', 'auslan-stage-left'],
  usesVocabulary: true,
}

// Instagram providers: their tags are the posts' hashtags, which stay theirs
export const latrobe: ProviderMapping = {
  provider: 'latrobe-ig',
  namespace: 'latrobe',
  own: ['latrobe'],
}

export const toddslan: ProviderMapping = {
  provider: 'toddslan',
  namespace: 'toddslan',
  own: ['toddslan'],
  rules: { 'invented': ['invented'] },
}

// a curator's override tags one of its signs a phrase: Happy New Year, a set phrase
export const vAlford: ProviderMapping = {
  provider: 'v-alford',
  namespace: 'v-alford',
  own: ['v.alford'],
  rules: { 'phrase': ['phrasal'] },
}
