import { fitCropToAspect, isValidCrop } from './crop-math';

describe('crop-math (C13b R7)', () => {
  describe('isValidCrop', () => {
    const ok = { x: 0.1, y: 0.25, width: 0.8, height: 0.32 };
    it('geçerli kesirler', () => {
      expect(isValidCrop(ok)).toBe(true);
      expect(isValidCrop({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
      // kayan nokta payı (1.0001)
      expect(isValidCrop({ x: 0.3, y: 0, width: 0.7000999, height: 1 })).toBe(true);
    });
    it('negatif, sıfır boyut, 1 üstü toplam, NaN/Infinity, tür hatası → geçersiz', () => {
      expect(isValidCrop({ ...ok, x: -0.01 })).toBe(false);
      expect(isValidCrop({ ...ok, y: -1 })).toBe(false);
      expect(isValidCrop({ ...ok, width: 0 })).toBe(false);
      expect(isValidCrop({ ...ok, height: -0.1 })).toBe(false);
      expect(isValidCrop({ ...ok, x: 0.5, width: 0.6 })).toBe(false);
      expect(isValidCrop({ ...ok, y: 0.9, height: 0.2 })).toBe(false);
      expect(isValidCrop({ ...ok, x: NaN })).toBe(false);
      expect(isValidCrop({ ...ok, width: Infinity })).toBe(false);
      expect(isValidCrop({ ...ok, x: '0.1' })).toBe(false);
      expect(isValidCrop({ x: 0, y: 0, width: 1 })).toBe(false);
      expect(isValidCrop(null)).toBe(false);
      expect(isValidCrop([0, 0, 1, 1])).toBe(false);
      expect(isValidCrop('crop')).toBe(false);
    });
  });

  describe('fitCropToAspect', () => {
    it('crop yok: merkez "cover" (kare: yatay kaynak, afiş 5:2: dikey kaynak)', () => {
      expect(fitCropToAspect(undefined, 400, 200, 1)).toEqual({
        left: 100,
        top: 0,
        width: 200,
        height: 200,
      });
      expect(fitCropToAspect(undefined, 200, 400, 2.5)).toEqual({
        left: 0,
        top: 160,
        width: 200,
        height: 80,
      });
    });
    it('1:1 — zaten kare seçim aynen piksele çevrilir', () => {
      expect(fitCropToAspect({ x: 0.25, y: 0, width: 0.5, height: 1 }, 400, 200, 1)).toEqual({
        left: 100,
        top: 0,
        width: 200,
        height: 200,
      });
    });
    it('oran bozuksa uzun kenar kısaltılır, MERKEZ korunur', () => {
      // 1000x1000 kaynakta 800x320 seçim, kare isteniyor → 320x320, merkez (500, 410)
      const r = fitCropToAspect({ x: 0.1, y: 0.25, width: 0.8, height: 0.32 }, 1000, 1000, 1);
      expect(r).toEqual({ left: 340, top: 250, width: 320, height: 320 });
      expect(r.left + r.width / 2).toBe(500);
      expect(r.top + r.height / 2).toBe(410);
    });
    it('5:2 — yükseklik fazlaysa yükseklik kısaltılır, merkez korunur', () => {
      // 500x500 seçim → 500x200, merkez y=500 → top 400
      const r = fitCropToAspect({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 1000, 1000, 2.5);
      expect(r).toEqual({ left: 250, top: 400, width: 500, height: 200 });
    });
    it('5:2 — istemci yuvarlama hatası düzeltilir (reddedilmez)', () => {
      const r = fitCropToAspect({ x: 0, y: 0, width: 1, height: 0.4001 }, 1000, 1000, 2.5);
      expect(r.width / r.height).toBeCloseTo(2.5, 1);
      expect(r.top).toBeGreaterThanOrEqual(0);
    });
    it('kaynak sınırına kıstırılır (1.0001 payı taşmaz)', () => {
      const r = fitCropToAspect({ x: 0.5, y: 0.5, width: 0.5001, height: 0.5001 }, 100, 100, 1);
      expect(r.left + r.width).toBeLessThanOrEqual(100);
      expect(r.top + r.height).toBeLessThanOrEqual(100);
      const e = fitCropToAspect({ x: 0, y: 0, width: 1.0001, height: 1.0001 }, 333, 777, 2.5);
      expect(e.left).toBeGreaterThanOrEqual(0);
      expect(e.left + e.width).toBeLessThanOrEqual(333);
      expect(e.top + e.height).toBeLessThanOrEqual(777);
    });
    it('çok küçük seçim en az 1px, sonuç tamsayı', () => {
      const r = fitCropToAspect({ x: 0.5, y: 0.5, width: 0.0001, height: 0.0001 }, 100, 100, 1);
      expect(r.width).toBeGreaterThanOrEqual(1);
      expect(r.height).toBeGreaterThanOrEqual(1);
      for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
    });
    it('geçersiz kaynak boyutu / oran → hata', () => {
      expect(() => fitCropToAspect(undefined, 0, 100, 1)).toThrow();
      expect(() => fitCropToAspect(undefined, 100.5, 100, 1)).toThrow();
      expect(() => fitCropToAspect(undefined, 100, 100, 0)).toThrow();
    });
  });
});
