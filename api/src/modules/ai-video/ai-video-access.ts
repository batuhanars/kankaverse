import { ConfigService } from '@nestjs/config';

/**
 * R7 — yapay zeka video kapısının TEK noktası (para harcar, kullanıcı içeriği üçüncü tarafa gider).
 * Guard (sunucu otoritesi) ve oturum DTO'sundaki `aiVideoAllowed` (arayüz ipucu) AYNI fonksiyonu çağırır.
 * Bayrak + anahtar + açık liste + reşit olmama kapısı; isModerator BİLEREK yetmez (yetki kendiliğinden yayılmasın).
 */
export function canUseAiVideo(
  config: ConfigService,
  user: { id: string; isMinor: boolean },
): boolean {
  if (user.isMinor) return false; // Pika şartı 18+; bugün listede minör yok ama kapı kodda durur
  if (config.get<boolean>('aiVideo.enabled') !== true) return false;
  if (!config.get<string>('aiVideo.apiKey')) return false;
  const ids = config.get<string[]>('aiVideo.userIds') ?? [];
  return ids.includes(user.id);
}

/**
 * C33 — pasif tanıtım (YALNIZ arayüz ipucu; sunucu otoritesi `canUseAiVideo` + guard, ikisi DEĞİŞMEDİ).
 * Reşit olan herkes düğmeyi görür (kilitli modda); minör asla. Bayrak kapalıysa kimse görmez.
 * Kilitli istemci hiçbir yapay zeka ucunu çağırmaz; çağırırsa guard bugünkü gibi reddeder.
 */
export function canPreviewAiVideo(config: ConfigService, user: { isMinor: boolean }): boolean {
  return !user.isMinor && config.get<boolean>('aiVideo.enabled') === true;
}
