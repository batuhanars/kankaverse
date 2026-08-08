# Sprint M4i — Kamera Düğmesi: Gizli Değil, Görünür-Kilitli (ortam kanalında)

> **Tier:** yalnız `mobile/`. `api/` sıfır · `web/` sıfır · native diff sıfır → **yeni build YOK.**
> **Kaynak:** sahip 2026-08-08 — "susturunca kamera butonu kalkıyor, böyle yapmayalım, kameranın
> üstü çizilsin."
> **🔴 R7:** bu sprint bir T&S sunum kararı içeriyor (§2). Kapı sunucuda; değişen yalnız **gösterim**.

---

## §1 Sorun

`canPublishCamera=false` iken kamera düğmesi **hiç çizilmiyor**. Sahibin gözlemi: düğmenin yok olup
gelmesi kafa karıştırıyor, üstü çizili bir düğme daha anlaşılır.

(Not: "susturmayı kaldırınca düğme geri gelmiyor" kısmı **R17'de düzeldi** — sunucu artık kaynak
listesini doğru yazıyor. Bu sprint yalnız **gösterim** meselesi.)

---

## §2 🔴 Karar: bağlama göre ayrı davranış

| Bağlam | Davranış | Neden |
|---|---|---|
| **Ortam sesli kanalı** (`callKind==='guild'`) | **Görünür-kilitli** — düğme çizilir, üstü çizili/pasif | Kapalı olmasının sebebi kanal ayarı (`mediaEnabled`), karantina ya da susturma. Hiçbiri **yaş** bilgisi sızdırmaz |
| **1-1 DM ve grup DM** | **Bugünkü gibi GİZLİ** | Orada video kapısı **yaş** kapısıdır: iki taraf da yetişkin değilse video yok. Görünür-kilitli düğme, yetişkin kullanıcıya karşı tarafın (ya da gruptaki birinin) **minör olduğunu söyler** — brief §5/G1: minör statüsü UI'da asla gösterilmez |

🔴 Bu ayrım **bilinçli ve zorunlu.** "Her yerde aynı olsun" diye DM'de de göstermek, sessiz bir yaş
ifşası üretir. Dev bu ayrımı sadeleştirmeyecek.

---

## §3 Görünüm

- Ortam kanalında `canPublishCamera=false` → düğme **çizilir**, `disabled`, üstü çizili kamera ikonu
  (`videocam-off` + soluk renk; mevcut `circleDisabled` deseni mikrofonda zaten var — **aynısı**).
- Basılınca hiçbir şey olmaz (mevcut `disabled` davranışı). Ek açıklama metni **bu sprintte yok**;
  istenirse ayrı kalem (gereksiz metin eklemeden önce sahip cihazda görsün).
- Kamera açılabilir hale gelince (susturma kalkınca / ayar açılınca) düğme **kendiliğinden** etkin
  olur — R17 + M4f'in izin dinleyicisi bunu zaten besliyor, yeni mekanizma yazılmayacak.
- Kamera çevirme düğmesi kuralı değişmiyor: yalnız kamera **açıkken** çizilir.

---

## §4 DoD

### Kod tarafı
- [ ] `npm run typecheck` · `npm run lint` temiz · `api/`+`web/` diffi sıfır · native diff yok
- [ ] DM ve grup DM'de `canPublishCamera=false` iken düğme **hâlâ hiç çizilmiyor**

### Cihazda (SAHİPTE)
- [ ] Ortam kanalında `mediaEnabled` kapalıyken kamera düğmesi **üstü çizili ve pasif** görünüyor
- [ ] Aynı kanalda susturulunca da öyle görünüyor; susturma kalkınca **kendiliğinden etkinleşiyor**
- [ ] 1-1 DM'de video izni yokken düğme **görünmüyor** (yaş ifşası yok)
- [ ] Kamera açılabilir durumdayken davranış **regresyonsuz**

---

## §5 Dev'e notlar

1. §2'deki ayrımı sadeleştirme; gerekçesi T&S, estetik değil.
2. Yeni ikon/renk uydurma — `circleDisabled` deseni mikrofonda zaten var.
3. Sözleşme dışına çıkma ihtiyacı → **DUR ve bildir.**
4. Cihaz testi yapma, commit atma.
