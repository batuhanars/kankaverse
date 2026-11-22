import {
  EncryptionEvent,
  ParticipantEvent,
  RoomEvent,
  type LocalTrackPublication,
  type Room,
  type RoomOptions,
  type Track,
} from 'livekit-client';
import { RNE2EEManager, RNKeyProvider } from '@livekit/react-native';
import {
  RTCFrameCryptorAlgorithm,
  RTCFrameCryptorFactory,
  RTCFrameCryptorState,
  type RTCFrameCryptor,
  type RTCRtpSender,
} from '@livekit/react-native-webrtc';
import { CallKeyUnavailableError, toB64 } from '@kankaverse/e2ee-client';
import { callKeyFor } from '@/stores/e2ee';

/**
 * E8 — DM aramalarında kare şifrelemesi, mobil (sözleşme §4, §5.2). Web'deki `web/src/utils/callE2ee.ts`'in eşi.
 * 🔴 R7: anahtarın odaya verildiği yer.
 *
 * Web'den farkı: tarayıcıda şifreleme bir Web Worker'da JS ile yapılır; burada native WebRTC'nin içindeki
 * "frame cryptor" yapar (C++). JS yalnız anahtarı native'e verir, kareler JS'e hiç uğramaz.
 *
 * Anahtar METİN verilir → native PBKDF2 (web'in metin yoluyla aynı). Tek yuva (indeks 0): `RNE2EEManager`
 * şifreleyicinin indeksini yalnız kurulurken okur ve paylaşılan anahtar modunda hep 0'dır.
 */

/** Aramaya şifreli katılınamıyor; `i18nKey` kullanıcıya gösterilecek metin (sözleşme §6). */
export class CallE2eeError extends Error {
  readonly i18nKey: string;

  constructor(i18nKey: string) {
    super(i18nKey);
    this.name = 'CallE2eeError';
    this.i18nKey = i18nKey;
  }
}

/** Sunucunun 426 kodu: arama şifreli, istemci yeteneğini bildirmedi (mobilde yalnız eski sürümde olur). */
export const CALL_E2EE_UPDATE_REQUIRED = 'CALL_E2EE_UPDATE_REQUIRED';

/** Native şifreleyicinin çözme hatası sayılan durumları (B2). */
const FAILED_STATES = new Set([
  RTCFrameCryptorState.FrameCryptorStateDecryptionFailed,
  RTCFrameCryptorState.FrameCryptorStateMissingKey,
  RTCFrameCryptorState.FrameCryptorStateInternalError,
]);

/**
 * `RNE2EEManager` + iki düzeltme (adım 0 bulguları):
 *
 * B1 🔴 — kütüphane gönderici şifreleyiciyi `LocalTrackPublished`te takıyor; iz o andan önce yayına başlıyor
 * ve ilk kareler ŞİFRESİZ gidiyordu. Burada şifreleyici gönderici oluştuğu an (`LocalSenderCreated`,
 * müzakereden ÖNCE) takılır; livekit-client'ın web yöneticisi de aynı olayı kullanır. Yayın olayı gelince
 * şifreleyici kütüphanenin haritasına konur: kütüphane "zaten var" görüp ikincisini kurmaz, iz kapanınca
 * kendi temizliği onu da kapatır.
 *
 * B2 — kütüphane native şifreleyicinin durum olayını dinlemiyor; çözme hatası JS'e hiç gelmiyordu. Alıcı
 * şifreleyicilerin durumu dinlenir, hata `EncryptionError` olarak yayınlanır; Room bunu
 * `RoomEvent.EncryptionError` olarak iletir (web ile aynı yol).
 */
class CallE2EEManager extends RNE2EEManager {
  private readonly provider: RNKeyProvider;
  /** Gönderici oluştu ama yayın olayı henüz gelmedi: iz → şifreleyici. */
  private readonly early = new Map<Track, RTCFrameCryptor>();
  /** Anahtar yenilemede odadaki kimlikler için (setup'ta kurulur). */
  private callRoom: Room | null = null;

