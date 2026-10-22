// Find Sign's tag vocabulary: the tags it uses to describe signs, whichever provider they come from. Auslan
// Signbank's tags are the base, as they come from a linguistics programme; Find Sign adds a few for what other
// providers say that Signbank has no tag for. Ids are as Find Sign writes tags: lower case, "." between a
// namespace and its tag, "-" between words ("lexis:signed english" is lexis.signed-english).

export type Tag = {
  id: string,
  /** for people choosing tags: the tag's last part in words when not given */
  label: string,
  /** a line on what it says about a sign, where that's known for sure */
  meaning?: string,
  from: 'signbank' | 'find-sign',
}

type Entry = [id: string, meaning?: string, label?: string]

const labelOf = (id: string) => id.split('.').at(-1)!.replace(/-/g, ' ')
const tags = (from: Tag['from'], entries: Entry[]): Tag[] => entries.map(([id, meaning, label]) => ({
  id, label: label ?? labelOf(id), ...(meaning && { meaning }), from,
}))

export const vocabulary: readonly Tag[] = [
  // a sign's lexical status and register
  ...tags('signbank', [
    ['lexis.classifier', 'a classifier (depicting) sign'],
    ['lexis.crude', 'rude or vulgar'],
    ['lexis.doubtlex'],
    ['lexis.fingerspell', 'fingerspelled, or made from fingerspelling'],
    ['lexis.gensign'],
    ['lexis.marginal'],
    ['lexis.obsolete', 'no longer in use'],
    ['lexis.proper-name', 'the name of a person, place or organisation'],
    ['lexis.regional', 'used in some regions only'],
    ['lexis.restricted-lexeme'],
    ['lexis.signed-english', 'from Australasian Signed English'],
    ['lexis.signed-english-only', 'used only in Australasian Signed English'],
    ['lexis.technical', 'a technical term'],
    ['lexis.varlex'],
  ]),
  // its topic (semantic field)
  ...tags('signbank', [
    'animal', 'arithmetic', 'arts', 'bodypart', 'car', 'city', 'clothing', 'color', 'cooking', 'day', 'deaf', 'drink',
    'education', 'family', 'feel', 'food', 'furniture', 'government', 'groom', 'health', 'judge', 'language-act',
    'law', 'material', 'metalg', 'mind', 'money', 'nature', 'number', 'order', 'people', 'physical-act', 'quality',
    'quantity', 'question', 'recreation', 'rooms', 'salutation', 'sensing', 'sexuality', 'shapes', 'shopping',
    'sport', 'telecommunications', 'time', 'travel', 'utensil', 'weather', 'work',
  ].map((topic): Entry => [`semantic.${topic}`])),
  // its form
  ...tags('signbank', [
    ['phonology.alternating', 'the hands move in turn'],
    ['phonology.dominant-hand-only', 'made with the dominant hand only'],
    ['phonology.double-handed', 'made with both hands'],
    ['phonology.forearm-rotation', 'the forearm twists'],
    ['phonology.handshape-change', 'the handshape changes during the sign'],
    ['phonology.onehand', 'made with one hand'],
    ['phonology.parallel'],
    ['phonology.symmetrical', 'both hands have the same handshape and movement'],
    ['phonology.two-handed', 'made with both hands'],
  ]),
  // its morphology
  ...tags('signbank', [
    ['morph.begin-directional-sign'],
    ['morph.body-locating'],
    ['morph.directional-sign', 'its movement can change to show who or where'],
    ['morph.end-directional-sign'],
    ['morph.locational-and-directional'],
    ['morph.orientating-sign'],
  ]),
  // how clearly its form shows its meaning
  ...tags('signbank', [
    ['iconicity.transparent', 'its meaning is clear from its form'],
    ['iconicity.translucent', 'the link to its meaning is clear once known'],
    ['iconicity.opaque', 'no link to its meaning can be seen'],
    ['iconicity.obscure'],
  ]),
  // who uses it
  ...tags('signbank', [
    ['religion.catholic', 'used by Catholics'],
    ['religion.catholic-school', 'used in Catholic schools'],
    ['religion.other'],
    ['religion.religion'],
  ]),

  // its register, where Signbank's lexis tags don't say: lexis.crude is rude, these are sexual without being rude
  ...tags('find-sign', [
    ['register.explicit', 'sexually explicit'],
    ['register.suggestive', 'sexually suggestive'],
  ]),
  // where it's used: Find Sign's region tags, from Signbank's region maps and the providers' own
  ...tags('find-sign', [
    ['everywhere', 'used across Australia'],
    ['northern', 'the northern dialect (Queensland, New South Wales, the ACT)'],
    ['southern', 'the southern dialect (the other states and the Northern Territory)'],
    ['act', 'used in the Australian Capital Territory', 'ACT'],
    ['nsw', 'used in New South Wales', 'New South Wales'],
    ['nt', 'used in the Northern Territory', 'Northern Territory'],
    ['qld', 'used in Queensland', 'Queensland'],
    ['sa', 'used in South Australia', 'South Australia'],
    ['tas', 'used in Tasmania', 'Tasmania'],
    ['vic', 'used in Victoria', 'Victoria'],
    ['wa', 'used in Western Australia', 'Western Australia'],
  ]),
  // its part of speech, which Signbank puts in its definitions rather than its tags
  ...tags('find-sign', [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection',
  ].map((pos): Entry => [`pos.${pos}`, `used as a ${pos}`])),
  ...tags('find-sign', [
    ['language.asl', 'from American Sign Language', 'ASL'],
    ['described', 'its meaning is explained in a signed video'],
    ['invented', 'made up, not in established use'],
    // a lexeme can be a phrase, when it's signed and learnt as a unit; a sentence made of several isn't one
    ['phrasal', 'a phrase that is one lexeme, like an idiom or set phrase: learnt as a unit, its meaning not always that of its signs'],
    ['example', 'a sentence showing signs in use, made of several lexemes'],
    // a single sign can be idiomatic too: TOUCH FINISH means "been there, done that"
    ['idiom', 'its meaning is figurative: not what its form or its parts suggest'],
  ]),
]

const byId = new Map(vocabulary.map(tag => [tag.id, tag]))

/** the vocabulary's entry for a tag, if it's in it */
export const canonicalTag = (id: string): Tag | undefined => byId.get(id)
