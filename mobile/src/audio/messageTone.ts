import { createAudioPlayer } from 'expo-audio';

/**
 * Sprint M5f §3/§5.1/§6 — DM ekranı açıkken karşı taraftan gelen mesajın kısa uyarı sesi.
 *
 * `stores/dm.ts` `applyActivity` kendi ekranını (`activeDmChannelId`) ve göndereni
 * (`senderId !== myId`) zaten süzüyor (rozet düşürme dalı) — bu modül yalnız SESİ çalar, ikinci
 * bir koşul kopyalamaz.
 *
 * `createAudioPlayer` (`useAudioPlayer` DEĞİL) BİLEREK: tetikleyici bir zustand store aksiyonu,
 * React bileşeni değil — hook'un otomatik yaşam döngüsü yönetimi burada uygulanamaz. Oyuncu modül
 * seviyesinde TEK KEZ kurulur (uygulama ömrü boyunca yaşar, `push.ts` `registeredToken` deseniyle
 * aynı gerekçe: render'a bağlı olmaması gerekiyor) — `remove()` hiç çağrılmaz, çünkü kapanacağı bir
 * an yok.
 */
const MESSAGE_TONE_VOLUME = 0.8;

let player: ReturnType<typeof createAudioPlayer> | null = null;

function getPlayer() {
  if (!player) {
    player = createAudioPlayer(require('@/assets/sounds/message_tone.mp3'));
    player.volume = MESSAGE_TONE_VOLUME;
  }
  return player;
}

/**
 * 🔴 `stores/voice` modül BAŞINDA import EDİLMEZ, çağrı anında okunur. Sebep tercih değil, cihazda
 * ölçülmüş bir çökme (2026-09-19, ilk kurulum turu): statik import bu dosyayı bir import DÖNGÜSÜNÜN
 * içine sokuyor —
 *
 *   `stores/dm` → buraya → `stores/voice` → `realtime/socket` → `notifications/incomingCall`
 *                                                                        ↓
 *                                                    `useVoiceStore.subscribe(...)` (modül gövdesi)
 *
 * `stores/dm` erken yüklendiği için `stores/voice` daha kendi gövdesini bitirmeden `socket`i, o da
 * `incomingCall`i çağırıyordu; `incomingCall` modül gövdesinde (satır ~560) `useVoiceStore.subscribe`
 * çalıştırdığı için henüz tanımlanmamış bir değere dokunuyor ve
 * `TypeError: Cannot read property 'subscribe' of undefined` ile TÜM bundle değerlendirmesi
 * düşüyordu (belirti: her rota "missing the required default export" diyor, uygulama hiç açılmıyor).
 *
 * `playMessageTone` yalnız çalışma anında çağrıldığı için gecikmeli okuma döngüyü modül
 * seviyesinden tamamen kaldırır. ⚠️ Buraya `@/stores/*` için YENİ bir statik import EKLEME, aynı
 * çökme geri gelir. Asıl kırılganlık `incomingCall.ts`in modül gövdesinde iş yapması (PLAN.md D70).
 */
function isConnectedToCall(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useVoiceStore } = require('@/stores/voice') as typeof import('@/stores/voice');
  return useVoiceStore.getState().connectedChannelId !== null;
}

/**
 * §5.1 🔴 — LiveKit'in ses oturumuyla (`stores/voice.ts` `AudioSession.startAudioSession`)
 * çakışma riski nedeniyle aramaya bağlıyken bu ses ATLANIR. Tek satırlık koşul, sözleşmenin
 * istediği gibi tartışmasız.
 */
export function playMessageTone(): void {
  if (isConnectedToCall()) return;
  void (async () => {
    try {
      const p = getPlayer();
      // `seekTo` asenkron — `play()`den ÖNCE bitmesi beklenmezse arka arkaya iki mesajda ikinci
      // çalma birincinin yarım kalan konumundan devam edebilir. `loop` burada YOK, tek atış.
      await p.seekTo(0);
      p.play();
    } catch {
      // sessiz — ses altyapısı mesaj akışını ASLA bloke etmez (dosyadaki genel ilke,
      // bkz. `notifications/push.ts` `syncPushToken` aynı ruh)
    }
  })();
}
