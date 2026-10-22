// Spread the Sign's tags are its categories (where a sign sits on its site) and its part of speech. Only the
// categories that mean one thing for every sign in them have rules.
//
// Deliberately left without rules:
// - profanity-slang: it holds fuck and cunt, but also brb, bff, asap and noob; nothing else separates them
// - sex: mostly explicit, but it also holds the-yes-list and the-no-list, which are about consent
// - sex-gender: it holds man, woman, gay and non-binary as well as penis and intercourse
// - food-beverages and eating-drinking: they mix food and drink; their narrower categories have rules
// - broad areas (generalities, lifestyle, science, sign-language-for-beginners, art-entertainment): where a sign
//   appears on the site, not what it means
// - religion, professions: topics without a close match in the vocabulary
import type { ProviderMapping } from '../mapping.ts'

const food = ['semantic.food']
const sport = ['semantic.sport']
const health = ['semantic.health']
const arts = ['semantic.arts']

export const spreadTheSign: ProviderMapping = {
  provider: 'spread-the-sign-auslan',
  namespace: 'sts',
  own: ['spread-the-sign'],
  rules: {
    // part of speech, which it spells two ways
    'noun': ['pos.noun'], 'nouns': ['pos.noun'],
    'verb': ['pos.verb'], 'verbs': ['pos.verb'],
    'adjective': ['pos.adjective'], 'adjectives': ['pos.adjective'],
    'adverb': ['pos.adverb'], 'adverbs': ['pos.adverb'],
    'pronoun': ['pos.pronoun'],
    'preposition': ['pos.preposition'], 'prepositions': ['pos.preposition'],
    'conjunction': ['pos.conjunction'], 'conjunctions': ['pos.conjunction'],
    'interjection': ['pos.interjection'],
    // topics
    'numbers': ['semantic.number'], 'numeral': ['semantic.number'],
    'zoology': ['semantic.animal'],
    'time': ['semantic.time'],
    'emotions-feelings': ['semantic.feel'],
    'clothes': ['semantic.clothing'],
    'family-relationships': ['semantic.family'],
    'anatomy': ['semantic.bodypart'],
    'colours': ['semantic.color'],
    'deaf-society': ['semantic.deaf'],
    'beverages': ['semantic.drink'],
    'specific-dishes': food, 'desserts-sweets': food, 'fruit-berries': food, 'vegetables-legumes': food,
    'meat': food, 'fish-seafood': food, 'spices-herbs': food, 'nuts-snacks': food, 'other-foods-and-ingredients': food,
    'cooking-baking': ['semantic.cooking'],
    'meteorology': ['semantic.weather'],
    'shopping': ['semantic.shopping'],
    'work': ['semantic.work'],
    'football-soccer': sport, 'swimming': sport, 'track-and-field': sport, 'raquetsports': sport,
    'gymnastics': sport, 'combat-sports': sport, 'other-sports': sport,
    'laws-policies': ['semantic.law'],
    'politics': ['semantic.government'],
    'education-learning': ['semantic.education'], 'examinations-certificates': ['semantic.education'],
    'health': health, 'health-medicine': health, 'medical-conditions': health, 'dental-health': health,
    'healthcare-professionals': health,
    'driving-a-car': ['semantic.car'], 'specific-cars-vehicles': ['semantic.car'],
    'travelling': ['semantic.travel'],
    'communication-phones': ['semantic.telecommunications'],
    'visual-arts': arts, 'painting-drawing': arts, 'performing-arts': arts, 'art-terms': arts,
  },
}
