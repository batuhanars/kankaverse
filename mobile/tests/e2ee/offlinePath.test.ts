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
    'e2ee/cryptoMetrics.ts', // E3 Rev.4: push-crypto ölçüm sarmalayıcısı
  ])('%s setTimeout/setInterval içermez', (file) => {
    expect(read(file)).not.toMatch(/setTimeout|setInterval/);
  });

  it('hızlı cevap ağlı motor kurulumuna (initE2ee) dönmez', () => {
    expect(read('notifications/quickReply.ts')).not.toMatch(/prepareHeadlessEngine|initE2ee|startMobileEngine/);
  });
});

// E3 Rev.4 §11: tutulan push penceresinde tek çizim ve "bitti" sinyali her çıkışta (finally) verilir; sinyal
// verilmezse Kotlin 8 sn bekler. Kural kaynak düzeyinde sabitlenir (native modül cihazsız çalıştırılamaz).
describe('tutulan push penceresi (Rev.4)', () => {
  const push = read('notifications/conversationPush.ts');

  it('modül dosyası setTimeout/setInterval içermez', () => {
    const src = readFileSync(new URL('../../modules/conversation-notification/index.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/setTimeout|setInterval/);
  });

  it('pushHandled finally içinde, yalnız tutma modunda çağrılır', () => {
    expect(push).toMatch(/finally \{\s*if \(holding && m\.messageId\) await pushHandled\(/);
  });

  it('tutma yolu tek çizim: presentOnce çözer sonra tek showConversationNotification', () => {
    const body = push.slice(push.indexOf('async function presentOnce'), push.indexOf('TaskManager.defineTask('));
    expect(body.match(/showConversationNotification\(/g)).toHaveLength(1);
    expect(body).not.toContain('updateNotificationMessageText');
    expect(body.indexOf('decryptOfflineForPush')).toBeLessThan(body.indexOf('showConversationNotification('));
  });
});