  constructor(provider: RNKeyProvider) {
    super(provider);
    this.provider = provider;
  }

  /** Odadaki kimlikler: kendimiz + uzak katılımcılar (anahtar yenilemede her birinin yuvası yazılır). */
  identities(): string[] {
    const room = this.callRoom;
    if (!room) return [];
    return [room.localParticipant.identity, ...Array.from(room.remoteParticipants.keys())].filter(Boolean);
  }

  override setup(room: Room): void {
    this.callRoom = room;
    // Sıra önemli: bu dinleyiciler kütüphanenin kendi `LocalTrackPublished` dinleyicisinden ÖNCE kayıtlı olmalı.
    room.localParticipant
      .on(ParticipantEvent.LocalSenderCreated, (sender, track) => {
        if (!room.localParticipant.isE2EEEnabled || this.early.has(track)) return;
        const cryptor = RTCFrameCryptorFactory.createFrameCryptorForRtpSender(
          room.localParticipant.identity,
          // Olay tipi tarayıcı `RTCRtpSender`ı der; RN'de gelen nesne native sender'dır.
          sender as unknown as RTCRtpSender,
          RTCFrameCryptorAlgorithm.kAesGcm,
          this.provider.rtcKeyProvider,
        );
        void cryptor.setEnabled(true);
        void cryptor.setKeyIndex(this.provider.getLatestKeyIndex(room.localParticipant.identity));
        this.early.set(track, cryptor);
      })
      .on(ParticipantEvent.LocalTrackPublished, (pub: LocalTrackPublication) => {
        const cryptor = pub.track ? this.early.get(pub.track) : undefined;
        if (!cryptor || !pub.track) return;
        this.early.delete(pub.track);
        // Kütüphanenin özel haritası (TS `private`, çalışma anında açık): aynı iz için ikinci şifreleyici kurulmasın.
        this['frameCryptors'].set(pub.trackSid, cryptor);
      });
    room.on(RoomEvent.Disconnected, () => {
      // Yayına hiç çıkmadan kapanan izlerin şifreleyicileri (kütüphane haritasında değiller).
      for (const c of this.early.values()) void c.dispose();
      this.early.clear();
    });

    super.setup(room);

    // B2: kütüphanenin alıcı dinleyicisinden SONRA (şifreleyici haritaya o an konmuş olur).
    room.on(RoomEvent.TrackSubscribed, (_t, pub, participant) => {
      const cryptor = this['frameCryptors'].get(pub.trackSid);
      if (!cryptor) return;
      cryptor.addEventListener('framecryptorstatechanged', (ev: { state: RTCFrameCryptorState }) => {
        if (FAILED_STATES.has(ev.state)) {
          this.emit(EncryptionEvent.EncryptionError, new Error('decrypt'), participant.identity);
        }
      });
    });
  }
}

/** Bir şifreli aramanın düzeni. */
export interface CallCrypto {
  roomOptions: Pick<RoomOptions, 'e2ee'>;
  /** Grup değişmiş olabilir: anahtarı yeniden türet, epoch değiştiyse 0 numaralı yuvanın üstüne yaz. */
  refresh(): Promise<void>;
}

function keyError(e: unknown): CallE2eeError {
  if (e instanceof CallKeyUnavailableError && e.reason === 'NOT_MEMBER') {
    return new CallE2eeError('call.e2ee.notMember');
  }
  // STALE ya da ağ/MLS hatası: kısa süre sonra tekrar denenebilir.
  return new CallE2eeError('call.e2ee.stale');
}

/**
 * `room.connect`'ten ÖNCE: anahtarı türet, yuvaya yaz, yöneticiyi kur.
 * Herhangi bir adım tutmazsa `CallE2eeError` fırlar; çağıran BAĞLANMAZ (§1.4 geri düşme yok).
 */
