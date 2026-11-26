import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dmApi } from '@/api/dm'
import { useAuthStore } from '@/stores/auth'
import type {
  DmChannelDto,
  DmLastReactionDto,
  GroupDmEventPayload,
  GroupDmMemberDto,
  MessageRequestDto,
} from '@/types'

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
    if (active) {
      active.unread = false
      active.lastReaction = null
    }
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

  /** C75 §2.6 — WS `dm.request_accepted`: giden isteğim kabul edildi, kutunun kilidi kalkar. Kanal yoksa no-op. */
  function applyRequestAccepted(channelId: string) {
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch?.type === 'DM' && ch.requestStatus === 'PENDING') ch.requestStatus = 'ACCEPTED'
  }

  /** C62 — ayrıldığım/çıkarıldığım grup: sunucu bu kanalda okundu/gönderme/tepki kapılarını kapatır (403). */
  function isDeparted(channelId: string): boolean {
    const ch = channels.value.find((c) => c.id === channelId)
    return ch?.type === 'GROUP_DM' && !!ch.departed
  }

  async function markRead(channelId: string) {
    if (isDeparted(channelId)) return
    await dmApi.markRead(channelId)
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.unread = false
      ch.lastReaction = null
    }
  }

  /** C20 — başka cihazım bu DM'i okudu (WS `read:self`): yalnız yerel bayrak, API yok. */
  function applyReadSelf(channelId: string) {
    const ch = channels.value.find((c) => c.id === channelId)
    if (ch) {
      ch.unread = false
      ch.lastReaction = null
    }
  }

  /**
   * C46 §4b — WS `dm.reaction`: mesajıma tepki geldi / tepki geri alındı. Süzgeç SUNUCUDA
   * (aktör, engel, sessiz kanal, tekrar); burada ikinci bir kural yok. Sıralama DEĞİŞMEZ.
   * - null: yalnız göstergeyi temizle, `unread` değişmez (yenilemede sunucu doğrusunu söyler).
   * - açık sohbet: göstergeyi yazma, mevcut okundu çağrısı git (satır okunmuş kalır).
   */
  function applyReaction(channelId: string, lastReaction: DmLastReactionDto | null) {
    const ch = channels.value.find((c) => c.id === channelId)
    if (!ch || isDeparted(channelId)) return
    if (lastReaction === null) {
      ch.lastReaction = null
      return
    }
    if (channelId === activeDmChannelId.value) {
      markRead(channelId).catch(() => {})
      return
    }
    ch.lastReaction = lastReaction
    ch.unread = true
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
    if (!ch) return false
    // C34: grupta çift tik = uygun üyelerin HEPSİ okudu (`groupAllReadAt`)
    const readAt = ch.type === 'DM' ? ch.otherReadAt : ch.groupAllReadAt
    if (!readAt) return false
    return messageCreatedAt <= readAt
  }

  /**
   * C34 — WS `dm:groupRead`: bir grup üyesi okudu; sunucu BU izleyicinin gözünden güncel toplu durumu
   * yollar (bireysel okuma anı/okuyan kimliği yok). Kapı ve zaman sunucudan olduğu gibi alınır.
   */
  function applyGroupReadReceipt(payload: {
    channelId: string
    receiptsEnabled: boolean
    groupAllReadAt: string | null
  }) {
    const ch = channels.value.find((c) => c.id === payload.channelId)
    if (!ch || ch.type !== 'GROUP_DM') return
    ch.receiptsEnabled = payload.receiptsEnabled
    // Geriye gitme: yarış hâlinde eski olay yeni tarihi ezmesin (kapı kapanınca null serbest).
    if (payload.groupAllReadAt && ch.groupAllReadAt && ch.groupAllReadAt > payload.groupAllReadAt) {
      return
    }
    ch.groupAllReadAt = payload.groupAllReadAt
  }

  /**
   * C67 — WS `dm:seen`: bir okuyucunun konumu güncellenir. Görünürlük kararı SUNUCUDA (R7); olay yalnız
   * görebilenlere gelir, burada ek süzgeç yok. Geriye gitme yok: yarışta eski olay yeni anı ezmesin.
   * Eski grupta (`departed`) hiçbir şey yazılmaz.
   */
  function applySeen(payload: { channelId: string; userId: string; readAt: string }) {
    const ch = channels.value.find((c) => c.id === payload.channelId)
    if (!ch || (ch.type === 'GROUP_DM' && ch.departed)) return
    const list = ch.seenBy ?? (ch.seenBy = [])
    const cur = list.find((s) => s.userId === payload.userId)
    if (!cur) list.push({ userId: payload.userId, readAt: payload.readAt })
    else if (cur.readAt < payload.readAt) cur.readAt = payload.readAt
  }

  /**
   * C12 §4.2 — bu kanalda tik çizilecek mi. Kaynak SUNUCUNUN gizlilik kararı (`receiptsEnabled`),
   * "okuma var mı" DEĞİL. İlk sürüm `otherReadAt`e bakıyordu ve karşı taraf sohbeti bir kez bile
   * açmadıysa tik hiç çizilmiyordu — ilk mesajda "İletildi" asla görünmüyordu (sahip bulgusu).
   */
  function showsReceipts(channelId: string): boolean {
    const ch = channels.value.find((c) => c.id === channelId)
    return !!ch && ch.receiptsEnabled === true
  }

  /**
   * C62 — WS `dm.group_departed` (yalnız ayrılan kullanıcının soketlerine): kanal listeden düşmez, yerinde
   * `departed` olur; açık sohbet aynı anda kilitlenir (band çıkar, composer gider). Eski üye öğesinin şekli
   * sunucunun liste yanıtıyla aynı tutulur: yönetici/okundu/rozet alanları sıfırlanır, üyeler diğerleri kalır.
   * Listede yoksa sunucudan çekilir.
   */
  async function applyGroupDeparted(payload: {
    channelId: string
    reason: 'LEFT' | 'REMOVED'
    leftAt: string
  }) {
    const ch = channels.value.find((c) => c.id === payload.channelId)
    if (!ch || ch.type !== 'GROUP_DM') {
      await fetchChannels()
      return
    }
    if (ch.departed) return // olay ve yerel ayrılma ikisi de gelir; ilk yazılan kalır
    const myId = useAuthStore().user?.id
    ch.departed = { leftAt: payload.leftAt, reason: payload.reason }
    ch.members = ch.members.filter((m) => m.id !== myId)
    ch.adminIds = []
    ch.unread = false
    ch.lastReaction = null
    ch.receiptsEnabled = false
    ch.groupAllReadAt = null
    ch.seenBy = []
  }

  /**
   * C64 — WS `dm.group_event`: kalan üyelerde üye listesi yenilemeden güncellenir (ADDED → `member` eklenir,
   * LEFT/REMOVED → hedef düşer). Olay okunmadı/sıralama/önizleme ÜRETMEZ. Hedef bensem: çıkarılma/ayrılma
   * `applyGroupDeparted` ile gelir (burada dokunulmaz); geri eklendiysem liste sunucudan tazelenir.
   */
  async function applyGroupEvent(payload: GroupDmEventPayload) {
    const myId = useAuthStore().user?.id
    const { event, member } = payload
    const ch = channels.value.find((c) => c.id === payload.channelId)
    if (event.target.id === myId) {
      if (event.kind === 'MEMBER_ADDED') await fetchChannels()
      return
    }
    if (!ch || ch.type !== 'GROUP_DM' || ch.departed) return
    if (event.kind === 'MEMBER_ADDED') {
      if (member && !ch.members.some((m) => m.id === member.id)) ch.members.push(member)
    } else {
      ch.members = ch.members.filter((m) => m.id !== event.target.id)
      if (ch.seenBy) ch.seenBy = ch.seenBy.filter((s) => s.userId !== event.target.id) // C67: ayrılan okuyucu düşer
    }
  }

  /** C62 — eski grup sohbetini listemden sil (yalnız benim kaydım; grup diğer üyelerde durur). */
  async function deleteDeparture(groupId: string) {
    await dmApi.deleteDeparture(groupId)
    removeChannel(groupId)
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
      lastMessage: { id?: string; content: string; createdAt: string; encrypted?: boolean }
      senderId: string
    },
    opts?: { countUnread?: boolean },
  ) {
    const authStore = useAuthStore()
    const idx = channels.value.findIndex((c) => c.id === payload.channelId)

    if (idx !== -1) {
      const ch = channels.value[idx]
      if (isDeparted(ch.id)) return // C62: eski üyeye mesaj akmaz; yine de listeyi kirletme
      // Yeni mesaj tepki göstergesinin yerini alır (§4b.5)
      ch.lastReaction = null
      // C75 §3.1: bekleyen giden isteğime karşı taraftan mesaj geldiyse istek kabul edilmiştir (sunucuda
      // yalnız alıcı kabul edip yazabilir; cevap = örtük kabul). Yeni sunucu olayı yok: mevcut `dm.message`
      // akışı kilidi kaldırır. Açıkça "Kabul Et"le kabulde mesaj gelmez; o durumda kanal listesi tazelenince
      // (sayfa açılışı / `DmView.sync`) durum ACCEPTED görünür.
      if (
        ch.type === 'DM' &&
        ch.requestStatus === 'PENDING' &&
        ch.requestOutgoing === true &&
        payload.senderId !== authStore.user?.id
      ) {
        ch.requestStatus = 'ACCEPTED'
      }
      // lastMessage alanlarını güncelle (MessageDto uyumlu — eksik alanlar korunur)
      if (ch.lastMessage) {
        if (payload.lastMessage.id) ch.lastMessage.id = payload.lastMessage.id // E3: önizleme depo anahtarı
        ch.lastMessage.content = payload.lastMessage.content
        ch.lastMessage.encrypted = payload.lastMessage.encrypted // E1: yalnız şifreliyse true
        ch.lastMessage.createdAt = payload.lastMessage.createdAt
      } else {
        // Önceki lastMessage null idi — minimal şekle yaz
        ch.lastMessage = {
          id: payload.lastMessage.id ?? '',
          channelId: payload.channelId,
          content: payload.lastMessage.content,
          encrypted: payload.lastMessage.encrypted,
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
      } else if (payload.senderId === myId) {
        // C20: cevapladım = okudum (başka cihazımdan gönderdim; sunucu işaretçiyi ilerletti).
        ch.unread = false
      } else if (opts?.countUnread !== false) {
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

  async function setGroupAdmin(groupId: string, userId: string, isAdmin: boolean) {
    await dmApi.setGroupAdmin(groupId, userId, isAdmin)
    const ch = channels.value.find((c) => c.id === groupId)
    if (ch && ch.type === 'GROUP_DM') {
      const rest = (ch.adminIds ?? []).filter((id) => id !== userId)
      ch.adminIds = isAdmin ? [...rest, userId] : rest
    }
  }

  async function leaveGroup(groupId: string) {
    await dmApi.leaveGroup(groupId)
    // C62: ayrılan grup listede kalır (salt okunur, "ayrıldın" bandı); sunucu olayı da aynı işi yapar (idempotent).
    await applyGroupDeparted({
      channelId: groupId,
      reason: 'LEFT',
      leftAt: new Date().toISOString(),
    })
  }

  async function deleteGroup(groupId: string) {
    await dmApi.deleteGroup(groupId)
    removeChannel(groupId)
  }

  async function renameGroup(groupId: string, name: string) {
    const res = await dmApi.renameGroup(groupId, name)
    // Sunucu yalnız { id, name } döner; kaydın yerine yazma, adı birleştir (C51)
    const idx = channels.value.findIndex((c) => c.id === groupId)
    if (idx !== -1)
      channels.value[idx] = { ...channels.value[idx], name: res.data.name } as DmChannelDto
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
    applyRequestAccepted,
    openChannel,
    markRead,
    applyReadSelf,
    applyReaction,
    removeChannel,
    isDeparted,
    applyGroupDeparted,
    applyGroupEvent,
    deleteDeparture,
    setActiveChannel,
    activeChannel,
    applyActivity,
    applyReadReceipt,
    isSeen,
    applyGroupReadReceipt,
    applySeen,
    showsReceipts,
    createGroup,
    addGroupMember,
    removeGroupMember,
    setGroupAdmin,
    leaveGroup,
    deleteGroup,
    renameGroup,
    updateGroupMembers,
  }
})
