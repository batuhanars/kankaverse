import {
  buildAttachmentContentDisposition,
  sanitizeDownloadFilename,
} from './content-disposition.util';

const FB = 'kankaverse-abc.mp4';

describe('buildAttachmentContentDisposition', () => {
  it('düz ASCII ad: iki parametre de aynı ad', () => {
    expect(buildAttachmentContentDisposition('video.mp4', FB)).toBe(
      `attachment; filename="video.mp4"; filename*=UTF-8''video.mp4`,
    );
  });

  it('Türkçe karakter: ASCII yedekte _, filename* yüzde kodlu UTF-8', () => {
    const h = buildAttachmentContentDisposition('Çiğdem şöyle.png', FB);
    expect(h).toContain('filename="_i_dem __yle.png"');
    expect(h).toContain("filename*=UTF-8''%C3%87i%C4%9Fdem%20%C5%9F%C3%B6yle.png");
  });

  it('tırnak, ters bölü ve bölü temizlenir', () => {
    const h = buildAttachmentContentDisposition('a"b\\c/d.png', FB);
    expect(h).toBe(`attachment; filename="abcd.png"; filename*=UTF-8''abcd.png`);
  });

  it('kontrol karakterleri (CR/LF/NUL/TAB) temizlenir, başlık enjeksiyonu olmaz', () => {
    const h = buildAttachmentContentDisposition('a\r\nSet-Cookie: x\u0000\tb.png', FB);
    expect(h).not.toMatch(/[\r\n\u0000\t]/);
    expect(h).toContain('filename="aSet-Cookie: xb.png"');
  });

  it("RFC 5987 özel karakterleri (' ( ) * !) kodlanır", () => {
    const h = buildAttachmentContentDisposition("o'(a)*!.png", FB);
    expect(h).toContain("filename*=UTF-8''o%27%28a%29%2A%21.png");
  });

  it('boş / yalnız tehlikeli karakterli ad yedeğe düşer', () => {
    expect(buildAttachmentContentDisposition('', FB)).toContain(`filename="${FB}"`);
    expect(buildAttachmentContentDisposition('  "\/ ', FB)).toContain(`filename="${FB}"`);
  });

  it('eşleşmemiş vekil karakter patlatmaz', () => {
    expect(() => buildAttachmentContentDisposition('a\uD800b.png', FB)).not.toThrow();
  });

  it('emoji (vekil çifti) tek _ olur', () => {
    const h = buildAttachmentContentDisposition('😀.gif', FB);
    expect(h).toContain('filename="_.gif"');
    expect(h).toContain("filename*=UTF-8''%F0%9F%98%80.gif");
  });
});

describe('sanitizeDownloadFilename', () => {
  it('kırpar ve yedeği yalnız boşken kullanır', () => {
    expect(sanitizeDownloadFilename('  x.png ', FB)).toBe('x.png');
    expect(sanitizeDownloadFilename('   ', FB)).toBe(FB);
  });
});
