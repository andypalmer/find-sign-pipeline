# @andypalmer/tags

Find Sign's tag vocabulary, and how each provider's tags map onto it, so a sign is described the same way
whichever site it came from. The vocabulary is based on Auslan Signbank's tags, which come from a linguistics
programme. Find Sign adds a few of its own for what other providers say and Signbank has no tag for: regions,
part of speech, a sexual register (`register.explicit`, `register.suggestive`), and `language.asl`, `described`,
`invented`, `phrasal` and `example` for phrases, and `idiom`.

Being a phrase and being idiomatic are different things:

| | One sign | Several signs |
| --- | --- | --- |
| Literal meaning | most signs | `example`: a sentence shown to teach its signs, not a lexeme |
| Idiomatic meaning | `idiom`: TOUCH FINISH, "been there, done that" | `phrasal` and `idiom`: a set phrase or idiom, one lexeme |

`phrasal` marks a phrase signed and learnt as one unit, such as Happy New Year; `idiom` marks a meaning that's
figurative, not what the form or its parts suggest. Signbank's entries are all single signs, so its idioms are
`idiom` only. Its definitions' "Idiomatic English = …" notes are about the English translation (DIE: "kick the
bucket"), so they don't make a sign an idiom.

This package holds the vocabulary and the mappings. `@andypalmer/indexer` maps each provider's tags with them when
it builds an index, then applies the provider's claims; the records keep the tags as the provider gave them.

## The vocabulary

`src/vocabulary.ts` lists every tag, with a label for people choosing tags and, where it's known for sure, a
line on what it says about a sign. Signbank's namespaces each describe a different kind of thing:

| Namespace | Describes |
| --- | --- |
| `lexis` | Lexical status and register: `crude`, `regional`, `technical`, `obsolete` |
| `semantic` | Topic: `food`, `animal`, `health`, `sexuality` |
| `phonology` | Form: `onehand`, `symmetrical`, `alternating` |
| `morph` | Morphology: `directional-sign`, `body-locating` |
| `iconicity` | How clearly its form shows its meaning |
| `religion` | Who uses it |

Register and topic are different questions: `lexis.crude` says a sign is rude, and `register.explicit` and
`register.suggestive` that it's sexual, while `semantic.sexuality` only says it's about sex, sexuality or
reproduction, which also covers gay, pregnant and birth.

Some Signbank tags have no meaning written yet: `lexis.doubtlex`, `lexis.gensign`, `lexis.marginal`,
`lexis.restricted-lexeme`, `lexis.varlex`, `phonology.parallel`, the `morph` tags apart from
`directional-sign`, `iconicity.obscure`, `religion.other` and `religion.religion`. Others aren't in the
vocabulary yet, as what they mean needs checking: `b92.*` and `corpus.attested`.

## Mappings

`src/mappings/` holds a mapping per provider: what namespace its own tags are kept under, and rules from its
tags to the vocabulary's.

```ts
import { mappings, mapTags } from '@andypalmer/tags'

mapTags(mappings.get('spread-the-sign-auslan')!, ['spread-the-sign', 'interjection', 'profanity-slang'])
// ['spread-the-sign', 'sts.interjection', 'pos.interjection', 'sts.profanity-slang']
```

- **Provider tags are kept, namespaced** (`sts.profanity-slang`), so nothing a provider says is lost, and a tag
  without a namespace is always Find Sign's. The spider's own tag for the provider (`spread-the-sign`) stays as
  it is.
- **Providers that already use the vocabulary's names** (Signbank, the YouTube providers, Theatre 101) keep
  those as they are. Their other tags are namespaced too.
- **A rule maps a provider tag only when it means the vocabulary tag for every sign that carries it.** A tag
  that mixes meanings gets no rule. Spread the Sign's `profanity-slang` holds brb and bff as well as profanity,
  so its signs are to be tagged one at a time. Each mapping file says what it leaves out, and why.
- **Some tags are dropped**: Signbank's `workflow.*` tags are its editors' to-do list, not part of the sign.

## Claims

A claim says one sign should, or shouldn't, carry one vocabulary tag, and who says so. Claims are for what no
rule can say: a rule maps a provider tag for every sign that carries it, while a claim tags one sign. Spread the
Sign's profanity is the first case, as its `profanity-slang` category also holds brb and bff.

A provider's claims are kept in one file, `claims/<provider>.json` in the find-sign collection, beside overrides:

```json
{
  "format": "find-sign-claims",
  "version": 1,
  "provider": "spread-the-sign-auslan",
  "claims": [
    { "sourceId": "23305", "tag": "lexis.crude", "claim": "add", "by": "curator:andy", "at": "2026-10-22T09:00:00Z", "why": "profanity" }
  ]
}
```

- **`sourceId`** is the sign's key in its provider's encoded-search-data, as overrides use.
- **`tag`** must be in the vocabulary. A claim about anything else is left out, so a provider's own tags
  (`sts.profanity-slang`) can never be taken away.
- **`by`** is `curator:<name>`, or `user:<id>` for user submissions once they're accepted. A curator's claim beats
  a user's; at the same level the newest claim wins.

The index build applies the deciding claim for each of a sign's tags after mapping its tags. When signs with
identical videos are merged, a tag a claim took from any of them stays off the merged sign. Claims the build
can't use, and claims about signs that aren't in the index, are logged.

`parseClaimFile`, `serialiseClaimFile`, `decidingClaims` and `applyClaims` are exported; the indexer's
`claimsIn(store)` reads and writes a collection's claim files.

## Report

```
npm run report -- ../../../collections/encoded-search-data/raw
```

For each provider in a folder of record files, this shows how many signs get a topic and a part of speech, and
its most used tags that no rule maps: the next candidates for rules, or for tagging one sign at a time.

## Tests

`npm test` checks that every rule maps to a tag in the vocabulary, that providers' namespaces don't collide
with the vocabulary's or each other's, how tags are mapped, and how claims are read, decided and applied.
