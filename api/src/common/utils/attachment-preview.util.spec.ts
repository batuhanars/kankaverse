import { previewFromAttachments } from './attachment-preview.util';

describe('previewFromAttachments', () => {
  it('içerik doluysa aynen döner (ek olsa da)', () => {
    expect(previewFromAttachments('selam', [{ contentType: 'audio/mp4' }])).toBe('selam');
  });

  it('boş içerik + ses → 🎤 Sesli mesaj (görselden önce)', () => {
    expect(
      previewFromAttachments('  ', [{ contentType: 'image/png' }, { contentType: 'audio/webm' }]),
    ).toBe('🎤 Sesli mesaj');
  });

  it('boş içerik + video → 🎥 Video (görselden önce, sesten sonra)', () => {
    expect(
      previewFromAttachments('', [{ contentType: 'image/png' }, { contentType: 'video/mp4' }]),
    ).toBe('🎥 Video');
    expect(
      previewFromAttachments('', [{ contentType: 'video/mp4' }, { contentType: 'audio/mp4' }]),
    ).toBe('🎤 Sesli mesaj');
  });

  it('boş içerik + görsel → 📷 Görsel', () => {
    expect(previewFromAttachments('', [{ contentType: 'image/jpeg' }])).toBe('📷 Görsel');
  });

  it('boş içerik + diğer → 📎 Dosya', () => {
    expect(previewFromAttachments('', [{ contentType: 'application/pdf' }])).toBe('📎 Dosya');
  });

  it('boş içerik, ek yok → boş string', () => {
    expect(previewFromAttachments('', [])).toBe('');
    expect(previewFromAttachments(undefined, undefined)).toBe('');
  });
});
