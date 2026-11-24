import { AutomodService } from './automod.service';
import { loadAutomodLists } from './automod-lists';

/**
 * Eşleştirme kuralları kurgusal bir listeyle sınanır: gerçek liste repoda değil (bkz. `automod-lists.ts`).
 * Her kelime gerçek listedeki bir durumun yerine geçer:
 *  - `yasak`: tek kelime, token başı eşleşir (ekli biçimler yakalanır, kelime ortası yakalanmaz)
 *  - `zıkkım`: `ı` içeren kelime (`ı` ve `i` ayrı harf, katlanmaz)
 *  - `çirkinsöz`: Türkçe karakterli kelime (ş/ç/ğ/ü/ö ASCII'ye iner)
 *  - `kara büyü`: çok kelimeli ifade, tam metin içinde aranır
 *  - `yasakname`: masum kök; `yasak` önekine düşse de engellenmez, ama ardına eklenen yine denetlenir
 */
const FIXTURE = {
  words: ['yasak', 'zıkkım', 'çirkinsöz', 'kara büyü'],
  safePrefixes: ['yasakname'],
};

describe('AutomodService eşleştirme', () => {
  const service = new AutomodService(FIXTURE);
  const blocked = (text: string) => service.check(text).blocked;

  it('boş ve temiz metin geçer', () => {
    expect(blocked('')).toBe(false);
    expect(blocked('Merhaba, toplantı saat 15:30da!')).toBe(false);
  });

  it('tek kelime token başında yakalanır, ekli biçim de', () => {
    expect(blocked('bu yasak')).toBe(true);
    expect(blocked('yasaklı bölge')).toBe(true);
  });

  it('kelime ortası yakalanmaz', () => {
    expect(blocked('koyasak dedi')).toBe(false);
  });

  it('büyük harf ve Türkçe büyük/küçük kuralı', () => {
    expect(blocked('YASAK')).toBe(true);
    expect(blocked('ÇİRKİNSÖZ')).toBe(true);
  });

  it('Türkçe karakterler ASCII yazımla da yakalanır', () => {
    expect(blocked('cirkinsoz')).toBe(true);
  });

  it('ı ve i ayrı harf: i yazımı ı içeren kelimeyle eşleşmez', () => {
    expect(blocked('zıkkım')).toBe(true);
    expect(blocked('zikkim')).toBe(false);
  });

  it('tekrarlı harfler teke iner', () => {
    expect(blocked('yaaasaaak')).toBe(true);
    expect(blocked('zıııkkkım')).toBe(true);
  });

  it('kesme işareti temizlenir', () => {
    expect(blocked("yasak'ın")).toBe(true);
  });

  it('çok kelimeli ifade tam metin içinde aranır', () => {
    expect(blocked('kara büyü yaptı')).toBe(true);
    expect(blocked('KARA BÜYÜ')).toBe(true);
    expect(blocked('kara kedi')).toBe(false);
  });

  it('masum kök geçer, ardına eklenen yine denetlenir', () => {
    expect(blocked('yasakname geldi')).toBe(false);
    expect(blocked('yasaknameyasak')).toBe(true);
  });
});

describe('loadAutomodLists', () => {
  it('prod ortamında dosya yolu yoksa başlatmaz', () => {
    expect(() => loadAutomodLists({ NODE_ENV: 'production' })).toThrow();
  });

  it('geliştirmede dosya yolu yoksa boş liste döner', () => {
    expect(loadAutomodLists({ NODE_ENV: 'development' })).toEqual({ words: [], safePrefixes: [] });
  });

  it('örnek dosyayı okur', () => {
    const lists = loadAutomodLists({
      AUTOMOD_WORDS_FILE: `${__dirname}/../../../config/automod-words.example.json`,
    });
    expect(lists.words.length).toBeGreaterThan(0);
    expect(Array.isArray(lists.safePrefixes)).toBe(true);
  });

  it('bozuk ya da boş listeyi reddeder', () => {
    expect(() =>
      loadAutomodLists({ AUTOMOD_WORDS_FILE: `${__dirname}/../../../package.json` }),
    ).toThrow();
  });
});
