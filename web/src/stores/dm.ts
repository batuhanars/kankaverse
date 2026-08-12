import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dmApi } from '@/api/dm'
import { useAuthStore } from '@/stores/auth'
import type { DmChannelDto, GroupDmMemberDto, MessageRequestDto } from '@/types'

export const useDmStore = defineStore('dm', () => {
  const channels = ref<DmChannelDto[]>([])
  const activeDmChannelId = ref<string | null>(null)

  // C9 — Mesaj İstekleri (bana gelen bekleyen istekler)
  const requests = ref<MessageRequestDto[]>([])
  const requestCount = computed(() => requests.value.length)

  async function fetchRequests() {
    const res = await dmApi.getRequests()
    requests.value = res.data
  }

  /** İsteği kabul et → ACCEPTED DM kanalı; listeden düş, kanal listesine ekle. */
  async function acceptRequest(channelId: string): Promise<DmChannelDto> {
    const res = await dmApi.acceptRequest(channelId)
    const channel = res.data
    requests.value = requests.value.filter((r) => r.channelId !== channelId)
    const idx = channels.value.findIndex((c) => c.id === channel.id)
    if (idx === -1) channels.value.unshift(channel)
    else channels.value[idx] = channel
    return channel
  }

  /** İsteği reddet (opsiyonel engelle) → listeden düş. */
  async function rejectRequest(channelId: string, block: boolean) {
    await dmApi.rejectRequest(channelId, block)
    requests.value = requests.value.filter((r) => r.channelId !== channelId)
  }

  async function fetchChannels() {
    const res = await dmApi.getChannels()
    channels.value = res.data
    // 🔴 Açık sohbetin rozeti sunucu yanıtıyla GERİ GELMESİN (mobilde sahip bulgusu
    // 2026-08-12, aynı kusur sınıfı burada da duruyordu — `applyActivity` listede olmayan bir
    // kanal görünce bu fonksiyonu çağırıyor). Sunucu `unread`i `lastReadAt`e göre hesaplıyor;
    // o an ekranda olan sohbete yeni mesaj düştüğünde `markRead` henüz gitmemiş olabiliyor ve
    // yanıt `true` dönüyor. Kural tek cümle: bakmakta olduğun sohbet okunmamış değildir.
    const active = channels.value.find((c) => c.id === activeDmChannelId.value)
    if (active) active.unread = false
  }

  async function openChannel(userId: string): Promise<DmChannelDto> {
    const res = await dmApi.openChannel(userId)
    const channel = res.data
    const idx = channels.value.findIndex((c) => c.id === channel.id)
    if (idx === -1) {
      channels.value.unshift(channel)
    } else {
      channels.value[idx] = channel
    }
    activeDmChannelId.value = channel.id
    return channel
  }

  async function markRead(channelId: string) {
    await dmApi.markRead(channelId)
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) ch.unread = false
  }

  /**
   * C12 §4.1 — WS `dm:read`: karşı taraf bu kanalı okudu.
   *
   * Kanal başına TEK tarih tutuluyor, mesaj başına durum yok: `otherReadAt`ten büyük olmayan
   * her kendi mesajım "görüldü" sayılır (`isSeen`). Bu yüzden tek bir alan güncellemesi o
   * sohbetteki bütün tikleri aynı anda doğru duruma geçiriyor.
   *
   * Gizlilik kararı SUNUCUDA: görmeye hakkımız yoksa olay hiç gelmiyor (`visibleReadAt`, R7).
   * Burada ek bir süzgeç yok; olsaydı kural iki yerde yaşardı.
   */
  function applyReadReceipt(payload: { channelId: string; readAt: string }) {
    const ch = channels.value.find((c) => c.id === payload.channelId)
    if (!ch || ch.type !== 'DM') return
    // Geriye gitme: yarış hâlinde eski bir olay yeni tarihi ezmesin.
    if (ch.otherReadAt && ch.otherReadAt >= payload.readAt) return
    ch.otherReadAt = payload.readAt
  }

  /**
   * C12 §4.2 — bir mesaj karşı tarafça görüldü mü. Yalnız KENDİ mesajlarım için anlamlı;
   * çağıran zaten yazarı kontrol ediyor. `otherReadAt` null ise (karşı taraf henüz hiç okumamış)
   * false döner — bu "gösterme" demek DEĞİL, "tek tik" demek (kapı `showsReceipts`te).
   */
  function isSeen(channelId: string, messageCreatedAt: string): boolean {
    const ch = channels.value.find((c) => c.id === channelId)
    if (!ch || ch.type !== 'DM' || !ch.otherReadAt) return false
    return messageCreatedAt <= ch.otherReadAt
  }

  /**
   * C12 §4.2 — bu kanalda tik çizilecek mi. Kaynak SUNUCUNUN gizlilik kararı (`receiptsEnabled`),
   * "okuma var mı" DEĞİL. İlk sürüm `otherReadAt`e bakıyordu ve karşı taraf sohbeti bir kez bile
   * açmadıysa tik hiç çizilmiyordu — ilk mesajda "İletildi" asla görünmüyordu (sahip bulgusu).
   */
  function showsReceipts(channelId: string): boolean {
    const ch = channels.value.find((c) => c.id === channelId)
    return !!ch && ch.type === 'DM' && ch.receiptsEnabled === true
  }

  function removeChannel(channelId: string) {
    channels.value = channels.value.filter((c) => c.id !== channelId)
    if (activeDmChannelId.value === channelId) activeDmChannelId.value = null
  }

  function setActiveChannel(channelId: string | null) {
    activeDmChannelId.value = channelId
  }

  function activeChannel(): DmChannelDto | null {
    return channels.value.find((c) => c.id === activeDmChannelId.value) ?? null
  }

  /**
   * WS `dm.message` → son mesaj + sıralama + okunmamış.
   *
   * Sprint WEB-PARITE §2.2 — `opts.countUnread === false` (susturulmuş / seviye `NONE` DM):
   * sohbet listede YAŞAMAYA devam eder (önizleme + sıralama güncellenir), yalnız `unread`
   * işaretlenmez. Süzgecin tek kaynağı `notificationPrefs.channelBadgeEffect`; burada ikinci
   * bir mute mantığı yok, çağıran (useSocket) kararı geçirir.
   */
  async function applyActivity(
    payload: {
      channelId: string
      lastMessage: { content: string; createdAt: string }
      senderId: string
    },
    opts?: { countUnread?: boolean },
  ) {
    const authStore = useAuthStore()
    const idx = channels.value.findIndex((c) => c.id === payload.channelId)

    if (idx !== -1) {
      const ch = channels.value[idx]
      // lastMessage alanlarını güncelle (MessageDto uyumlu — eksik alanlar korunur)
      if (ch.lastMessage) {
        ch.lastMessage.content = payload.lastMessage.content
        ch.lastMessage.createdAt = payload.lastMessage.createdAt
      } else {
        // Önceki lastMessage null idi — minimal şekle yaz
        ch.lastMessage = {
          id: '',
          channelId: payload.channelId,
          content: payload.lastMessage.content,
          replyToId: null,
          author: { id: payload.senderId, username: '', avatarUrl: null },
          createdAt: payload.lastMessage.createdAt,
          editedAt: null,
          pinnedAt: null,
        }
      }

      // Kanalı listenin başına taşı (en güncel üste)
      channels.value.splice(idx, 1)
      channels.value.unshift(ch)

      // Unread: kendi mesajım DEĞİLSE, aktif DM DEĞİLSE ve tercih susturmuyorsa set et
      const myId = authStore.user?.id
      if (payload.channelId === activeDmChannelId.value) {
        // Açık sohbette rozet HER ZAMAN düşer: bayrak bir yarış yüzünden (bkz. `fetchChannels`
        // notu) takılı kalmış olabilir ve yeni mesajın ekranda görünmesi onu temizlemek için
        // doğru an. Önceden bu dal yalnız "set etme" diyordu, düşürmüyordu.
        ch.unread = false
      } else if (opts?.countUnread !== false && payload.senderId !== myId) {
        ch.unread = true
      }
    } else {
      // Alıcının listesinde henüz yok (yeni DM / grup) — listeyi tazele
      await fetchChannels()
    }
  }

  // Sprint 12 — Grup DM aksiyonları

  async function createGroup(memberIds: string[], name?: string): Promise<DmChannelDto> {
    const res = await dmApi.createGroup(memberIds, name)
    const channel = res.data
    // D49: sunucu tek üyeli (toplam 2 kişi) istekte GRUP DEĞİL 1-1 DM döner — mevcut DM varsa
    // o kanalın kendisi. Dönen kanal listede zaten olabilir; körü körüne unshift kopya satır
    // açardı. openChannel ile aynı eşleştirme deseni.
    const idx = channels.value.findIndex((c) => c.id === channel.id)
    if (idx === -1) {
      channels.value.unshift(channel)
    } else {
      channels.value[idx] = channel
    }
    activeDmChannelId.value = channel.id
    return channel
  }

  async function addGroupMember(groupId: string, userId: string) {
    await dmApi.addGroupMember(groupId, userId)
    // Üye eklenince kanal listesini tazele (members dizisi güncellensin)
    await fetchChannels()
  }

  async function removeGroupMember(groupId: string, userId: string) {
    await dmApi.removeGroupMember(groupId, userId)
    // Optimistik: üyeyi local listeden düşür
    const ch = channels.value.find((c) => c.id === groupId)
    if (ch && ch.type === 'GROUP_DM') {
      ch.members = ch.members.filter((m) => m.id !== userId)
    }
  }

  async function leaveGroup(groupId: string) {
    await dmApi.leaveGroup(groupId)
    removeChannel(groupId)
  }

  async function deleteGroup(groupId: string) {
    await dmApi.deleteGroup(groupId)
    removeChannel(groupId)
  }

  async function renameGroup(groupId: string, name: string) {
    const res = await dmApi.renameGroup(groupId, name)
    const updated = res.data
    const idx = channels.value.findIndex((c) => c.id === groupId)
    if (idx !== -1) channels.value[idx] = updated
  }

  // Grup üyesi listesini store'da güncelle (WS veya optimistik güncelleme için)
  function updateGroupMembers(groupId: string, members: GroupDmMemberDto[]) {
    const ch = channels.value.find((c) => c.id === groupId)
    if (ch && ch.type === 'GROUP_DM') {
      ch.members = members
    }
  }

  return {
    channels,
    activeDmChannelId,
    requests,
    requestCount,
    fetchRequests,
    acceptRequest,
    rejectRequest,
    fetchChannels,
    openChannel,
    markRead,
    removeChannel,
    setActiveChannel,
    activeChannel,
    applyActivity,
    applyReadReceipt,
    isSeen,
    showsReceipts,
    createGroup,
    addGroupMember,
    removeGroupMember,
    leaveGroup,
    deleteGroup,
    renameGroup,
    updateGroupMembers,
  }
})
