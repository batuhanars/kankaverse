import { AutomodService } from './automod.service';

describe('AutomodService.check', () => {
  let service: AutomodService;

  beforeEach(() => {
    service = new AutomodService();
  });

  // ── Temiz metin ─────────────────────────────────────────────────────────────
  describe('temiz metin → geçer (blocked: false)', () => {
    it('boş string → geçer', () => {
      expect(service.check('').blocked).toBe(false);
    });

    it('normal Türkçe cümle → geçer', () => {
      expect(service.check('Merhaba nasılsın bugün güzel bir gün').blocked).toBe(false);
    });

    it('sayı ve noktalama → geçer', () => {
      expect(service.check('Toplantı saat 15:30\'da!').blocked).toBe(false);
    });
  });

  // ── Yasak kelime — düz eşleşme ──────────────────────────────────────────────
  describe('yasak kelime → engellenir (blocked: true)', () => {
    it('"orospu" içeren metin → blocked', () => {
      expect(service.check('bu orospu bir şey').blocked).toBe(true);
    });

    it('"sik" içeren metin → blocked', () => {
      expect(service.check('sik git').blocked).toBe(true);
    });

    it('"piç" içeren metin → blocked', () => {
      expect(service.check('sen bir piç misin').blocked).toBe(true);
    });

    it('"şerefsiz" içeren metin → blocked', () => {
      expect(service.check('şerefsiz adam').blocked).toBe(true);
    });

    it('"ibne" içeren metin → blocked', () => {
      expect(service.check('ibne').blocked).toBe(true);
    });
  });

  // ── Token başı (prefix): Türkçe ekli biçimler de yakalanır ──────────────────
  describe('ek almış biçim → prefix → blocked', () => {
    it('"orospusun" (ek) → blocked', () => {
      expect(service.check('sen bir orospusun').blocked).toBe(true);
    });

    it('"şerefsizsin" (ek) → blocked', () => {
      expect(service.check('şerefsizsin sen').blocked).toBe(true);
    });

    it('"siktir" (sik prefix) → blocked', () => {
      expect(service.check('siktir git').blocked).toBe(true);
    });

    it('"sikiyorum" (sik çekim, prefix) → blocked', () => {
      expect(service.check('sikiyorum seni').blocked).toBe(true);
    });
  });

  // ── Eklenen kelimeler (2026-06-23) — blok + çakışma güvenliği ──────────────
  describe('eklenen kelimeler → blocked, masum komşular → geçer', () => {
    it('"yarak" → blocked', () => {
      expect(service.check('seni gidi yarak').blocked).toBe(true);
    });
    it('"yaralı"/"yaratık"/"yaramaz" → geçer (yarak prefix yakalamaz)', () => {
      expect(service.check('yaralı bir yaratık çok yaramaz').blocked).toBe(false);
    });
    it('"amcık" / "amcik" → blocked', () => {
      expect(service.check('amcık').blocked).toBe(true);
      expect(service.check('amcik').blocked).toBe(true);
    });
    it('"amca"/"amcam"/"amaç" → geçer', () => {
      expect(service.check('amcam ile amaç konuştuk').blocked).toBe(false);
    });
    it('"ipne" → blocked, "ipek"/"iplik" → geçer', () => {
      expect(service.check('ipne').blocked).toBe(true);
      expect(service.check('ipek iplik aldım').blocked).toBe(false);
    });
    it('"godoş" → blocked', () => {
      expect(service.check('godoş herif').blocked).toBe(true);
    });
    it('"götveren" + "göt veren" (boşluklu) → blocked', () => {
      expect(service.check('götveren').blocked).toBe(true);
      expect(service.check('göt veren').blocked).toBe(true);
    });
    it('"götlek" → blocked', () => {
      expect(service.check('götlek').blocked).toBe(true);
    });
  });

  // ── Normalize varyantları: büyük harf ─────────────────────────────────────
  describe('büyük harf varyantları → normalize → blocked', () => {
    it('"OROSPU" → blocked', () => {
      expect(service.check('OROSPU').blocked).toBe(true);
    });

    it('"SİK" (Türkçe büyük İ → i) → blocked', () => {
      expect(service.check('SİK').blocked).toBe(true);
    });

    it('"PİÇ" → blocked', () => {
      expect(service.check('PİÇ').blocked).toBe(true);
    });

    it('"ŞEREFSİZ" → blocked', () => {
      expect(service.check('ŞEREFSİZ').blocked).toBe(true);
    });
  });

  // ── Normalize varyantları: TR karakter → ASCII kaçış ──────────────────────
  describe('TR karakter kaçış girişimleri → normalize → blocked', () => {
    it('"şik" (ş→s normalize) → "sik" → blocked', () => {
      expect(service.check('şik git').blocked).toBe(true);
    });

    it('"piç" (ç→c normalize) → "pic" → blocked', () => {
      expect(service.check('piç').blocked).toBe(true);
    });

    it('"orospu" yazımı aynı → blocked', () => {
      expect(service.check('orospu').blocked).toBe(true);
    });
  });

  // ── Normalize varyantları: tekrarlı harf ─────────────────────────────────
  describe('tekrarlı harf varyantları → daralt → blocked', () => {
    it('"siikkk" → "sik" → blocked', () => {
      expect(service.check('siikkk').blocked).toBe(true);
    });

    it('"oooorooosspu" → "orospu" → blocked', () => {
      expect(service.check('oooorooosspu').blocked).toBe(true);
    });

    it('"piiiiç" → "pic" → blocked', () => {
      expect(service.check('piiiiç').blocked).toBe(true);
    });
  });

  // ── Cümle içi (kelime sınırında) yasak kelime → blocked ──────────────────
  describe('cümle içi yasak kelime (token sınırı) → blocked', () => {
    it('başta yasak kelime → blocked', () => {
      expect(service.check('ibne sen kimsin').blocked).toBe(true);
    });

    it('sonda yasak kelime → blocked', () => {
      expect(service.check('sen tam bir ibne').blocked).toBe(true);
    });

    it('ortada yasak kelime → blocked', () => {
      expect(service.check('bu adamın kahpe biri olduğunu').blocked).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── YANLIŞ-POZİTİF REGRESYON KİLİDİ (B1/B2 düzeltmesi, 2026-06-23) ──────────
  //    ı≠i ayrımı + token-başı eşleşme: masum kelimeler GEÇMELİ.
  //    Bu testler bozulursa automod tekrar günlük Türkçeyi yiyor demektir.
  // ════════════════════════════════════════════════════════════════════════════
  describe('YANLIŞ-POZİTİF KİLİDİ: masum kelime → geçer (blocked: false)', () => {
    it('"sıkıntı yok" (ı≠i) → geçer', () => {
      expect(service.check('bugün hiç sıkıntı yok').blocked).toBe(false);
    });

    it('"sık sık" (ı≠i) → geçer', () => {
      expect(service.check('buraya sık sık geliyorum').blocked).toBe(false);
    });

    it('"sıkışık / sıkıcı" (ı≠i) → geçer', () => {
      expect(service.check('program çok sıkışık ve sıkıcı').blocked).toBe(false);
    });

    it('"şık" giyim (ş→s ama ı korunur) → geçer', () => {
      expect(service.check('çok şık giyinmişsin').blocked).toBe(false);
    });

    it('"klasik" (kelime-ortası sik, prefix yakalamaz) → geçer', () => {
      expect(service.check('klasik müzik dinliyorum').blocked).toBe(false);
    });

    it('"kapıcı" (kelime-ortası pic, prefix yakalamaz) → geçer', () => {
      expect(service.check('kapıcı geldi mi').blocked).toBe(false);
    });

    it('"bisiklet" (kelime-ortası sik) → geçer', () => {
      expect(service.check('yeni bisiklet aldım').blocked).toBe(false);
    });
  });

  // ── Normalleşmiş kısaltmalar → GEÇER (regresyon kilidi) ─────────────────────
  // amk/aq/lan/la TR konuşma dilinde doldurucu; liste dışı (PM kararı 2026-06-13)
  describe('normalleşmiş kısaltmalar → geçer (blocked: false)', () => {
    it('"amk" → geçer', () => {
      expect(service.check('amk ne diyorsun').blocked).toBe(false);
    });

    it('"aq" → geçer', () => {
      expect(service.check('aq bunu bilmiyordum').blocked).toBe(false);
    });

    it('"lan" → geçer', () => {
      expect(service.check('lan ne yapıyorsun').blocked).toBe(false);
    });

    it('"napıyon la" → geçer', () => {
      expect(service.check('napıyon la').blocked).toBe(false);
    });
  });

  // ── Kimlik adı / hafif hakaret → GEÇER (içerik-politikası, PM kararı) ───────
  describe('kimlik adı ve hafif hakaret → geçer (blocked: false)', () => {
    it('"yahudi" → geçer (etnik kimlik adı, hakaret değil)', () => {
      expect(service.check('yahudi tarihi hakkında').blocked).toBe(false);
    });

    it('"ermeni" → geçer (etnik kimlik adı, hakaret değil)', () => {
      expect(service.check('ermeni kültürü').blocked).toBe(false);
    });

    it('"mal" → geçer (eşya anlamı, yanlış-pozitif)', () => {
      expect(service.check('mal teslim tarihi nedir').blocked).toBe(false);
    });

    it('"aptal" → geçer (hafif hakaret — Option A dışında)', () => {
      expect(service.check('aptal soru değil bu').blocked).toBe(false);
    });

    it('"salak" → geçer (hafif hakaret — Option A dışında)', () => {
      expect(service.check('salak gibi gülüyorum').blocked).toBe(false);
    });
  });

  // ── Büyük-harf ı/i ayrımı (caps belirsizliği — bilinçli davranış) ───────────
  describe('caps ı/i ayrımı (bilinçli)', () => {
    it('"SIK" (ascii I → ı → sık) → geçer (frekans anlamı, küfür değil)', () => {
      // ascii büyük I, Türkçe locale\'de ı olur → "sık" → masum
      expect(service.check('SIK SIK').blocked).toBe(false);
    });

    it('"SİK" (dotted İ → i) → blocked (küfür)', () => {
      expect(service.check('SİK').blocked).toBe(true);
    });
  });

  // ── Açık yazılı ağır küfür → blocked ────────────────────────────────────────
  describe('açık yazılı ağır küfür → blocked', () => {
    it('"amınakoyayım" (ı yazımı) → blocked', () => {
      expect(service.check('amınakoyayım').blocked).toBe(true);
    });

    it('"aminakoyayim" (tembel i yazımı) → blocked', () => {
      expect(service.check('aminakoyayim').blocked).toBe(true);
    });

    it('"AMINAKOYAYIM" (ascii caps → ı) → blocked', () => {
      expect(service.check('AMINAKOYAYIM').blocked).toBe(true);
    });

    it('"amiiinakoyaayim" tekrarlı harf → daralt → blocked', () => {
      expect(service.check('amiiinakoyaayim').blocked).toBe(true);
    });
  });

  // ── Kutsal değerlere hakaret → blocked ──────────────────────────────────────
  // 4B'de insan-onaylı ban'a yükseltilecek; şimdi block-on-send
  describe('kutsal değerlere hakaret → blocked', () => {
    it('"allahını satayım" (ı yazımı) → blocked', () => {
      expect(service.check('allahını satayım').blocked).toBe(true);
    });

    it('"allahini satayim" (tembel i yazımı) → blocked', () => {
      expect(service.check('allahini satayim').blocked).toBe(true);
    });

    it('"allahına koyayım" → blocked', () => {
      expect(service.check('allahına koyayım').blocked).toBe(true);
    });

    it('"dinini satayım" → blocked', () => {
      expect(service.check('dinini satayım').blocked).toBe(true);
    });

    it('"peygamberi satayım" → blocked', () => {
      expect(service.check('peygamberi satayım').blocked).toBe(true);
    });

    it('büyük harf kutsal-değer ifadesi → normalize → blocked', () => {
      expect(service.check('ALLAHINA KOYAYIM').blocked).toBe(true);
    });
  });

  // ── Ülke/kimlik isimleri bloklanmaz (kimlik adı politikası) ─────────────────
  describe('ülke/kimlik ismi → serbest (geçer)', () => {
    it('"israil soykırım yapıyor" (eleştiri) → geçer', () => {
      expect(service.check('israil soykırım yapıyor').blocked).toBe(false);
    });

    it('Kur\'an "Beni İsrail" → geçer', () => {
      expect(service.check('Beni İsrail').blocked).toBe(false);
    });

    it('"kürdistan" → geçer', () => {
      expect(service.check('kürdistan').blocked).toBe(false);
    });
  });
});
