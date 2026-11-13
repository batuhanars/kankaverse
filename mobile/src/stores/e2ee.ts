import { create } from 'zustand';
import type { ChannelInfo, E2eeEngine, EvidenceItem, SentCipher, WarningKind } from '@kankaverse/e2ee-client';
import { messagesApi, type MessageDto } from '@/api/messages';
import { startMobileEngine } from '@/e2ee/startEngine';
import { dropOtherMobileVaults, wipeMobileVaults } from '@/e2ee/sqliteRows';
import { useDmStore } from '@/stores/dm';
import { isDepartedGroup } from '@/e2ee/departed';
import { clearDeviceNotices, loadDeviceNotices } from '@/stores/e2eeNotices';
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

const setWarning = (channelId: string, kind: WarningKind | null) =>
  set((s) => {
    const { [channelId]: _gone, ...rest } = s.warnings;
    return { warnings: kind === null ? rest : { ...s.warnings, [channelId]: kind } };
  });

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

/**
 * C69 korunan çıkış / oturum düşüşü: motor bellekten düşer (yedek/aktarım zamanlayıcıları durur), yerel sqlite
 * deposu ve SecureStore anahtarı KALIR. Sonraki girişte aynı kullanıcı için `initE2ee` depoyu açar ve park
 * edilmiş cihazı imzayla yeniden bağlar (reddedilirse motor kendisi siler).
 */
export function releaseE2ee(): void {
  const current = get().engine;
  set({ engine: null, channels: {}, warnings: {} });
  clearDeviceNotices();
  ready = Promise.resolve();
  current?.release();
}

/** C69 giriş: yerel depo BAŞKA kullanıcıya aitse silinir; aynı kullanıcınınki kalır. Depo kullanıcı başınadır (`user_id`). */
export async function dropOtherE2eeUsers(userId: string): Promise<void> {
  try {
    await dropOtherMobileVaults(userId);
  } catch (e) {
    console.error('[E2EE] başka hesabın deposu silinemedi', e instanceof Error ? e.name : '');
  }
}

/** Hesap silme: bu cihazdaki TÜM şifreli yerel depolar silinir (E1 §5). */
export async function wipeE2ee(): Promise<void> {
  const current = get().engine;
  set({ engine: null, channels: {}, warnings: {} });
  clearDeviceNotices();
  ready = Promise.resolve();
  try {
    await current?.destroy();
    await wipeMobileVaults();
  } catch (e) {
    console.error('[E2EE] yerel depo silinemedi', e instanceof Error ? e.name : '');
  }
}

/** Şifrelenebilen sohbet: 1-1 DM ya da grup DM (E2 §3.1); liste yüklü değilse (soğuk açılış, bildirim) önce yüklenir. */
async function isEncryptableDm(channelId: string): Promise<boolean> {
  const dm = useDmStore.getState();
  if (dm.channels.length === 0) await dm.fetchAll().catch(() => undefined);
  return useDmStore.getState().channels.some((c) => c.id === channelId && (c.type === 'DM' || c.type === 'GROUP_DM'));
}

/** C62: gruptan ayrılmış/çıkarılmış sohbet. Motor orada Welcome/senkron/açma ağ çağrısı yapmaz (üyelik yok,
 *  sunucu reddeder ve "çıkarıldı" uyarısı üretirdi); çözme yalnız yerel depodan çalışır. */
const isDeparted = (channelId: string): boolean => isDepartedGroup(useDmStore.getState().channels, channelId);

export async function openE2eeChannel(channelId: string): Promise<void> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isEncryptableDm(channelId)) || isDeparted(channelId)) return;
  try {
    const info = await engine.open(channelId);
    set((s) => ({ channels: { ...s.channels, [channelId]: info } }));
  } catch (e) {
    console.error('[E2EE] kanal açılamadı', e instanceof Error ? e.name : '');
  }
  void loadDeviceNotices(channelId); // E2 §3.3: yerel depodan "yeni cihaz eklendi" satırları (web açılış davranışı)
}

/** Mesajlar çözüldükten sonra: eksik commit'leri işle, üyelik farkını kapat (yerel grup yoksa no-op). */
export async function syncE2eeChannel(channelId: string): Promise<void> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isEncryptableDm(channelId)) || isDeparted(channelId)) return;
  await engine.onGroupChanged(channelId).catch((e) => console.error('[E2EE] senkron', e instanceof Error ? e.name : ''));
  await loadDeviceNotices(channelId); // commit "yeni cihaz eklendi" satırı üretmiş olabilir (E2 §3.3)
}

/**
 * E5a §4.1 silme boşluğu: şifreli DM mesajı silinince yerel düz kaydı da silinir (yedekte yaşamasın).
 * Tek giriş: soket `message.deleted` ve yerel silme aynı yerden geçer. Şifreli DM değilse hiçbir şey yapmaz.
 */
export async function forgetE2eeMessage(channelId: string, messageId: string): Promise<void> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isEncryptableDm(channelId))) return;
  await engine
    .forgetMessage(messageId)
    .catch((e) => console.error('[E2EE] yerel kayıt silinemedi', e instanceof Error ? e.name : ''));
}

