import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { findActiveAiVideoGrant, isAiVideoEnvListed } from './ai-video-grant';

/**
 * R7 — yapay zeka video kapısının TEK noktası (para harcar, kullanıcı içeriği üçüncü tarafa gider).
 * Guard (sunucu otoritesi) ve oturum DTO'sundaki `aiVideoAllowed` (arayüz ipucu) AYNI fonksiyonu çağırır.
 * Bayrak + anahtar + (açık liste VEYA etkin admin hakkı) + reşit olmama kapısı (C40: async); isModerator BİLEREK yetmez (yetki kendiliğinden yayılmasın).
 */
export async function canUseAiVideo(
  config: ConfigService,
  prisma: PrismaService,
  user: { id: string; isMinor: boolean },
): Promise<boolean> {
  if (user.isMinor) return false; // Pika şartı 18+; env listesi de admin hakkı da minöre geçmez
  if (config.get<boolean>('aiVideo.enabled') !== true) return false;
  if (!config.get<string>('aiVideo.apiKey')) return false;
  if (isAiVideoEnvListed(config, user.id)) return true;
  // C40: admin hakkı (kredi bütçesi + isteğe bağlı bitiş). Env listesindekiler bu sorguya hiç gitmez.
  return (await findActiveAiVideoGrant(prisma, user.id)) !== null;
}

/**
 * C33 — pasif tanıtım (YALNIZ arayüz ipucu; sunucu otoritesi `canUseAiVideo` + guard, ikisi DEĞİŞMEDİ).
 * Reşit olan herkes düğmeyi görür (kilitli modda); minör asla. Bayrak kapalıysa kimse görmez.
 * Kilitli istemci hiçbir yapay zeka ucunu çağırmaz; çağırırsa guard bugünkü gibi reddeder.
 */
export function canPreviewAiVideo(config: ConfigService, user: { isMinor: boolean }): boolean {
  return !user.isMinor && config.get<boolean>('aiVideo.enabled') === true;
}
