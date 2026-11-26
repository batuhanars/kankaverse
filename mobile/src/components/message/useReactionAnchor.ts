import { useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';
import { STRIP_HEIGHT } from './QuickReactionStrip';

/** Şerit ile baloncuk arasındaki boşluk (bitişik dursun). */
const GAP = 2;
/** Şeridin içerik kabının üst kenarına en çok bu kadar yaklaşması (başlık artık kabın dışında, Rev.2). */
const MIN_TOP = 4;

/**
 * C81 — hızlı tepki şeridinin konumu: seçili TEK mesajın baloncuğunun hemen üstü (yer yoksa altı).
 *
 * Rev.2 (sahip turu): ilk sürüm parmağın dokunduğu noktayı kullanıyordu, uzun mesajda şerit baloncuktan uzak
 * kalıyordu. Artık baloncuğun kendisi ölçülür (`measureInWindow`). Liste `inverted` olsa da hücre ve kaydırma kabı
 * İKİ KEZ çevrildiği için ölçülen üst kenar gerçek üst kenardır (cihazda ölçüldü, 2026-11-26). Dokunmanın `pageY`'si
 * bu koordinat sisteminde DEĞİL (baloncuğun dışında çıkıyordu); düzeltmede kullanılması şeridi bir boy yukarı itti.
 *
 * Kaydırınca şerit gizlenir (mesaj yerinden oynar, şerit havada kalırdı); yeniden uzun basınca gelir.
 */
export function useReactionAnchor(singleId: string | null) {
  const bubbles = useRef(new Map<string, View>());
  /** Ekran kabının sol üst köşesi (pencere koordinatı); şerit bu kaba göre mutlak konumlanır. */
  const marker = useRef<View>(null);
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const bubble = singleId ? bubbles.current.get(singleId) : undefined;
    if (!singleId || !bubble) {
      setTop(null);
      return;
    }
    // Seçim vurgusu çizilsin diye bir kare beklenip ölçülür (başlık artık yerinde, kap kaymıyor).
    const frame = requestAnimationFrame(() => {
      marker.current?.measureInWindow((_rx, rootY) => {
        bubble.measureInWindow((_x, y, _w, h) => {
          const relTop = y - rootY;
          const above = relTop - GAP - STRIP_HEIGHT;
          setTop(above >= MIN_TOP ? above : relTop + h + GAP);
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [singleId]);

  return {
    marker,
    top,
    /** Baloncuk sarmalayıcısının ref'i. */
    bubbleRef: (id: string) => (node: View | null) => {
      if (node) bubbles.current.set(id, node);
      else bubbles.current.delete(id);
    },
    hide: () => setTop(null),
  };
}
