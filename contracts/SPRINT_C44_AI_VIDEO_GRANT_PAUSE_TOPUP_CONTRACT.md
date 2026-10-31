# SPRINT C44: Yapay zeka hakkı: askıya al / sürdür + kredi ekle

> Durum: **TASLAK (2026-10-31), C43 canlıya çıktıktan sonra açılır.** PM compose (Opus). Sahip onayladı (fikir). **api + web (admin paneli)**.
> Mobilde admin paneli yok. **R7:** erişim kapısı (`findActiveAiVideoGrant`) değişir, diff sahip onayına sunulur.

## §0 Sorun
Panelde yalnız "Ver/Yenile" ve "İptal et" var. Yeniden verme yeni dönem başlatır (`startsAt` sıfırlanır, kullanılan 0'dan sayılır).
Bu yüzden (1) geçici durdurup açmak kullanıcıya bütçeyi yeniden verir, (2) ödeme yapan kullanıcıya kredi eklemek kullanılanı siler.

## §1 Kararlar
1. **Askıya al / sürdür:** `AiVideoGrant.pausedAt DateTime?` (additive migration, DB'ye uygulanır). Askıdaki hak etkin sayılmaz
   (kapı kapalı, form kilitli moda düşer). Sürdür `pausedAt = null` yapar; `startsAt`, bütçe ve kullanılan DEĞİŞMEZ.
   Askıdayken süren üretim etkilenmez (yoklayıcı devam eder).
2. **Kredi ekle:** bütçeye ekler (`budgetMicroUsd += fromCredits(n)`), dönem ve kullanılan değişmez. INT4 tavanı mevcut kontrolle.
   Bitmiş (EXHAUSTED) hakka kredi eklenince hak yeniden etkin olur.
3. **İptal** aynen kalır (dönemi bitirir). Durum etiketi sırası: iptal > askıda > süresi doldu > bitti > etkin (`PAUSED` yeni değer).
4. Her işlem `AuditLog`'a yazılır (C40 deseni, aksiyon adları `AI_GRANT_PAUSE`, `AI_GRANT_RESUME`, `AI_GRANT_TOPUP`).

## §2 API (admin, mevcut `ai-video-grants.controller.ts` yetki kalıbı)
- `POST /admin/ai-video/grants/:userId/pause` · `POST .../resume` · `POST .../topup` gövde `{ credits: int 1..100000 }`.
  (Kesin yol önekini mevcut controller'dan al, değiştirme.) Hak yoksa 404; iptal edilmiş hakka askı/sürdür/ekle 409.
- Liste yanıtına `pausedAt` ve `status: 'PAUSED'` eklenir.
- `findActiveAiVideoGrant`: `pausedAt !== null` → null (DB'ye harcama sorgusu atmadan).

## §3 Web admin paneli
- Hak satırında durum rozeti (Askıda dahil), **Askıya al / Sürdür** anahtarı (onay penceresi yok, tersine çevrilebilir) ve **Kredi ekle** (küçük form, sayı).
- "Ver/Yenile" yanında kısa not: "Yenilemek kullanılan krediyi sıfırlar."

## §4 OUT
Pika bakiyesi gösterimi (sonraki, kullanıcı artınca) · kullanıcıya bildirim · çoklu hak geçmişi.

## §5 DoD
api build + testler (askıda kapı kapalı; sürdürünce kullanılan korunur; kredi ekle kullanılanı korur; bitmiş hak eklemeyle açılır;
iptal edilmişe 409; audit kayıtları) + migration uygulandı; web vue-tsc -b + lint + build; sahip R7 onayı.
