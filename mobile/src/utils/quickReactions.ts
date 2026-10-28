import { useAuthStore } from '@/stores/auth';

/**
 * Varsayılanın tek kaynağı sunucudur (C24 §0.2); oturum kullanıcısı her zaman etkin listeyi taşır.
 * Bu sabit YALNIZ alanın henüz gelmediği bayat oturum için savunmadır.
 */
const FALLBACK_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢'];

export function useQuickReactions(): string[] {
  return useAuthStore((s) => s.user?.quickReactions) ?? FALLBACK_QUICK_REACTIONS;
}
