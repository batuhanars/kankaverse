/**
 * 🫀 C67 §2 — "görüldü avatarları" kararı. **T&S karar fonksiyonu (R7), satır satır insan incelemesi zorunlu.**
 *
 * `readReceiptDecision` (C12, 1-1) ve `groupReadReceiptDecision` (C34, grup) DEĞİŞMEDİ; bu üçüncü, saf
 * kardeşi hem 1-1 hem grup için "kim, ne zamana kadar okudu" cevabını verir. C34'ün "bireysel okuma anı
 * gitmez" kararı sahip tarafından kaldırıldı (2026-11-13): uygun üyelerin bireysel okuma anı gider.
 *
 * Bilerek SAF: sorgu yapmaz. İki çağıranı (DTO `seenBy` ve canlı `dm:seen`) aynı fonksiyondan geçer; kural
 * bir yerde gevşetilip diğerinde sıkı kalırsa DTO ile olay sessizce ayrışırdı.
 *
 * Kural sırası (fail-closed, belirsizse görünmez):
 *  1. Bekleyen mesaj isteği (PENDING) → görünmez (C12 madde 2 ile aynı).
 *  2. İzleyicinin kendi `readReceipts`'i kapalı → görünmez (karşılıklılık, C12 madde 5).
 *  3. Uygun okuyucu: `readReceipts` açık VE izleyiciyle iki yönde engel YOK VE `lastReadAt` dolu.
 *  4. `members` izleyici HARİÇ ve kanalın GÜNCEL üyeleridir (çağıran süzer; ayrılan/çıkarılanın
 *     `ChannelMember` satırı zaten yoktur). Eski grupta (C62 departed) çağrılmaz, `seenBy` hep `[]`.
 * `visible` false iken `readers` hep boştur. Okuyucular okuma anına göre ESKİDEN YENİYE sıralanır.
 */
export interface SeenReader {
  userId: string;
  /** ISO 8601 */
  readAt: string;
}

export interface SeenReadersDecision {
  visible: boolean;
  readers: SeenReader[];
}

export function seenReadersDecision(input: {
  requestPending: boolean;
  viewerReadReceipts: boolean;
  /** İzleyici HARİÇ güncel üyeler. */
  members: Array<{
    userId: string;
    readReceipts: boolean;
    blockedEitherWay: boolean;
    lastReadAt: Date | null;
  }>;
}): SeenReadersDecision {
  const hidden: SeenReadersDecision = { visible: false, readers: [] };
  if (input.requestPending) return hidden;
  if (!input.viewerReadReceipts) return hidden;

  const readers = input.members
    .flatMap((m) =>
      m.readReceipts && !m.blockedEitherWay && m.lastReadAt
        ? [{ userId: m.userId, at: m.lastReadAt }]
        : [],
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((r) => ({ userId: r.userId, readAt: r.at.toISOString() }));
  return { visible: true, readers };
}
