import { describe, expect, it } from 'vitest';
import { notificationText } from '../../src/notifications/notificationText';

const GENERIC = 'Yeni şifreli mesaj';
const HIDDEN = 'Yeni mesaj';

describe('notificationText (D94)', () => {
  it('ayar açık: çözüldüyse gerçek metin', () => {
    expect(notificationText(GENERIC, 'selam', false, HIDDEN)).toBe('selam');
  });
  it('ayar açık: çözülemediyse ya da şifresizse genel metin', () => {
    expect(notificationText(GENERIC, null, false, HIDDEN)).toBe(GENERIC);
    expect(notificationText('düz metin', null, false, HIDDEN)).toBe('düz metin');
  });
  it('ayar kapalı: çözüldü / çözülemedi / şifresiz hepsinde gizli metin, hiçbir içerik sızmaz', () => {
    expect(notificationText(GENERIC, 'selam', true, HIDDEN)).toBe(HIDDEN);
    expect(notificationText(GENERIC, null, true, HIDDEN)).toBe(HIDDEN);
    expect(notificationText('düz metin', null, true, HIDDEN)).toBe(HIDDEN);
  });
});