export async function prepareCallCrypto(channelId: string, serverEpoch: number): Promise<CallCrypto> {
  const first = await callKeyFor(channelId, serverEpoch).catch((e: unknown) => {
    throw keyError(e);
  });
  // Varsayılanlar (tuz, halka boyu, sihirli baytlar) web ile aynı; değiştirilirse iki tarafta birden.
  const provider = new RNKeyProvider({ sharedKey: true });
  await provider.setSharedKey(toB64(first.key), 0);
  let epoch = first.epoch;

  // Yenilemeler sıraya girer: iki olay üst üste gelse de yuvaya eski anahtar sonradan yazılmaz.
  let queue: Promise<void> = Promise.resolve();
  const manager = new CallE2EEManager(provider);
  // 🔴 §9 madde 6 bulgusu (2026-11-22): native anahtar sağlayıcı paylaşılan anahtarı her katılımcı için ilk
  // kullanımda KOPYALAYIP saklıyor; sonraki `setSharedKey` yalnız ortak anahtarı değiştiriyor, kopyalar eskide
  // kalıyordu (epoch değişince telefon eski anahtarla şifreleyip çözmeye devam etti, ses kesildi). Ortak anahtarın
  // yanında odadaki her kimliğin yuvası da native `setKey` ile yazılır. RNKeyProvider.setKey paylaşılan modda
  // bunu ortak anahtara yönlendirdiği için native sağlayıcı doğrudan çağrılır. Sonradan katılan, güncel ortak
  // anahtarın kopyasını alır.
  const refreshOnce = async () => {
    const next = await callKeyFor(channelId, epoch);
    if (next.epoch === epoch) return;
    const key = toB64(next.key);
    await provider.setSharedKey(key, 0);
    await Promise.all(manager.identities().map((id) => provider.rtcKeyProvider.setKey(id, key, 0)));
    epoch = next.epoch;
  };

  return {
    roomOptions: { e2ee: { e2eeManager: manager } },
    refresh: () => {
      // Çıkarıldıysak (NOT_MEMBER) sunucu zaten odadan atar; burada yalnız loglanır, anahtar/içerik yazılmaz.
      queue = queue.then(refreshOnce).catch((e: unknown) => {
        console.warn('[e8] arama anahtarı yenilenemedi', channelId, e instanceof Error ? e.name : '');
      });
      return queue;
    },
  };
}

/** Arka arkaya çözme hatası bu süreyi aşarsa kullanıcıya "çözülemiyor" denir (kısa bozulma sayılmaz, §4.2). */
const FAILING_AFTER_MS = 6000;
/** Bu süre hata gelmezse seri biter. */
const STREAK_GAP_MS = 2000;
/** Çözme hatasında anahtar yenileme en fazla bu sıklıkta denenir. */
const REFRESH_EVERY_MS = 3000;

/**
 * `RoomEvent.EncryptionError` izleyicisi (§4.3, web ile aynı kural): kanal kimliği + sayaç loglanır (anahtar/kare
 * yok). Her hata seyrek bir anahtar yenilemesi dener (kaçırılmış commit). Hata kesintisiz sürerse `onFailing(true)`.
 */
export function watchDecryptErrors(
  channelId: string,
  crypto: CallCrypto,
  onFailing: (failing: boolean) => void,
): () => void {
  let count = 0;
  let streakStart = 0;
  let lastError = 0;
  let lastRefresh = 0;
  let failing = false;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;

  const setFailing = (v: boolean) => {
    if (v === failing) return;
    failing = v;
    onFailing(v);
  };

  return () => {
    const now = Date.now();
    count += 1;
    if (now - lastError > STREAK_GAP_MS) streakStart = now;
    lastError = now;
    if (count === 1 || count % 50 === 0) console.warn('[e8] çözme hatası', channelId, count);
    if (now - lastRefresh > REFRESH_EVERY_MS) {
      lastRefresh = now;
      void crypto.refresh();
    }
    if (now - streakStart > FAILING_AFTER_MS) setFailing(true);
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => setFailing(false), STREAK_GAP_MS);
  };
}
