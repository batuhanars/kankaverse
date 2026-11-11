import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// E3 Rev.2 §9 ilke 2: bildirim yolunda ağ, oturum yenileme ve ağlı motor kurulumu YOK. Native modüller
// cihazsız çalıştırılamadığından kural kaynak düzeyinde sabitlenir: bu dosyalar aşağıdakilere dokunamaz.
const FORBIDDEN = /prepareHeadlessEngine|refreshAccessToken|authApi|initE2ee|startMobileEngine|decryptForNotification|@\/api\//;

const read = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

describe('bildirim çözme yolu ağsızdır', () => {
  it.each(['notifications/offlineDecrypt.ts', 'notifications/conversationPush.ts'])('%s yasaklı çağrı içermez', (file) => {
    expect(read(file)).not.toMatch(FORBIDDEN);
  });

  it('yerel motor ağ portu olmadan açılır (E2eeEngine.openLocal)', () => {
    const src = read('e2ee/startEngine.ts');
    const body = src.slice(src.indexOf('export function openLocalMobileEngine'), src.indexOf('export function startMobileEngine'));
    expect(body).toContain('E2eeEngine.openLocal');
    expect(body).not.toMatch(/api:|mobileE2eeApi/);
  });
});

// E3 Rev.3 §10 kural 1: RN arka planda (aktif HeadlessJs görevi yokken) JS zamanlayıcılarını durdurur; bu yollarda
// setTimeout/setInterval (mola, bekleme, zaman aşımı) kullanılırsa iş takılır. Kural kaynak düzeyinde sabitlenir.
// `yieldToUi` tanımı startEngine'de yalnız ÇEVRİMİÇİ motora geçer; çevrimdışı yolda çağrılmaması
// shared/e2ee-client testiyle sabittir.
describe('arka plan bildirim ve hızlı cevap yolunda zamanlayıcı yok', () => {
  it.each([
    'notifications/conversationPush.ts',
    'notifications/offlineDecrypt.ts',
    'notifications/quickReply.ts',
    'notifications/headlessEngine.ts',
    'notifications/ownAvatar.ts',
    'notifications/e2eePayload.ts',
  ])('%s setTimeout/setInterval içermez', (file) => {
    expect(read(file)).not.toMatch(/setTimeout|setInterval/);
  });

  it('hızlı cevap ağlı motor kurulumuna (initE2ee) dönmez', () => {
    expect(read('notifications/quickReply.ts')).not.toMatch(/prepareHeadlessEngine|initE2ee|startMobileEngine/);
  });
});
