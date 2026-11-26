import { useAuthStore } from '@/stores/auth';
import { usersApi } from '@/api/users';

/**
 * Varsayılanın tek kaynağı sunucudur (C24 §0.2); oturum kullanıcısı her zaman etkin listeyi taşır.
 * Bu sabit YALNIZ alanın henüz gelmediği bayat oturum için savunmadır.
 */
const FALLBACK_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

export function useQuickReactions(): string[] {
  return useAuthStore((s) => s.user?.quickReactions) ?? FALLBACK_QUICK_REACTIONS;
}

/**
 * C24 §0.3 yuva değişimi: `index` yuvasına `emoji` konur; emoji başka yuvadaysa ikisi yer değiştirir (tekrar
 * yok). Değişiklik yoksa null. Hızlı tepki ekranı ve emoji listesindeki "Varsayılan tepkiler" (C81) ortak kullanır.
 */
export function replaceSlot(current: string[], index: number, emoji: string): string[] | null {
  if (current[index] === emoji) return null;
  const next = [...current];
  const other = next.indexOf(emoji);
  if (other !== -1) next[other] = current[index];
  next[index] = emoji;
  return next;
}

/** `PATCH /users/me`; başarıda sunucunun döndüğü kullanıcı store'a yazılır, şerit anında değişir. Boş dizi = varsayılan. */
export async function saveQuickReactions(next: string[]): Promise<void> {
  const updated = await usersApi.updateProfile({ quickReactions: next });
  useAuthStore.getState().updateUser(updated);
}
