import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { e2eeApi } from '@/api/e2ee'
import { messagesApi } from '@/api/messages'
import { useDmStore } from '@/stores/dm'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import { useE2eeNoticesStore } from '@/stores/e2eeNotices'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import type {
  ChannelInfo,
  E2eeEngine,
  EvidenceItem,
  SentCipher,
  WarningKind,
} from '@kankaverse/e2ee-client'
import { startWebEngine } from '@/lib/e2ee/adapter'
import { destroyAllVaults } from '@/lib/e2ee/vault'
import type { MessageDto } from '@/types'

/** `dm.message` soketindeki şifreli yük (api `e2eePushField`, E3 Rev.5). */
export type SocketE2ee = {
  ciphertext: string
  senderDeviceId: string
  createdAt: string
  frankingTag?: string // E4: v2 yükün taahhüdü
}

/**
 * E1 web istemcisi için tek giriş. Motor (lib/e2ee) arayüzden bağımsızdır; burası onu Pinia'ya ve
 * mevcut mesaj akışına (iyimser gönderim, soket, liste) bağlar. E2EE kapalıysa (bayrak/izin listesi) motor
 * yoktur ve hiçbir şeyi değiştirmez: şifresiz mesajlar olduğu gibi geçer.
 */
export const useE2eeStore = defineStore('e2ee', () => {
  const engine = shallowRef<E2eeEngine | null>(null)
  const warnings = ref<Record<string, WarningKind>>({})
  const channels = ref<Record<string, ChannelInfo>>({})
  /** Her yeni düz metin depoya yazıldığında artar; liste önizlemesi buna bağlıdır (E3 Rev.5). */
  const plainTick = ref(0)
  let ready: Promise<void> = Promise.resolve()

  const setWarning = (channelId: string, kind: WarningKind | null) => {
    if (kind === null) delete warnings.value[channelId]
    else warnings.value[channelId] = kind
  }

  /** Girişten sonra bir kez: durum → cihaz kaydı → KeyPackage → bekleyen Welcome'lar. */
  function init(userId: string): Promise<void> {
    if (engine.value?.userId === userId) return ready
    ready = (async () => {
      try {
        engine.value = await startWebEngine(userId, e2eeApi, setWarning)
        await engine.value?.onWelcome()
        // E5a §4.3: yedek bayrağı açıksa zamanlayıcı başlar (bayrak yoksa `start` hiçbir şey yapmaz).
        if (engine.value) void useE2eeBackupStore().start(engine.value)
        // E5b: uygulama kapalıyken açılan aktarım isteği (soket olayı kaçtı) açılışta sorulur.
        if (engine.value?.transfer) void useE2eeTransferStore().checkPending()
      } catch (e) {
        console.error('[e2ee] başlatılamadı', e)
      }
    })()
    return ready
  }

  /** Çıkış / yeni giriş / hesap silme: bu tarayıcıdaki TÜM şifreli yerel depolar silinir. */
  async function wipe(): Promise<void> {
    const current = engine.value
    useE2eeBackupStore().stop()
    useE2eeNoticesStore().clear()
    engine.value = null
    channels.value = {}
    warnings.value = {}
    ready = Promise.resolve()
    try {
      await current?.destroy()
      await destroyAllVaults()
    } catch (e) {
      console.error('[e2ee] yerel depo silinemedi', e)
    }
  }

  /** Şifrelenebilen sohbet: 1-1 DM ya da grup DM (E2 §3.1). Ortam kanalları şifrelenmez. */
  // C62: ayrıldığım/çıkarıldığım grup şifrelenebilir sayılmaz → Welcome/senkron tetiklenmez, mesajlar yalnız yerel depodan okunur.
  const isEncryptableDm = (channelId: string) =>
    useDmStore().channels.some(
      (c) => c.id === channelId && (c.type === 'DM' || (c.type === 'GROUP_DM' && !c.departed)),
    )

  /** C62: eski grupta çözme yalnız yerel depodan; kanal durumu istenmez (eski üyeye 403, tüm sayfa gizlenirdi). */
  const hydrateOpts = (channelId: string) => ({
    localOnly: useDmStore().channels.some(
      (c) => c.id === channelId && c.type === 'GROUP_DM' && !!c.departed,
    ),
  })

  async function openChannel(channelId: string): Promise<void> {
    await ready
    if (!engine.value || !isEncryptableDm(channelId)) return
    try {
      channels.value[channelId] = await engine.value.open(channelId)
    } catch (e) {
      console.error('[e2ee] kanal açılamadı', e)
    }
  }

  /** Mesajlar çözüldükten sonra: eksik commit'leri işle, üyelik farkını kapat (yerel grup yoksa no-op). */
  async function syncChannel(channelId: string): Promise<void> {
    await ready
    if (!engine.value || !isEncryptableDm(channelId)) return
    await engine.value.onGroupChanged(channelId).catch((e) => console.error('[e2ee] senkron', e))
    await useE2eeNoticesStore().load(channelId) // commit "yeni cihaz eklendi" satırı üretmiş olabilir (E2 §3.3)
  }

  /** Şifreli mesaj çözülemiyorsa (motor yok/hata) ekranda "çözülemedi" durumu çıksın, boş balon değil. */
  const undecryptable = (m: MessageDto): MessageDto =>
    m.encrypted ? { ...m, content: '', ciphertext: undefined, e2eeStatus: 'undecryptable' } : m

  /** Yanıt alıntısı şifreli mesaja aitse (sunucu içeriği boş) düz metni yerel depodan getirir. */
  async function fillQuote(m: MessageDto): Promise<MessageDto> {
    const r = m.replyTo
    if (!r || r.editedAfterLeave || r.content !== '' || r.attachment || !engine.value) return m
    const text = await engine.value.quoteText(r.id)
    return { ...m, replyTo: text === null ? { ...r, e2eeUnknown: true } : { ...r, content: text } }
  }

  /** Liste önizlemesi / sabitlenenler: YALNIZ depo okuması (çözme yok); yoksa null. */
  async function plainText(messageId: string): Promise<string | null> {
    await ready
    return (await engine.value?.quoteText(messageId).catch(() => null)) ?? null
  }

  async function hydrate(channelId: string, asc: MessageDto[]): Promise<MessageDto[]> {
    await ready
    if (!asc.some((m) => m.encrypted)) return Promise.all(asc.map(fillQuote))
    const out = engine.value
      ? await engine.value
          .hydrate(channelId, asc, hydrateOpts(channelId))
          .catch(() => asc.map(undecryptable))
      : asc.map(undecryptable)
    return Promise.all(out.map(fillQuote))
  }

  /** Tek mesaj (soket/HTTP yankısı). İptal cihazdan gelen mesaj elenir (null). */
  async function hydrateOne(m: MessageDto): Promise<MessageDto | null> {
    return (await hydrate(m.channelId, [m]))[0] ?? null
  }

  /**
   * E3 Rev.5 — `dm.message` soketindeki şifreli yükü (sohbet açık olmasa da) motorla çözer; tek çözme kuralı
   * motordadır (depoda varsa okunur). Motor yoksa BEKLEMEDEN `none` (genel metin kalır). Başarıda
   * `plainTick` artar, liste önizlemesi depodan okur. `hidden`: iptal cihazdan, bildirim de atılmaz.
   */
  async function resolveSocketPreview(
    channelId: string,
    last: { id: string; createdAt: string; e2ee: SocketE2ee },
    senderId: string,
  ): Promise<{ kind: 'text'; text: string } | { kind: 'hidden' } | { kind: 'none' }> {
    if (!engine.value) return { kind: 'none' }
    const wire: MessageDto = {
      id: last.id,
      channelId,
      content: '',
      encrypted: true,
      ciphertext: last.e2ee.ciphertext,
      senderDeviceId: last.e2ee.senderDeviceId,
      frankingTag: last.e2ee.frankingTag,
      replyToId: null,
      author: { id: senderId, username: '', avatarUrl: null },
      createdAt: last.e2ee.createdAt,
      editedAt: null,
      pinnedAt: null,
    }
    const m = await hydrateOne(wire)
    if (!m) return { kind: 'hidden' }
    if (m.e2eeStatus !== 'ok' || !m.content) return { kind: 'none' }
    plainTick.value++
    return { kind: 'text', text: m.content }
  }

  async function hydrateHistory(
    channelId: string,
    descPage: MessageDto[],
    loadOlder: (beforeId: string) => Promise<MessageDto[]>,
  ): Promise<MessageDto[]> {
    await ready
    if (!engine.value || !descPage.some((m) => m.encrypted)) {
      return [...(await hydrate(channelId, [...descPage].reverse()))].reverse()
    }
    try {
      const out = await engine.value.hydrateHistory(
        channelId,
        descPage,
        loadOlder,
        hydrateOpts(channelId),
      )
      return Promise.all(out.map(fillQuote))
    } catch {
      return descPage.map(undecryptable)
    }
  }

  /**
   * DM listesi önizlemesi (2026-11-12 sahip bulgusu): uygulama kapalıyken gelen şifreli son mesaj yerel depoda
   * yok, liste "Şifreli mesaj" gösteriyordu, sohbete girip çıkınca düzeliyordu. Sohbet açılışıyla AYNI yol
   * (Welcome'lar → son sayfa → MLS sırasıyla çözme → commit senkronu) arka planda çalışır; düz metin depoya
   * yazılınca `plainTick` artar ve önizleme depodan okunur. Motor kilidi çözmeleri sıraya koyar.
   * Mesaj listesi ucu okundu işaretlemez.
   */
  async function prefetchPreview(channelId: string): Promise<MessageDto[]> {
    await ready
    if (!engine.value) return []
    await openChannel(channelId)
    const { data } = await messagesApi.list(channelId)
    const out = await hydrateHistory(
      channelId,
      data,
      async (before) => (await messagesApi.list(channelId, before)).data,
    )
    void syncChannel(channelId)
    if (out.some((m) => m.e2eeStatus === 'ok')) plainTick.value++
    return out // E5b Parça C: çağıran son mesajın cihaz öncesi olup olmadığını görür
  }

  /** Gönderim öncesi: şifreli yük, ya da `null` (şifresiz DM / E2EE kapalı: çağıran düz gönderir). */
  async function prepareSend(channelId: string, text: string): Promise<SentCipher | null> {
    await ready
    if (!engine.value || !isEncryptableDm(channelId)) return null
    return engine.value.encrypt(channelId, text)
  }

  /** Sunucu şifreli mesajı kabul etti: düz metni yerele yaz, ekran için çözülmüş hali döndür. */
  async function afterSend(data: MessageDto): Promise<MessageDto | null> {
    if (!data.encrypted) return data
    await engine.value?.rememberSent(data)
    if (!channels.value[data.channelId]?.encrypted) void openChannel(data.channelId) // ayraç zamanı
    return hydrateOne(data)
  }

  /**
   * DM'e (ya da herhangi bir kanala) mesaj gönderir: şifreli DM ise şifreler, değilse bugünkü düz yol.
   * Tüm DM gönderim noktaları buradan geçer ki hiçbiri şifreli kanala düz içerik göndermeye kalkmasın.
   * Dönen mesaj ekranda gösterilecek (çözülmüş) halidir.
   */
  async function send(
    channelId: string,
    text: string,
    replyToId?: string,
    attachmentIds?: string[],
    nonce?: string,
  ): Promise<MessageDto> {
    const cipher = await prepareSend(channelId, text)
    const { data } = cipher
      ? await messagesApi.sendEncrypted(channelId, cipher, replyToId, nonce, attachmentIds)
      : await messagesApi.send(channelId, text, replyToId, attachmentIds, nonce)
    return (await afterSend(data)) ?? data
  }

  /** Şifreli mesajı düzenle (PATCH ciphertext). */
  async function editEncrypted(
    channelId: string,
    messageId: string,
    text: string,
  ): Promise<MessageDto | null> {
    await ready
    const cipher = await engine.value?.encrypt(channelId, text)
    if (!cipher) throw new Error('Şifreli düzenleme için grup yok')
    const { data } = await messagesApi.editEncrypted(channelId, messageId, cipher)
    return afterSend(data)
  }

  /**
   * E5a §4.1 silme boşluğu: şifreli DM mesajı silinince yerel düz kaydı da silinir (yedekte yaşamasın).
   * Tek giriş: soket `message.deleted` ve yerel silme aynı yerden geçer. Şifreli DM değilse hiçbir şey yapmaz.
   */
  async function forgetMessage(channelId: string, messageId: string): Promise<void> {
    await ready
    if (!engine.value || !isEncryptableDm(channelId)) return
    await engine.value
      .forgetMessage(messageId)
      .catch((e) => console.error('[e2ee] yerel kayıt silinemedi', e))
  }

  /**
   * E4 şikâyet kanıtı: hedef + önceki mesajlardan yerelde çözülmüş (`ok`) olanlar. `older` ekrandaki listedir
   * (hedeften öncekiler). Motor yok / şifreli değil: boş dizi, şikâyet yalnız referansla gider.
   */
  async function collectEvidence(
    channelId: string,
    targetId: string,
    older: MessageDto[],
  ): Promise<EvidenceItem[]> {
    await ready
    if (!engine.value) return []
    return engine.value.collectEvidence(channelId, targetId, older)
  }

  return {
    engine,
    warnings,
    channels,
    init,
    wipe,
    openChannel,
    syncChannel,
    plainTick,
    plainText,
    prefetchPreview,
    resolveSocketPreview,
    hydrate,
    hydrateOne,
    hydrateHistory,
    send,
    editEncrypted,
    collectEvidence,
    forgetMessage,
  }
})
