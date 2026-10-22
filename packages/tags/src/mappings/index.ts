// Every provider's mapping, by provider id.
import type { ProviderMapping } from '../mapping.ts'
import { auslanSignbank } from './auslan-signbank.ts'
import { deafNation, latrobe, theatre101, toddslan, vAlford } from './others.ts'
import { spreadTheSign } from './spread-the-sign.ts'
import { asphyxia, community, signpedia } from './youtube.ts'

export const mappings: ReadonlyMap<string, ProviderMapping> = new Map([
  spreadTheSign, auslanSignbank, asphyxia, community, signpedia, deafNation, theatre101, latrobe, toddslan, vAlford,
].map(mapping => [mapping.provider, mapping]))
