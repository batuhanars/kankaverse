import { watch, onUnmounted } from 'vue'
import { i18n } from '@/i18n'
import { useCallStore } from '@/stores/call'
import { useCall } from '@/composables/useCall'

/**
 * Masaüstü gelen arama penceresi (C74). Uygulama tepsideyken ya da arkadayken ekranın ortasında
 * ayrı bir pencere açar; gösterip göstermemeye ana pencerenin durumuna bakarak main process karar
 * verir (§1). Bu composable yalnız "arama var/yok" bilgisini ve metinleri iletir.
 *
 * Yaşam döngüsü bugünkü toast'la aynı tek kaynaktan: `callStore.incoming.channelId`. Kabul, ret,
 * arayan iptali, 30 sn zaman aşımı hepsi `clearIncoming()`e çıktığı için pencere de hepsinde kapanır.
 *
 * Köprüde `showIncomingCall` yoksa (tarayıcı ya da 1.3.0 öncesi masaüstü) hiçbir şey yapmaz; o
 * durumda `useNativeNotifications` bugünkü toast'ı gösterir.
 *
 * IncomingCallModal'da bir kez çağrılır (AppShell'de tek kopya).
 */
export function useDesktopCallWindow() {
  const bridge = window.kankaverse
  if (!bridge?.showIncomingCall || !bridge.onCallAction) return

  const { t } = i18n.global
  const callStore = useCallStore()
  const { acceptCall, rejectCall } = useCall()

  watch(
    () => callStore.incoming?.channelId,
    (id) => {
      const call = callStore.incoming
      if (!id || !call) {
        bridge.hideIncomingCall?.()
        return
      }
      const { username, avatarUrl } = call.caller
      bridge.showIncomingCall?.({
        channelId: id,
        name: username,
        subtitle: call.kind === 'group' ? t('call.windowRingingGroup') : t('call.windowRinging'),
        // Arama penceresi yerel dosyadan açılır: göreli yol orada çözülmez, tam adrese çevrilir.
        avatarUrl: avatarUrl ? new URL(avatarUrl, window.location.href).href : null,
        initial: username[0]?.toUpperCase() ?? '?',
        acceptLabel: t('call.accept'),
        rejectLabel: t('call.reject'),
      })
    },
  )

  const unsubscribe = bridge.onCallAction(({ action, channelId }) => {
    // Pencere açıkken arama başka yoldan bittiyse (iptal, diğer cihazda kabul) bayat tıklamayı yut.
    if (callStore.incoming?.channelId !== channelId) return
    if (action === 'accept') void acceptCall(channelId)
    else rejectCall(channelId)
  })

  onUnmounted(() => {
    unsubscribe()
    bridge.hideIncomingCall?.()
  })
}
