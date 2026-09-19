import { useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';

/**
 * Sprint M5f §4/§5.1/§6 — giden arama zili (1-1 DM'de biz başlattık, karşı taraf henüz katılmadı).
 *
 * `active` DIŞARIDAN gelir (`call.tsx`teki `alone && didInvite && callKind === 'dm'` — "Çalıyor…"
 * yazısını üreten KOŞULUN AYNISI, ikinci bir doğruluk kaynağı burada KURULMADI).
 *
 * Dosya (`assets/sounds/outgoing_call.mp3`) 1 sn ton + 2 sn sessizlik olacak şekilde PM tarafından
 * hazırlandı — kusursuz dönen 3 sn'lik ritim `loop = true` ile kendiliğinden çıkar, burada
 * zamanlayıcı KURULMAZ.
 *
 * `useAudioPlayer` (createAudioPlayer DEĞİL) BİLEREK: bu bir React bileşeninin (arama ekranı)
 * ömrüne bağlı — hook'un otomatik yönetimi burada tam oturuyor (mesaj sesindeki modül-seviyesi
 * tekil oyuncudan FARKLI durum, bkz. `audio/messageTone.ts`).
 *
 * §5.1 🔴 — bu zil aramanın İÇİNDE çaldığı için `stores/voice.ts`in LiveKit ses oturumuyla
 * (`AudioSession.startAudioSession`) çakışması BURADA KAÇINILMAZ (sözleşme böyle diyor). Düzeltmeye
 * ÇALIŞILMADI — cihaz turunda bozukluk görülürse PM'e raporlanır, çözüm ayrı bir karar.
 */
const OUTGOING_RING_VOLUME = 0.5;

export function useOutgoingCallRing(active: boolean): void {
  const player = useAudioPlayer(require('@/assets/sounds/outgoing_call.mp3'));

  useEffect(() => {
    player.loop = true;
    player.volume = OUTGOING_RING_VOLUME;
  }, [player]);

  useEffect(() => {
    try {
      if (active) {
        player.play();
      } else {
        player.pause();
        // Konumu sıfırla — aksi halde zil bir sonraki `active`de kaldığı yerden (sessizlik
        // ortasında ya da tonun içinde) devam eder, her seferinde BAŞTAN çalması gerekiyor.
        void player.seekTo(0).catch(() => {
          // yoksay — oyuncu bu anda yüklü olmayabilir
        });
      }
    } catch {
      // yoksay — ses altyapısı arama akışını ASLA bloke etmez
    }
  }, [active, player]);

  // §4 "sızıntı bırakma: çalar her yoldan durdurulmalı, unmount'ta da" — ekran hangi yoldan
  // kapanırsa kapansın (kabul/reddet/iptal/geri tuşu) bu son çıkış zili durdurur.
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // yoksay — bileşen zaten sökülüyor, oyuncu serbest bırakılmış olabilir
      }
    };
  }, [player]);
}
