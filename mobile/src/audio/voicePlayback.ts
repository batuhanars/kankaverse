/**
 * Sprint M6b §2 — "aynı anda tek ses çalar". Uygulama genelinde TEK bir "şu an çalan" kaydı:
 * yeni bir sesli mesaj çalmaya başlarken `claimPlayback` öncekinin durdurucusunu çağırır.
 *
 * Store yerine modül-seviyesi değişken BİLEREK: bu durum hiçbir ekranı yeniden çizdirmiyor (her
 * oynatıcı kendi çalma durumunu kendi `useAudioPlayerStatus`undan okuyor), yalnız "kimi durdur"
 * bilgisi. Başka modül import ETMEZ — `stores/*` import döngüsüne yeni kenar eklemez.
 */
let stopCurrent: (() => void) | null = null;

/** Çalmaya başlayan oynatıcı çağırır; önceki farklı oynatıcı varsa onu durdurur. */
export function claimPlayback(stop: () => void): void {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

/** Oynatıcı durunca/sökülünce çağrılır; yalnız kayıt hâlâ ona aitse temizler. */
export function releasePlayback(stop: () => void): void {
  if (stopCurrent === stop) stopCurrent = null;
}