/** Şifreli mesaj çözülemiyorsa (motor yok/hata) baloncuk "çözülemedi" durumu göstersin, boş balon değil. */
const undecryptable = (m: MessageDto): MessageDto =>
  m.encrypted ? { ...m, content: '', ciphertext: undefined, e2eeStatus: 'undecryptable' } : m;

/** Yanıt alıntısı şifreli mesaja aitse (sunucu içeriği boş) düz metni yerel depodan getirir. */
async function fillQuote(m: MessageDto): Promise<MessageDto> {
  const r = m.replyTo;
  const engine = get().engine;
  if (!r || r.content !== '' || r.attachment || r.editedAfterLeave || !engine) return m;
  const text = await engine.quoteText(r.id);
  // C68: yalnız ek içeren mesajın çözülmüş gövdesi boş; boş alıntı yerine genel alıntı metni.
  return { ...m, replyTo: !text?.trim() ? { ...r, e2eeUnknown: true } : { ...r, content: text } };
}

/** C62: ayrıldıktan sonra düzenlenen mesajın içeriği sunucuda boşaltıldı; motorun etiketi ya da yerel depodan
 *  doldurduğu metin gösterilmez (balon `editedAfterLeave` notunu çizer). */
const keepEditedAfterLeaveEmpty = (m: MessageDto): MessageDto =>
  m.editedAfterLeave ? { ...m, content: '', e2eeStatus: undefined } : m;

/** `asc` eskiden yeniye. Şifresiz liste aynen geçer; şifreliler çözülür, iptal cihazdan gelenler elenir. */
export async function hydrateMessages(channelId: string, asc: MessageDto[]): Promise<MessageDto[]> {
  await ready;
  if (!asc.some((m) => m.encrypted)) return Promise.all(asc.map(fillQuote));
  const engine = get().engine;
  const out = engine
    ? await engine.hydrate(channelId, asc, { localOnly: isDeparted(channelId) }).catch(() => asc.map(undecryptable))
    : asc.map(undecryptable);
  return Promise.all(out.map(keepEditedAfterLeaveEmpty).map(fillQuote));
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
  last: { id?: string; createdAt: string; e2ee?: { ciphertext: string; senderDeviceId: string; createdAt: string; frankingTag?: string } },
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
    frankingTag: e2ee.frankingTag,
    replyToId: null,
    author: { id: senderId, username: '', avatarUrl: null },
    createdAt: e2ee.createdAt,
    editedAt: null,
    pinnedAt: null,
  } as MessageDto);
  if (m?.e2eeStatus === 'ok') markDecrypted();
}

/**
 * DM listesi önizlemesi (2026-11-12 sahip bulgusu): uygulama kapalıyken gelen şifreli son mesaj yerel depoda
 * yok, liste "Şifreli mesaj" gösteriyordu ve sohbete girip çıkınca düzeliyordu. Sohbet açılışıyla AYNI yol
 * (Welcome'lar → son sayfa → MLS sırasıyla çözme → commit senkronu) arka planda çalışır; düz metin depoya
 * yazılınca önizleme `plainTick` ile yeniden okunur. Motor kilidi çözmeleri sıraya koyar, sohbet ekranıyla
 * çakışmaz. Mesaj listesi ucu okundu işaretlemez.
 */
export async function prefetchDmPreview(channelId: string): Promise<MessageDto[]> {
  await ready;
  if (!get().engine) return [];
  await openE2eeChannel(channelId);
  const raw = await messagesApi.list(channelId);
  const out = await hydratePage(channelId, raw, (before) => messagesApi.list(channelId, before));
  void syncE2eeChannel(channelId);
  if (out.some((m) => m.e2eeStatus === 'ok')) markDecrypted();
  return out; // E5b Parça C: çağıran son mesajın cihaz öncesi olup olmadığını görür
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
    // C62: eski grupta yalnız yerel depo (kanal durumu eski üyeye 403; aksi hâlde tüm sayfa gizlenirdi).
    const out = await engine.hydrateHistory(channelId, descPage, loadOlder, { localOnly: isDeparted(channelId) });
    return Promise.all(out.map(keepEditedAfterLeaveEmpty).map(fillQuote));
  } catch {
    return descPage.map(undecryptable).map(keepEditedAfterLeaveEmpty);
  }
}

/** Gönderim öncesi: şifreli yük, ya da `null` (şifresiz DM / E2EE kapalı: çağıran düz gönderir). */
async function prepareSend(channelId: string, text: string): Promise<SentCipher | null> {
  await ready;
  const engine = get().engine;
  if (!engine || !(await isEncryptableDm(channelId))) return null;
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

/**
 * E4 sikayet kaniti (web `stores/e2ee.ts` `collectEvidence` karsiligi): hedef + onceki mesajlardan yerelde cozulmus
 * (`ok`) olanlar. `older` ekrandaki listedir (hedeften oncekiler). Motor yok: bos dizi, sikayet yalniz referansla gider.
 */
export async function collectEvidence(
  channelId: string,
  targetId: string,
  older: Pick<MessageDto, 'id' | 'createdAt'>[],
): Promise<EvidenceItem[]> {
  await ready;
  const engine = get().engine;
  if (!engine) return [];
  return engine.collectEvidence(channelId, targetId, older);
}
