// Uçtan uca kanıt (E1 adım 3): gerçek çekirdek (MLS) + web motoru + GERÇEK HTTP + GERÇEK soket.
// Yerel API `E2EE_ENABLED=true` ile çalışmalı. Çalıştırma:
//   VITE_API_URL=http://localhost:3001 npx vitest run --config vitest.e2e.config.ts
// Her "profil" ayrı bir tarayıcı gibidir (kendi IndexedDB'si, kendi oturumu, kendi soketi); aynı anda yalnız
// biri etkin olduğu için olaylar kuyruğa alınır ve sırası gelen profil `waitFor` ile tüketir.
import 'fake-indexeddb/auto'
import axios from 'axios'
import { IDBFactory } from 'fake-indexeddb'
import { io, type Socket } from 'socket.io-client'
import { afterAll, describe, expect, it } from 'vitest'
import { e2eeApi } from '@/api/e2ee'
import { messagesApi } from '@/api/messages'
import { E2eeEngine } from '@/lib/e2ee/engine'
import type { MessageDto } from '@/types'

const API = process.env.VITE_API_URL ?? 'http://localhost:3001'
const RUN = Date.now().toString(36)

// web/src/api/axios.ts access token'ı sessionStorage'dan okur: etkin profilin token'ını döndüren minimal taklit.
let activeToken = ''
;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: () => activeToken,
  setItem: () => undefined,
  removeItem: () => undefined,
}

interface Profile {
  name: string
  userId: string
  token: string
  idb: IDBFactory
  engine?: E2eeEngine
  socket?: Socket
  seen: { event: string; data: unknown }[]
  warnings: string[]
}

const profiles: Profile[] = []
const log = (m: string) => console.log(`[e2e] ${m}`)

async function as<T>(p: Profile, fn: () => Promise<T>): Promise<T> {
  globalThis.indexedDB = p.idb
  activeToken = p.token
  return fn()
}

async function authCall(path: string, body: object) {
  const res = await axios.post(`${API}${path}`, body)
  return res.data.data as {
    accessToken: string
    user: { id: string; username: string; friendCode: string }
  }
}

async function newProfile(name: string, data: { accessToken: string; user: { id: string } }) {
  const p: Profile = {
    name,
    userId: data.user.id,
    token: data.accessToken,
    idb: new IDBFactory(),
    seen: [],
    warnings: [],
  }
  profiles.push(p)
  p.socket = io(API, { auth: { token: p.token }, transports: ['websocket'] })
  for (const ev of ['e2ee:welcome', 'e2ee:commit', 'e2ee:devices-changed', 'message.created']) {
    p.socket.on(ev, (data) => p.seen.push({ event: ev, data }))
  }
  await new Promise<void>((resolve) => p.socket!.on('connect', () => resolve()))
  p.engine = (await as(p, () =>
    E2eeEngine.start(p.userId, e2eeApi, (c, k) => p.warnings.push(`${c}:${k}`)),
  ))!
  expect(p.engine).toBeTruthy()
  return p
}

/** Profilin soketine `event` gelene kadar bekler (daha önce gelip tüketilmemişse hemen). */
async function waitFor(p: Profile, event: string, ms = 8000): Promise<unknown> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const i = p.seen.findIndex((s) => s.event === event)
    if (i >= 0) return p.seen.splice(i, 1)[0].data
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`${p.name}: ${event} gelmedi`)
}

async function sendText(p: Profile, ch: string, text: string): Promise<MessageDto> {
  return as(p, async () => {
    const cipher = await p.engine!.encrypt(ch, text)
    expect(cipher).not.toBeNull()
    const { data } = await messagesApi.sendEncrypted(ch, cipher!)
    expect(data.encrypted).toBe(true)
    expect(data.content).toBe('') // sunucu düz metni hiç görmez
    await p.engine!.rememberSent(data)
    return data
  })
}

/** Sohbet geçmişini sunucudan çekip (yeniden eskiye) çözer; eskiden yeniye döner. */
async function view(
  p: Profile,
  ch: string,
): Promise<{ text: string; status?: string; id: string }[]> {
  return as(p, async () => {
    const { data } = await messagesApi.list(ch)
    const out = await p.engine!.hydrate(ch, [...data].reverse())
    return out.map((m) => ({ id: m.id, text: m.content, status: m.e2eeStatus }))
  })
}

afterAll(() => profiles.forEach((p) => p.socket?.close()))

