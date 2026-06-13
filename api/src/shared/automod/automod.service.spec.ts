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

  // ── Normalize varyantları: büyük harf ─────────────────────────────────────
  describe('büyük harf varyantları → normalize → blocked', () => {
    it('"OROSPU" → blocked', () => {
      expect(service.check('OROSPU').blocked).toBe(true);
    });

    it('"SİK" (Türkçe büyük İ) → blocked', () => {
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

    it('"oooorosspuu" → "orosp" + normalize → blocked', () => {
      // orospu → normalize: tekrarlı daralt → "orospu"
      expect(service.check('oooorooosspu').blocked).toBe(true);
    });

    it('"piiiiç" → "pic" → blocked', () => {
      expect(service.check('piiiiç').blocked).toBe(true);
    });

    it('"SSIIKK" → normalize → blocked', () => {
      expect(service.check('SSIIKK').blocked).toBe(true);
    });
  });

  // ── Cümle içi gömülü eşleşme ─────────────────────────────────────────────
  describe('cümle içi gömülü yasak kelime → blocked', () => {
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

  // ── Açık yazılı ağır küfür → blocked ────────────────────────────────────────
  describe('açık yazılı ağır küfür → blocked', () => {
    it('"aminakoyayim" normalize varyantı (büyük harf + TR) → blocked', () => {
      // AMİNAKOYAYIM → normalize → aminakoyayim
      expect(service.check('AMİNAKOYAYIM').blocked).toBe(true);
    });

    it('"aminakoyayim" tekrarlı harf varyantı → blocked', () => {
      // amiiinakoyaayim → daralt → aminakoyayim
      expect(service.check('amiiinakoyaayim').blocked).toBe(true);
    });
  });

  // ── Kutsal değerlere hakaret → blocked ──────────────────────────────────────
  // 4B'de insan-onaylı ban'a yükseltilecek; şimdi block-on-send
  describe('kutsal değerlere hakaret → blocked', () => {
    it('"allahını satayım" → blocked', () => {
      // normalize: alahini satayim
      expect(service.check('allahını satayım').blocked).toBe(true);
    });

    it('"allahına koyayım" → blocked', () => {
      // normalize: alahina koyayim
      expect(service.check('allahına koyayım').blocked).toBe(true);
    });

    it('"dinini satayım" → blocked', () => {
      expect(service.check('dinini satayım').blocked).toBe(true);
    });

    it('"peygamberi satayım" → blocked', () => {
      expect(service.check('peygamberi satayım').blocked).toBe(true);
    });

    it('büyük harf kutsal-değer ifadesi → normalize → blocked', () => {
      // ALLAHINI SATAYIM → normalize → alahini satayim
      expect(service.check('ALLAHINI SATAYIM').blocked).toBe(true);
    });
  });
});
