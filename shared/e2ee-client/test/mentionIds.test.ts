import { describe, expect, it } from 'vitest'
import { as, CH, login, server, flowSetup } from './flowSuite'
import { mentionIdsOf } from '../src/mentionIds'
import { pureProvider } from '@kankaverse/e2ee-core'
import { beforeEach } from 'vitest'

describe('mentionIdsOf (E2 Rev.2 §4.2)', () => {
  it('token -> tekil kimlik listesi; rol token ve düz @ad girmez', () => {
    expect(mentionIdsOf('selam <@u1> ve <@u2> <@u1> @ayse <@&rol1>')).toEqual(['u1', 'u2'])
    expect(mentionIdsOf('hiç yok')).toEqual([])
  })

  it('en çok 20 kimlik', () => {
    const text = Array.from({ length: 30 }, (_, i) => `<@u${i}>`).join(' ')
    expect(mentionIdsOf(text)).toHaveLength(20)
  })
})

describe('şifreli gönderimde mentionUserIds', () => {
  beforeEach(() => flowSetup(pureProvider))

  it('encrypt yalnız token varsa listeyi taşır', async () => {
    server.makeGroup(CH, ['A', 'B', 'C'], '2026-11-10T09:00:00.000Z')
    const A1 = await login('A')
    await login('B')
    const withMention = await as(A1, (e) => e.encrypt(CH, 'merhaba <@B> <@C>'))
    expect(withMention!.mentionUserIds).toEqual(['B', 'C'])
    const without = await as(A1, (e) => e.encrypt(CH, 'merhaba'))
    expect('mentionUserIds' in without!).toBe(false)
  })
})
