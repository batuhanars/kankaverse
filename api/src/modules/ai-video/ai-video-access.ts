import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { findActiveAiVideoGrant } from './ai-video-grant';

/**
 * R7 — yapay zeka video kapısının TEK noktası (para harcar, kullanıcı içeriği üçüncü tarafa gider).
 * Guard (sunucu otoritesi) ve oturum DTO'sundaki `aiVideoAllowed` (arayüz ipucu) AYNI fonksiyonu çağırır.
 * Bayrak + anahtar + etkin admin hakkı + reşit olmama kapısı (C40: async); isModerator BİLEREK yetmez (yetki kendiliğinden yayılmasın).
 */
export async function canUseAiVideo(
  config: ConfigService,
  prisma: PrismaService,
  user: { id: string; isMinor: boolean },
): Promise<boolean> {
  // Pika şartı 18+; admin hakkı minöre geçmez. Minör + bayrak kontrolü canPreviewAiVideo'da TEK yerde.
  if (!canPreviewAiVideo(config, user)) return false;
  if (!config.get<string>('aiVideo.apiKey')) return false;
  // C40/C43: tek erişim kaynağı panelden tanımlı hak (kredi bütçesi + isteğe bağlı bitiş).
  return (await findActiveAiVideoGrant(prisma, user.id)) !== null;
}

/**
 * Minör + özellik bayrağı kapısı: hem `canUseAiVideo`nun ilk iki adımı hem C33 tanıtımı hem de C44 "kendi
 * verim" uçları (hak istemez) bu TEK fonksiyona bağlı; kopyası yok.
 * C33 — pasif tanıtım (arayüz ipucu). Reşit olan herkes düğmeyi görür (kilitli modda); minör asla. Bayrak kapalıysa kimse görmez.
 * Kilitli istemci hiçbir yapay zeka ucunu çağırmaz; çağırırsa guard bugünkü gibi reddeder.
 */
export function canPreviewAiVideo(config: ConfigService, user: { isMinor: boolean }): boolean {
  return !user.isMinor && config.get<boolean>('aiVideo.enabled') === true;
}
