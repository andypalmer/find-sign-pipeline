import { expect, describe, it } from 'vitest'
import lru from '../src/lru.ts'

describe('/src/lib/functions/lru.ts', () => {
  it('works as expected', async () => {
    const list = lru(2)

    const foo = await list('foo', (_) => 'foo')
    const bar = await list('bar', (_) => 'bar')
    const baz = await list('baz', (_) => 'baz')
    expect(foo).to.equal('foo')
    expect(bar).to.equal('bar')
    expect(baz).to.equal('baz')
    expect(await list('foo', (_) => 'blep')).to.equal('blep')
    expect(await list('baz', (_) => 'blep')).to.equal('baz')
    expect(await list('bar', (_) => 'blep')).to.equal('blep')
  })
})
