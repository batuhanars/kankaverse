import { watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { i18n } from '@/i18n'
import type { NotificationDto } from '@/types'

/**
 * Electron native bildirim katmanı (Sprint Electron — §5).
 *
 * Mevcut `notifications` store'una DOKUNMAZ; yalnız `items` listesini izler.
 * Koşullar: Electron'da çalışıyor (`window.kankaverse?.isElectron`) VE
 * uygulama görünür değil (`document.hidden`) → OS toast üretir.
 *
 * Tıklanınca → pencereyi öne getir + bildirim hedefine yönlendir.
 * Rozet (opsiyonel) → okunmamış toplam değişince görev çubuğuna/dock'a yansıt.
 *
 * AppShell'de bir kez mount edilir; birden fazla bağlantı zararlıdır (duplicate toast).
 */
export function useNativeNotifications() {
  const notificationsStore = useNotificationsStore()
  const router = useRouter()
  const { t } = i18n.global

  // Yalnız Electron'da aktif et
  if (!window.kankaverse?.isElectron) return

  // Son bilinen items uzunluğu — artış = yeni bildirim geldi
  const prevLength = ref(notificationsStore.items.length)

  // items.length izle; unshift dizi referansını değiştirmez ama length'i değiştirir.
  // length arttığında yeni öğe(ler) dizinin başındadır (handleIncoming → unshift).
  watch(
    () => notificationsStore.items.length,
    (currentLength) => {
      if (currentLength > prevLength.value && document.hidden) {
        const items = notificationsStore.items
        const newCount = currentLength - prevLength.value
        for (let i = newCount - 1; i >= 0; i--) {
          _fireToast(items[i])
        }
      }
      prevLength.value = currentLength
    },
  )

  // Okunmamış sayısı değişince rozeti güncelle (opsiyonel)
  watch(
    () => notificationsStore.unreadCount,
    (count) => {
      window.kankaverse?.setBadge?.(count)
    },
  )

  function _fireToast(dto: NotificationDto) {
    const actor = dto.actor?.username ?? t('notification.someone')
    const guild = dto.guildName ?? ''

    let body: string
    switch (dto.type) {
      case 'MENTION':
        body = t('notification.mention', { actor })
        break
      case 'FRIEND_REQUEST':
        body = t('notification.friendRequest', { actor })
        break
      case 'FRIEND_ACCEPT':
        body = t('notification.friendAccept', { actor })
        break
      case 'GUILD_INVITE':
        body = t('notification.guildInvite', { actor, guild })
        break
      default:
        body = actor
    }

    const title = t('notification.nativeTitle')
    const notif = new Notification(title, {
      body,
      // Electron'da /src/assets/brand/... yolu yerine ana domain'deki favicon kullanılır.
      // Electron kendisi uygulama ikonunu zaten gösterir; icon alanı boş bırakılabilir.
    })

    notif.onclick = () => {
      window.kankaverse?.focusWindow()
      _navigate(dto)
    }
  }

  function _navigate(dto: NotificationDto) {
    if (dto.type === 'MENTION' && dto.guildId && dto.channelId) {
      router.push({ name: 'channel', params: { guildId: dto.guildId, channelId: dto.channelId } })
    } else if ((dto.type === 'FRIEND_REQUEST' || dto.type === 'FRIEND_ACCEPT') ) {
      router.push({ name: 'app' }) // HomeView → kankaları göster
    } else if (dto.type === 'GUILD_INVITE' && dto.guildId) {
      router.push({ name: 'app' }) // davet; invite akışı ayrı
    } else {
      // Hedef bilinmiyorsa sadece pencereyi öne getir (yönlendirme olmadan)
    }
  }
}
