import { expect, describe, it } from 'vitest'
import { encodeFilename, decodeFilename, fn } from '../src/filename-codec.ts'

const samples = [
  'Hello world.',
  'i-am-a-nice-url',
  '🫥 emoji',
  'ăѣ𝔠ծềſģȟᎥ𝒋ǩľḿꞑȯ𝘱𝑞𝗋𝘴ȶ𝞄𝜈ψ𝒙𝘆𝚣1234567890!@#$%^&*()-_=+[{]};:\'",<.>/?~𝘈Ḇ𝖢𝕯٤ḞԍНǏ𝙅ƘԸⲘ𝙉০Ρ𝗤Ɍ𝓢ȚЦ𝒱Ѡ𝓧ƳȤѧᖯć𝗱ễ𝑓𝙜Ⴙ𝞲𝑗𝒌ļṃŉо𝞎𝒒ᵲꜱ𝙩ừ𝗏ŵ𝒙𝒚ź1234567890!@#$%^&*()-_=+[{]};:\'",<.>/?~АḂⲤ𝗗𝖤𝗙ꞠꓧȊ𝐉𝜥ꓡ𝑀𝑵Ǭ𝙿𝑄Ŗ𝑆𝒯𝖴𝘝𝘞ꓫŸ𝜡ả𝘢ƀ𝖼ḋếᵮℊ𝙝Ꭵ𝕛кιṃդⱺ𝓅𝘲𝕣𝖘ŧ𝑢ṽẉ𝘅ყž1234567890!@#$%^&*()-_=+[{]};:\'",<.>/?~Ѧ𝙱ƇᗞΣℱԍҤ١𝔍К𝓛𝓜ƝȎ𝚸𝑄Ṛ𝓢ṮṺƲᏔꓫ𝚈𝚭𝜶Ꮟçძ𝑒𝖿𝗀ḧ𝗂𝐣ҝɭḿ𝕟𝐨𝝔𝕢ṛ𝓼тú𝔳ẃ⤬𝝲𝗓1234567890!@#$%^&*()-_=+[{]};:\'",<.>/?~𝖠Β𝒞𝘋𝙴𝓕ĢȞỈ𝕵ꓗʟ𝙼ℕ০𝚸𝗤ՀꓢṰǓⅤ𝔚Ⲭ𝑌𝙕𝘢𝕤'
]

describe('/src/lib/models/filename-codec', () => {
  it('roundtrip', () => {
    for (const sample of samples) {
      const encoded = encodeFilename(sample)
      expect(encoded).does.not.match(/[^a-z0-9*'()~_.!-]/gmiu)
      const decoded = decodeFilename(sample)
      expect(decoded).to.equal(sample)
    }
  })

  it('fn template works', () => {
    expect(fn`foo/${'bar'}/baz`).to.equal('foo/bar/baz')
    expect(fn`${'🥰'}`).to.equal(encodeFilename('🥰'))
    expect(fn`/i/like/$@BEANS`).to.equal('/i/like/$@BEANS')
    expect(fn`/i/dislike/${'*&^~'}`).to.not.equal('/i/dislike/*&^~')
  })

  it('doesn\'t confuse itself', () => {
    for (const sample of ['🤪', '𝘱𝑞𝗋𝘴ȶ𝞄𝜈ψ𝒙𝘆𝚣12345678', 'hello my friend']) {
      expect(decodeFilename(encodeFilename(encodeFilename(sample)))).to.equal(encodeFilename(sample))
      expect(decodeFilename(encodeFilename(encodeFilename(sample)))).to.not.equal(sample)
      expect(decodeFilename(encodeFilename(encodeFilename(sample)))).to.not.equal(encodeFilename(encodeFilename(sample)))
    }
  })
})
