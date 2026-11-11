import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeFrankingTag, frankingCanon, verifyFrankingTag } from './e2ee-franking.util';

// Vektörler `shared/e2ee-core/test/vectors/franking.json` dosyasının BAYT BAYT kopyası
// (kaynak: dal feat/e2ee-e4-core, commit 2a2f25f). Çekirdek ile api aynı vektörlerle sınanır;
// biri değişirse diğeri kırılır. Güncellerken ikisini birlikte güncelle.
interface Vector {
  name: string;
  input: { channelId: string; senderDeviceId: string; body: string; sentAt: number };
  fk: string;
  canon: string;
  tag: string;
}
const vectors: Vector[] = JSON.parse(
  readFileSync(join(__dirname, '../../../test/fixtures/franking-vectors.json'), 'utf8'),
);

describe('franking kanonik biçim + HMAC (çekirdek vektörleri)', () => {
  it('6 vektör var', () => {
    expect(vectors).toHaveLength(6);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s: canon ve tag birebir', (_n, v) => {
    expect(frankingCanon(v.input)).toBe(v.canon);
    const fk = Buffer.from(v.fk, 'base64');
    expect(computeFrankingTag(fk, v.input).toString('base64')).toBe(v.tag);
    expect(verifyFrankingTag(fk, Buffer.from(v.tag, 'base64'), v.input)).toBe(true);
  });

  it('gövde/kanal/cihaz/zaman değişince doğrulanmaz', () => {
    const v = vectors[0];
    const fk = Buffer.from(v.fk, 'base64');
    const tag = Buffer.from(v.tag, 'base64');
    expect(verifyFrankingTag(fk, tag, { ...v.input, body: v.input.body + '!' })).toBe(false);
    expect(verifyFrankingTag(fk, tag, { ...v.input, channelId: 'x' })).toBe(false);
    expect(verifyFrankingTag(fk, tag, { ...v.input, senderDeviceId: 'x' })).toBe(false);
    expect(verifyFrankingTag(fk, tag, { ...v.input, sentAt: v.input.sentAt + 1 })).toBe(false);
  });

  it('uzunluk farkı (kısa tag / kısa anahtar) atmaz, false döner', () => {
    const v = vectors[0];
    const fk = Buffer.from(v.fk, 'base64');
    const tag = Buffer.from(v.tag, 'base64');
    expect(verifyFrankingTag(fk, tag.subarray(0, 31), v.input)).toBe(false);
    expect(verifyFrankingTag(fk.subarray(0, 16), tag, v.input)).toBe(false);
  });
});
