import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  type: ToastType
  message: string
}

/** Otomatik kapanma süresi (ms). */
const AUTO_DISMISS_MS = 4000

/**
 * Global, anlık (ephemeral) başarı/hata/bilgi toast'ları.
 * C1 bell-bildirimlerinden AYRI: bunlar kalıcı değil, oturum-içi UI feedback.
 * Her toast kendi timer'ını taşır; id deterministik artan sayaç.
 */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let counter = 0
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function push(type: ToastType, message: string): number {
    const id = ++counter
    toasts.value.push({ id, type, message })
    timers.set(
      id,
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
    )
    return id
  }

  function dismiss(id: number) {
    const timer = timers.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.delete(id)
    }
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  const success = (message: string) => push('success', message)
  const error = (message: string) => push('error', message)
  const info = (message: string) => push('info', message)

  return { toasts, success, error, info, dismiss }
})
