import { useRef, useState } from 'react';

/**
 * Sprint M3c §4 — mesaj kutusundaki emoji düğmesinin durumu.
 *
 * 🔴 Emoji **imlecin olduğu yere** yazılır, metnin sonuna değil. RN'de `TextInput` imleç konumunu
 * bedava vermiyor; `onSelectionChange` ile takip edilir (aynı olay bahsetme önerileri için de
 * dinleniyordu — ikinci bir dinleyici açılmadı, olay tek yerden iki tüketiciye dağıtılıyor).
 *
 * İmleci emojiden SONRAYA taşımak için `TextInput`in `selection` prop'u tek bir render boyunca
 * kontrol edilir, sonra bırakılır: kalıcı kontrol edilen `selection` Android klavyesiyle
 * (IME birleştirmesi) kavga ediyor.
 *
 * ⚠️ Sıralama önemli: `insert` önce metni yazar (çağıranın `onChangeText`i `clearSelection`
 * çağırıyor), SONRA imleci kurar — tersi olsaydı kendi kurduğu imleci siler.
 */
export function useEmojiInsert(value: string, onChangeText: (text: string) => void) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const caretRef = useRef({ start: 0, end: 0 });

  function onSelectionChange(start: number, end: number) {
    caretRef.current = { start, end };
    if (selection) setSelection(null);
  }

  /** Kullanıcı klavyeden yazdı/sildi → tek-render'lık imleç kontrolünü bırak. */
  function clearSelection() {
    if (selection) setSelection(null);
  }

  function insert(emoji: string) {
    // Kutu emojinin seçildiği anda odakta olmayabilir; imleç son bilinen yerdedir. Metin dışarıdan
    // (örn. düzenleme moduna geçince) kısalmış olabileceği için konum her seferinde sınırlanır.
    const start = Math.min(caretRef.current.start, value.length);
    const end = Math.min(Math.max(caretRef.current.end, start), value.length);
    const caret = start + emoji.length;
    caretRef.current = { start: caret, end: caret };
    onChangeText(value.slice(0, start) + emoji + value.slice(end));
    setSelection({ start: caret, end: caret });
  }

  return { open, setOpen, selection, onSelectionChange, clearSelection, insert };
}