describe('E1 web: iki istemci, gerçek HTTP + soket', () => {
  it('grup kurma, çözme, ikinci cihaz, çıkış ve cihaz çıkarma', async () => {
    const pw = 'Test1234!pass'
    const mk = (n: string) => ({
      username: `e2e_${n}_${RUN}`,
      email: `e2e_${n}_${RUN}@example.test`,
      password: pw,
      birthDate: '1995-05-15',
    })
    const aReg = await authCall('/auth/register', mk('a'))
    const bReg = await authCall('/auth/register', mk('b'))
    const A1 = await newProfile('A1', aReg)
    const B1 = await newProfile('B1', bReg)
    log(`kullanıcılar ${aReg.user.username}, ${bReg.user.username}; cihazlar kayıtlı`)

    // Arkadaşlık (DM kapısı), sonra DM kanalı (A başlatır)
    const auth = (p: Profile) => ({ headers: { Authorization: `Bearer ${p.token}` } })
    const fr = await axios.post(
      `${API}/friends/requests`,
      { friendCode: bReg.user.friendCode },
      auth(A1),
    )
    await axios.post(`${API}/friends/requests/${fr.data.data.id}/accept`, {}, auth(B1))
    const ch = (await axios.post(`${API}/dm/channels`, { userId: bReg.user.id }, auth(A1))).data
      .data.id as string
    for (const p of [A1, B1]) p.socket!.emit('channel:join', { channelId: ch })
    log(`DM kanalı ${ch}`)

    // 1) A ilk mesajda grubu kurar; B Welcome ile katılıp çözer
    const m1 = await sendText(A1, ch, 'merhaba B, bu şifreli 🔒')
    await waitFor(B1, 'e2ee:welcome')
    const joined = await as(B1, () => B1.engine!.onWelcome())
    expect(joined).toEqual([ch])
    const bView1 = await view(B1, ch)
    expect(bView1.map((m) => m.text)).toEqual(['merhaba B, bu şifreli 🔒'])
    log('A kurdu, B çözdü')

    // 2) B cevaplar, A çözer (kendi mesajı yerel depodan)
    const m2 = await sendText(B1, ch, 'selam A, aldım')
    const aView = await view(A1, ch)
    expect(aView.map((m) => m.text)).toEqual(['merhaba B, bu şifreli 🔒', 'selam A, aldım'])
    log('B cevapladı, A çözdü')

    // 3) Sunucu şifreli kanala düz mesajı reddeder
    const plain = await axios.post(
      `${API}/channels/${ch}/messages`,
      { content: 'düz' },
      { headers: { Authorization: `Bearer ${A1.token}` }, validateStatus: () => true },
    )
    expect(plain.status).toBe(409)
    expect(plain.data.error).toBe('E2EE_REQUIRED')
    log('düz mesaj 409 E2EE_REQUIRED')

    // 4) A'nın ikinci cihazı (yeni tarayıcı girişi): A1 ekler, A2 Welcome ile katılır, B commit'i işler
    const a2Login = await authCall('/auth/login', { identifier: aReg.user.username, password: pw })
    const A2 = await newProfile('A2', a2Login)
    A2.socket!.emit('channel:join', { channelId: ch })
    await waitFor(A1, 'e2ee:devices-changed')
    await as(A1, () => A1.engine!.onGroupChanged(ch))
    await waitFor(A2, 'e2ee:welcome')
    await as(A2, () => A2.engine!.onWelcome())
    await waitFor(B1, 'e2ee:commit')
    await as(B1, () => B1.engine!.onGroupChanged(ch))
    log('A2 eklendi (A1 commit gönderdi, A2 Welcome ile katıldı, B commit işledi)')

    // 5) Eski mesajlar A2'de "cihaz eklenmeden önce", yeni mesaj çözülür
    const m3 = await sendText(B1, ch, 'A2 görüyor musun')
    const a2View = await view(A2, ch)
    expect(a2View.map((m) => m.status)).toEqual(['undecryptable', 'undecryptable', 'ok'])
    expect(a2View[2].text).toBe('A2 görüyor musun')
    expect((await view(A1, ch)).at(-1)?.text).toBe('A2 görüyor musun')
    log('A2: eski iki mesaj cihaz eklenmeden önce, yenisi çözüldü')

    // 6) A2 yazar, B ve A1 çözer
    await sendText(A2, ch, 'A2 den selam')
    expect((await view(B1, ch)).at(-1)?.text).toBe('A2 den selam')
    expect((await view(A1, ch)).at(-1)?.text).toBe('A2 den selam')

    // 7) A2 çıkış yapar: cihaz iptal, A1 çıkarma commit'i gönderir, B işler
    await axios.post(`${API}/auth/logout`, {}, { headers: { Authorization: `Bearer ${A2.token}` } })
    await waitFor(A1, 'e2ee:devices-changed')
    await as(A1, () => A1.engine!.onGroupChanged(ch))
    await waitFor(B1, 'e2ee:commit')
    await as(B1, () => B1.engine!.onGroupChanged(ch))
    const state = await as(A1, () => e2eeApi.channelState(ch))
    const a2Device = state.data.members.flatMap((m) => m.devices).filter((d) => d.revokedAt)
    expect(a2Device).toHaveLength(1)
    log('A2 çıkış yaptı: cihaz iptal, gruptan çıkarıldı')

    // 8) Kalanlar yazışmaya devam eder; çıkarılan cihaz yeni mesajı çözemez ve API'ye giremez
    await sendText(B1, ch, 'A2 artık yok')
    expect((await view(A1, ch)).at(-1)?.text).toBe('A2 artık yok')
    const a2Call = await axios.get(`${API}/e2ee/devices/me`, {
      headers: { Authorization: `Bearer ${A2.token}` },
      validateStatus: () => true,
    })
    expect([401, 403]).toContain(a2Call.status)
    expect(A1.warnings).toEqual([])
    expect(B1.warnings).toEqual([])
    log(`çıkış sonrası A2 API durumu ${a2Call.status}; A1/B1 uyarı yok`)
    expect([m1.id, m2.id, m3.id].every(Boolean)).toBe(true)
  })
})
