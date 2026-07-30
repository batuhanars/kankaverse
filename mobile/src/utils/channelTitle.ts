import type { DmChannelDto } from '@/api/dm';
import { t } from '@/i18n';

/**
 * Bir DM/grup kanalının kullanıcıya gösterilecek adı.
 *
 * **Neden tek yerde (Rule of Three, 2026-07-30):** aynı mantık üç yere kopyalanmıştı — `DmSidebar`
 * (liste satırı), `dmRoute` (sohbet başlığı) ve `group/[id].tsx` (yönetim ekranı başlığı). Üçüncüsü
 * **kopyayı yanlış yapmıştı**: `channel.name || t('group.noName')` diyerek üye adları yedeğini
 * atlıyordu, yani adsız grup listede "ahmet, mehmet" görünürken yönetim ekranında jenerik "Grup"
 * oluyordu. M1b R3 ile grup adı kurma anında SORULMADIĞI için (adsız grup artık istisna değil kural)
 * bu sapma neredeyse tüm gruplarda görünür hâle geldi.
 *
 * Sunucu adsız grupta `name = null` saklar (`dm.service.ts` `name: dto.name ?? null`) — üye adlarını
 * birleştiren taraf İSTEMCİDİR. Yani bu dosya o sözleşmenin tek sahibi.
 */
export function channelTitle(channel: DmChannelDto): string {
  if (channel.type === 'DM') return channel.otherUser.username;
  if (channel.name) return channel.name;
  return membersTitle(channel.members.map((m) => m.username));
}

/** Adsız grup yedeği: 3'e kadar isim yan yana, fazlası "+N" ile kısaltılır. Hiç üye yoksa jenerik ad. */
function membersTitle(names: string[]): string {
  if (names.length === 0) return t('group.noName');
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
