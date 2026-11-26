import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Vibration } from 'react-native';
import type { MessageDto } from '@/api/messages';
import { showToast } from '@/stores/toast';
import { t } from '@/i18n';

/** C81 §1: tek seferde en çok bu kadar mesaj seçilir (toplu silme tek onayla). */
export const SELECTION_MAX = 50;
/** Seçim başlarken WhatsApp gibi hızlı çift titreşim: [bekle, titret, ara, titret] ms (Android desen biçimi). Tek 10 ms çoğu cihazda hissedilmiyordu. */
const HAPTIC_PATTERN = [0, 35, 70, 35];

/**
 * C81 — WhatsApp tarzı seçim modu. Yalnız KİMLİKLER tutulur; mesajın güncel hâli (tepki, sabit) her çizimde
 * listeden okunur, böylece seçiliyken gelen tepki/düzenleme bayat kopyadan okunmaz.
 *
 * Gönderilmemiş/başarısız (yerel) mesaj seçilemez: sunucuda yok, silinemez/iletilemez/şikâyet edilemez.
 */
export function useMessageSelection(items: { message: MessageDto }[]) {
  const [ids, setIds] = useState<string[]>([]);
  const active = ids.length > 0;

  // Android geri tuşu seçim modunu kapatır (ekrandan çıkmaz).
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIds([]);
      return true;
    });
    return () => sub.remove();
  }, [active]);

  const idSet = useMemo(() => new Set(ids), [ids]);
  /** Seçili mesajlar KRONOLOJİK sırada (listeden; silinen mesaj kendiliğinden düşer). */
  const selected = useMemo(() => items.map((i) => i.message).filter((m) => idSet.has(m.id)), [items, idSet]);

  // Seçili mesajlar silindiyse (başka cihazdan da olabilir) seçim boşalır, mod kapanır.
  useEffect(() => {
    if (active && selected.length === 0) setIds([]);
  }, [active, selected.length]);

  function start(message: MessageDto) {
    if (message.localStatus) return;
    Vibration.vibrate(HAPTIC_PATTERN);
    setIds([message.id]);
  }

  function toggle(message: MessageDto) {
    if (message.localStatus) return;
    if (idSet.has(message.id)) {
      setIds((prev) => prev.filter((id) => id !== message.id));
      return;
    }
    if (ids.length >= SELECTION_MAX) {
      showToast(t('mobile.select.limit', { n: SELECTION_MAX }));
      return;
    }
    setIds((prev) => [...prev, message.id]);
  }

  return {
    active,
    selected,
    isSelected: (id: string) => idSet.has(id),
    start,
    toggle,
    clear: () => setIds([]),
  };
}
