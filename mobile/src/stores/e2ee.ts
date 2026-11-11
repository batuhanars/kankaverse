import { create } from 'zustand';
import type { ChannelInfo, E2eeEngine, SentCipher, WarningKind } from '@kankaverse/e2ee-client';
import { messagesApi, type MessageDto } from '@/api/messages';
import { startMobileEngine } from '@/e2ee/startEngine';
import { wipeMobileVaults } from '@/e2ee/sqliteRows';
import { useDmStore } from '@/stores/dm';
import { t } from '@/i18n';

/**
 * E1 mobil istemcinin tek girişi (web `stores/e2ee.ts` karşılığı). Motor (shared/e2ee-client) arayüzden
 * bağımsızdır; burası onu zustand'a ve mevcut mesaj akışına (iyimser gönderim, soket, liste) bağlar.
 * E2EE kapalıysa (bayrak/izin listesi) motor yoktur ve hiçbir şeyi değiştirmez: şifresiz mesajlar aynen geçer.
 */
interface E2eeState {
  engine: E2eeEngine | null;
  warnings: Record<string, WarningKind>;
  channels: Record<string, ChannelInfo>;
  /** Yeni düz metin depoya yazılınca artar; DM listesi önizlemesi buna bağlıdır (E3 Rev.5). */
  plainTick: number;
}

export const useE2eeStore = create<E2eeState>(() => ({ engine: null, warnings: {}, channels: {}, plainTick: 0 }));

const set = useE2eeStore.setState;
const get = useE2eeStore.getState;
let ready: Promise<void> = Promise.resolve();

const setWarning = (channelId: string, kind: WarningKind) =>
  set((s) => ({ warnings: { ...s.warnings, [channelId]: kind } }));

/**
 * E3 Rev.5: bir mesajın düz metni depoya yazıldı (soket çözmesi VEYA push yolundaki çevrimdışı çözme); liste
 * önizlemesi depodan yeniden okusun. Yalnız bir `setState`: zamanlayıcı yok, arka plan yolunda da güvenli.
 */
export const markDecrypted = () => set((s) => ({ plainTick: s.plainTick + 1 }));

/** Girişten sonra bir kez: durum → cihaz kaydı → KeyPackage → bekleyen Welcome'lar. */
export function initE2ee(userId: string): Promise<void> {
  if (get().engine?.userId === userId) return ready;
  ready = (async () => {
    try {
      const engine = await startMobileEngine(userId, setWarning);
      set({ engine });
      await engine?.onWelcome();
    } catch (e) {
      // İçerik yok: yalnız hata türü. Rastgelelik yoksa buraya düşer, E2EE başlamaz (§5).
      console.error('[E2EE] başlatılamadı', e instanceof Error ? e.name : '');
    }
  })();
  return ready;
}

/** Çıkış / yeni giriş / oturum düşüşü: bu cihazdaki TÜM şifreli yerel depolar silinir (E1 §5). */
export async function wipeE2ee(): Promise<void> {
  const current = get().engine;
  set({ engine: null, channels: {}, warnings: {} });
  ready = Promise.resolve();
  try {
    await current?.destroy();
    await wipeMobileVaults();
  } catch (e) {
    console.error('[E2EE] yerel depo silinemedi', e instanceof Error ? e.name : '');
  }
}

/** Yalnız 1-1 DM şifrelenir (E1 kapsamı); liste yüklü değilse (soğuk açılış, bildirim) önce yüklenir. */
async function isOneToOneDm(channelId: string): Promise<boolean> {
  const dm = useDmStore.getState();
  if (dm.channels.length === 0) await dm.fetchAll().catch(() => undefined);
  return useDmStore.getState().channels.some((c) => c.id === channelId && c.type === 'DM');
}

export async function openE2eeChannel(channelId: string): Promise<void> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isOneToOneDm(channelId))) return;
  try {
    const info = await engine.open(channelId);
    set((s) => ({ channels: { ...s.channels, [channelId]: info } }));
  } catch (e) {
    console.error('[E2EE] kanal açılamadı', e instanceof Error ? e.name : '');
  }
}

/** Mesajlar çözüldükten sonra: eksik commit'leri işle, üyelik farkını kapat (yerel grup yoksa no-op). */
export async function syncE2eeChannel(channelId: string): Promise<void> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isOneToOneDm(channelId))) return;
  await engine.onGroupChanged(channelId).catch((e) => console.error('[E2EE] senkron', e instanceof Error ? e.name : ''));
}

/** Şifreli mesaj çözülemiyorsa (motor yok/hata) baloncuk "çözülemedi" durumu göstersin, boş balon değil. */
const undecryptable = (m: MessageDto): MessageDto =>
  m.encrypted ? { ...m, content: '', ciphertext: undefined, e2eeStatus: 'undecryptable' } : m;

/** Yanıt alıntısı şifreli mesaja aitse (sunucu içeriği boş) düz metni yerel depodan getirir. */
async function fillQuote(m: MessageDto): Promise<MessageDto> {
  const r = m.replyTo;
  const engine = get().engine;
  if (!r || r.content !== '' || r.attachment || !engine) return m;
  const text = await engine.quoteText(r.id);
  return { ...m, replyTo: text === null ? { ...r, e2eeUnknown: true } : { ...r, content: text } };
}

