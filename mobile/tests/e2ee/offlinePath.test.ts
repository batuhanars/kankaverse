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
