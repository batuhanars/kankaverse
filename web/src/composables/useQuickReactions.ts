import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢']

/** C24: oturum kullanıcısının hızlı tepki beşlisi; alan bayat oturumda yoksa varsayılana düşer. */
export function useQuickReactions() {
  const authStore = useAuthStore()
  return computed(() => authStore.user?.quickReactions ?? DEFAULT_QUICK_REACTIONS)
}
