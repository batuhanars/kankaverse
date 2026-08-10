import { computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { useDmStore } from '@/stores/dm'
import { useCallStore } from '@/stores/call'
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
  const dmStore = useDmStore()
  const callStore = useCallStore()
  const router = useRouter()
  const { t } = i18n.global

  // Gelen arama bildirimi — Electron VE düz tarayıcıda çalışır (ikisi de standart Notification
  // API'sini destekler); mesaj toast'larının/rozetin aksine masaüstüne özel değil, bu yüzden
  // aşağıdaki `isElectron` kapısından ÖNCE kurulur. `window.kankaverse` yoksa `focusWindow()`
  // opsiyonel zincirle sessizce atlanır.
  //
  // Kaynak tek nokta: `callStore.incoming.channelId`. IncomingCallModal.vue AYNI alanı izliyor
  // (zil sesi + 30sn oto-red için) — kabul/ret/zaman aşımı/arayan iptali/grup iptali HEPSİ
  // `useCall.ts`/`useSocket.ts` üzerinden `callStore.clearIncoming()`e çıkıyor. Tek noktadan
  // izlemek, her ölüm dalını ayrı ayrı dinlemek yerine bildirimi de aynı yaşam döngüsüne bağlar —
  // mobilin "hayalet zil" kusurunun (M4z §F, ortada olmayan bir çağrı çalıyordu) bildirim
  // karşılığını yapısal olarak imkansız kılar.
  let callNotif: Notification | null = null
  watch(
    () => callStore.incoming?.channelId,
    (id) => {
      // Önceki bildirim her koşulda kapanır: yeni bir çağrı geldiğinde de, mevcut çağrı
      // bittiğinde de (kabul/ret/iptal/zaman aşımı) — arkada asılı toast kalmasın.
      callNotif?.close()
      callNotif = null
      if (!id || !document.hidden) return
      // 🔴 Sahip cihaz turu 2026-08-10 — burada ÖNCE `permission !== 'granted'` kontrolü vardı ve
      // masaüstünde arama bildirimi hiç çıkmıyordu. Sebep: Electron bildirimi izin istemeden
      // gösterir ama `Notification.permission` çoğu zaman `default` döner; kontrol bildirimi
      // daha doğmadan eliyordu. Kanıt: aynı dosyadaki MESAJ toast'ında böyle bir kontrol YOK ve
      // o çalışıyordu. Kural artık yalnız AÇIKÇA reddedilmiş durumu eler; tarayıcıda izin
      // verilmemişse `new Notification` zaten sessizce başarısız olur (aşağıdaki try/catch).
      if (typeof Notification === 'undefined' || Notification.permission === 'denied') return

      const call = callStore.incoming
      if (!call) return
      const actor = call.caller.username
      const body =
        call.kind === 'group'
          ? t('notification.incomingGroupCall', { actor })
          : t('notification.incomingCall', { actor })

      // `tag` aynı anda tek gelen-arama bildirimi kalmasını garanti eder (ikinci `new
      // Notification` aynı tag'la öncekinin yerine geçer) — referansı da yine de tutuyoruz ki
      // yukarıdaki erken `close()` çağrıları görsel olarak da anında kapatsın.
      // İzin `default` iken tarayıcılar `new Notification` çağrısında hata fırlatabiliyor
      // (Electron fırlatmaz, gösterir). Gelen arama akışını bir bildirim hatası yüzünden
      // patlatmak kabul edilemez: sarmalanıyor, başarısızlıkta zil + modal yoluna devam edilir.
      try {
        callNotif = new Notification(t('notification.nativeTitle'), {
          body,
          tag: 'kankaverse-incoming-call',
        })
        callNotif.onclick = () => {
          window.kankaverse?.focusWindow()
          void router.push({ name: 'dm', params: { channelId: call.channelId } })
        }
      } catch {
        callNotif = null
      }
    },
  )

  // Yalnız Electron'da aktif et (mesaj toast + rozet)
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

  // Simge rozeti = "sana yönelik" okunmamışlar: bildirim sayısı (bahsetme + arkadaş
  // isteği + davet) + okunmamış DM sayısı. Genel kanal mesajları BİLİNÇLİ olarak dahil
  // değil — aktif toplulukta rozetin sürekli yanıp anlamsızlaşmasını önler (Discord/Slack
  // modeli). Kanal okunmamışlığı uygulama içi rail rozetlerinde kalır.
  const badgeCount = computed(
    () => notificationsStore.unreadCount + dmStore.channels.filter((c) => c.unread).length,
  )
  watch(
    badgeCount,
    (count) => {
      window.kankaverse?.setBadge?.(count)
    },
    { immediate: true },
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
      case 'EVENT_CREATED':
        // R14 — masaüstü toast'ta sessizce düşmesin; metin çandakiyle aynı anahtardan
        body = t('notification.eventCreated', { actor, event: dto.preview ?? '' })
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
    } else if (dto.type === 'FRIEND_REQUEST' || dto.type === 'FRIEND_ACCEPT') {
      router.push({ name: 'app' }) // HomeView → kankaları göster
    } else if (dto.type === 'GUILD_INVITE' && dto.guildId) {
      router.push({ name: 'app' }) // davet; invite akışı ayrı
    } else {
      // Hedef bilinmiyorsa sadece pencereyi öne getir (yönlendirme olmadan)
    }
  }
}