/** `asc` eskiden yeniye. Şifresiz liste aynen geçer; şifreliler çözülür, iptal cihazdan gelenler elenir. */
export async function hydrateMessages(channelId: string, asc: MessageDto[]): Promise<MessageDto[]> {
  await ready;
  if (!asc.some((m) => m.encrypted)) return Promise.all(asc.map(fillQuote));
  const engine = get().engine;
  const out = engine
    ? await engine.hydrate(channelId, asc).catch(() => asc.map(undecryptable))
    : asc.map(undecryptable);
  return Promise.all(out.map(fillQuote));
}

/**
 * E3 §4.2 (D92): sabitlenen şifreli mesajlar YALNIZ yerel depodan doldurulur (`hydrateMessages` değil: sabitlenen
 * mesaj çok eski olabilir, geriye doğru çözme yürüyüşü tetiklenmemeli). Depoda yoksa genel "Şifreli mesaj".
 */
export async function fillPinsFromStore(pins: MessageDto[]): Promise<MessageDto[]> {
  if (!pins.some((m) => m.encrypted)) return pins;
  await ready;
  const engine = get().engine;
  return Promise.all(
    pins.map(async (m) => {
      if (!m.encrypted) return m;
      const text = engine ? await engine.quoteText(m.id).catch(() => null) : null;
      return { ...m, content: text ?? t('e2ee.encryptedQuote'), ciphertext: undefined };
    }),
  );
}

/** Tek mesaj (soket/HTTP yankısı). İptal cihazdan gelen mesaj elenir (null). */
export async function hydrateOne(m: MessageDto): Promise<MessageDto | null> {
  return (await hydrateMessages(m.channelId, [m]))[0] ?? null;
}

/**
 * E3 Rev.5 (ön plan): `dm.message` soketindeki şifreli yükü UI motoruyla çözer (tek çözme kuralı motorda:
 * depoda varsa okunur; push yolu aynı kuyruktan geçer, iki kez çözülmez). Motor yoksa hiçbir şey yapılmaz.
 */
export async function decryptDmLastMessage(
  channelId: string,
  last: { id?: string; createdAt: string; e2ee?: { ciphertext: string; senderDeviceId: string; createdAt: string } },
  senderId: string,
): Promise<void> {
  const { id, e2ee } = last;
  if (!id || !e2ee || !get().engine) return;
  const m = await hydrateOne({
    id,
    channelId,
    content: '',
    encrypted: true,
    ciphertext: e2ee.ciphertext,
    senderDeviceId: e2ee.senderDeviceId,
    replyToId: null,
    author: { id: senderId, username: '', avatarUrl: null },
    createdAt: e2ee.createdAt,
    editedAt: null,
    pinnedAt: null,
  } as MessageDto);
  if (m?.e2eeStatus === 'ok') markDecrypted();
}

/** Sayfa (yeniden eskiye) için çözme; sayfa eskiden yeniye çözülür (MLS sırası, bkz. motor). */
export async function hydratePage(
  channelId: string,
  descPage: MessageDto[],
  loadOlder: (beforeId: string) => Promise<MessageDto[]>,
): Promise<MessageDto[]> {
  await ready;
  const engine = get().engine;
  if (!engine || !descPage.some((m) => m.encrypted)) {
    return [...(await hydrateMessages(channelId, [...descPage].reverse()))].reverse();
  }
  try {
    const out = await engine.hydrateHistory(channelId, descPage, loadOlder);
    return Promise.all(out.map(fillQuote));
  } catch {
    return descPage.map(undecryptable);
  }
}

/** Gönderim öncesi: şifreli yük, ya da `null` (şifresiz DM / E2EE kapalı: çağıran düz gönderir). */
async function prepareSend(channelId: string, text: string): Promise<SentCipher | null> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isOneToOneDm(channelId))) return null;
  return engine.encrypt(channelId, text);
}

/** Sunucu şifreli mesajı kabul etti: düz metni yerele yaz, ekran için çözülmüş halini döndür. */
async function afterSend(data: MessageDto): Promise<MessageDto | null> {
  if (!data.encrypted) return data;
  await get().engine?.rememberSent(data);
  if (!get().channels[data.channelId]?.encrypted) void openE2eeChannel(data.channelId); // ayraç zamanı
  return hydrateOne(data);
}

/**
 * Bir kanala mesaj gönderir: şifreli DM ise şifreler, değilse bugünkü düz yol. Tüm DM gönderim noktaları
 * buradan geçer ki hiçbiri şifreli kanala düz içerik göndermeye kalkmasın. Dönen mesaj ekranda gösterilecek
 * (çözülmüş) halidir. Metin şifrelenir; ekler (medya) düz kalır (E1 §0).
 */
export async function sendMessage(
  channelId: string,
  text: string,
  replyToId?: string,
  attachmentIds?: string[],
  nonce?: string,
): Promise<MessageDto> {
  const cipher = await prepareSend(channelId, text);
  const data = cipher
    ? await messagesApi.sendEncrypted(channelId, cipher, replyToId, nonce, attachmentIds)
    : await messagesApi.send(channelId, text, replyToId, attachmentIds, nonce);
  return (await afterSend(data)) ?? data;
}

/** Şifreli mesajı düzenle (PATCH ciphertext). */
export async function editEncryptedMessage(
  channelId: string,
  messageId: string,
  text: string,
): Promise<MessageDto | null> {
  await ready;
  const cipher = await get().engine?.encrypt(channelId, text);
  if (!cipher) throw new Error('Şifreli düzenleme için grup yok');
  return afterSend(await messagesApi.editEncrypted(channelId, messageId, cipher));
}
