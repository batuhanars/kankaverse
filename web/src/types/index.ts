// Sprint 1 Contract §3 — Enum'lar (erasableSyntaxOnly uyumlu const+type)
export const VerificationStatus = {
  NONE: 'NONE',
  EDEVLET_VERIFIED: 'EDEVLET_VERIFIED',
} as const
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus]

export const DmPolicy = {
  EVERYONE: 'EVERYONE',
  FRIENDS: 'FRIENDS',
  NONE: 'NONE',
} as const
export type DmPolicy = (typeof DmPolicy)[keyof typeof DmPolicy]

export const MediaPolicy = {
  EVERYONE: 'EVERYONE',
  FRIENDS: 'FRIENDS',
  NONE: 'NONE',
} as const
export type MediaPolicy = (typeof MediaPolicy)[keyof typeof MediaPolicy]

// R20 — enum-ADMIN kaldırıldı (bkz. GuildMemberRole altındaki not); tam yetki artık
// sahiplik + rol sisteminin ADMINISTRATOR bayrağı üzerinden çözülür.
export const GuildRole = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const
export type GuildRole = (typeof GuildRole)[keyof typeof GuildRole]

export const ChannelType = {
  GUILD_TEXT: 'GUILD_TEXT',
  GUILD_VOICE: 'GUILD_VOICE',
  DM: 'DM',
  GROUP_DM: 'GROUP_DM',
} as const
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType]

// Sprint 1 §5 + Sprint 2A §4 + Sprint 2B §4 + Sprint 3 §5 — DTO'lar
// Sprint 4B: isModerator eklendi (platform-seviyesi moderatör bayrağı)
// NOT: backend toUserDto'da isModerator dönmüyorsa optional kalır, yönlendirme çalışmaz.
export interface UserDto {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  bannerUrl: string | null // Sprint C8 — profil afişi (görsel), bannerColor'ın üstünde gösterilir
  avatarAnimatedUrl?: string | null // Sprint C13 — hareketli WebP; doluysa avatarUrl onun ilk karesidir
  bannerAnimatedUrl?: string | null // Sprint C13
  isMinor: boolean
  verificationStatus: VerificationStatus
  createdAt: string
  emailVerified: boolean
  twoFactorEnabled: boolean // Sprint 2B
  friendCode: string // Sprint 3
  animatedAllowed?: boolean // Sprint C22 — hareketli (GIF/video) yükleme kapısı; sunucu yine otorite
  aiVideoPreview?: boolean // Sprint C33 — pasif tanıtım (reşit + bayrak açık): düğme görünür, pencere kilitli, istek atılmaz
  aiVideoAllowed?: boolean // Sprint C14 — yapay zeka video üretimi kapısı (yalnız açık liste); sunucu yine otorite
  isModerator?: boolean // Sprint 4B — backend toUserDto'da eklenmesi gerekir
  bio: string | null // Sprint C5 — profil metni
  bannerColor: string | null // profil afiş rengi (preset anahtar veya null=varsayılan)
  dmPolicy: DmPolicy // Sprint C5 — Gizlilik sekmesi okur
  quickReactions?: string[] // Sprint C24 — hızlı tepki şeridi (etkin liste, her zaman 5); bayat oturumda yok olabilir
  showGameActivity?: boolean | null // C31b — ham ayar (null = hiç dokunulmadı)
  gameActivityEffective?: boolean // C31b — yaşa göre varsayılan uygulanmış hâl (sunucu hesaplar)
  showRecentActivity?: boolean // C31f — son oynanan oyunlar ayarı (varsayılan kapalı; minörde hep false)
  reactionNotifications?: boolean // C46 — tepki bildirimleri (varsayılan açık); bayat oturumda yok olabilir
  readReceipts: boolean // C12 — okundu bilgisi paylaşımı (karşılıklı; kapatan karşı tarafınkini de göremez)
}

// C31f — GET /users/:id/recent-activity satırı
export interface RecentGameDto {
  game: { id: string; name: string; iconUrl: string | null; storeUrl: string | null }
  lastPlayedAt: string
}

// Sprint 3 §5 — sosyal katman DTO'ları
export interface FriendCodeUserDto {
  id: string
  username: string
  avatarUrl: string | null
  avatarAnimatedUrl?: string | null // C16 — Kankalar ve DM listesinde aktif/hover'da canlanır
}

export interface FriendDto {
  friendshipId: string
  user: FriendCodeUserDto
  since: string
}

export interface FriendRequestDto {
  id: string
  direction: 'incoming' | 'outgoing'
  user: FriendCodeUserDto
  createdAt: string
}

export interface BlockedUserDto {
  user: FriendCodeUserDto
  since: string
}

// Sprint 12 §3 — GROUP_DM üye DTO (slim, kanal listesi + panel için)
export interface GroupDmMemberDto {
  id: string
  username: string
  avatarUrl: string | null
  avatarAnimatedUrl?: string | null // Sprint C16 — satır hover'da canlanır; yoksa statik
}

// C46 §4b — DM/grup satırı tepki göstergesi (sunucu süzer: okunmamış, son mesajdan yeni, aktör engelsiz)
export interface DmLastReactionDto {
  actorId: string
  actorUsername: string
  emoji: string
  messageId: string
  at: string
}

// Sprint 12 §3 — DmChannelDto discriminated union: 1-1 DM | GROUP_DM
export type DmChannelDto =
  | {
      type: 'DM'
      id: string
      otherUser: FriendCodeUserDto
      lastMessage: MessageDto | null
      unread: boolean
      lastReaction?: DmLastReactionDto | null
      canMessage: boolean
      selfBlocked: boolean
      // C9 — mesaj isteği: null = normal DM · 'PENDING'/'ACCEPTED' = istek.
      // requestOutgoing = bu isteği ben mi başlattım (gönderen tarafı).
      requestStatus?: 'PENDING' | 'ACCEPTED' | null
      requestOutgoing?: boolean
      // C12 §3.2 — İKİ AYRI ALAN, karıştırma:
      //   receiptsEnabled: tik çizilecek mi (gizlilik kapısı: karşı taraf/ben kapatmışsam, bekleyen
      //     istek, engel, grup DM → false ve gösterge HİÇ çizilmez).
      //   otherReadAt    : karşı tarafın okuma anı; null = henüz hiç okumamış → TEK tik.
      // Kararı sunucu verir (`readReceiptDecision`, R7), istemci sorgulamaz.
      receiptsEnabled?: boolean
      otherReadAt?: string | null
    }
  | {
      type: 'GROUP_DM'
      id: string
      name: string | null
      ownerId: string
      // Kurucunun atadığı yöneticiler (kurucu hariç). Eski önbellekte alan yok → yönetici yok.
      adminIds?: string[]
      members: GroupDmMemberDto[]
      lastMessage: MessageDto | null
      unread: boolean
      lastReaction?: DmLastReactionDto | null
      // C34 — grup okundu: receiptsEnabled gizlilik kapısı; groupAllReadAt = uygun üyelerin HEPSİ
      // en az bu ana kadar okudu (biri hiç okumadıysa null → tek tik). Bireysel okuma anı yoktur.
      receiptsEnabled?: boolean
      groupAllReadAt?: string | null
    }

// C9 — Mesaj İsteği (arkadaş olmayan birinin gönderdiği bekleyen DM isteği)
export interface MessageRequestDto {
  channelId: string
  requester: { id: string; username: string; avatarUrl: string | null } | null
  preview: string
  encrypted?: boolean // E1 — yalnız şifreliyse true: önizleme "Şifreli mesaj"
  createdAt: string
}

// C10 — kart rol rozeti / ses durumu
export interface UserCardRoleDto {
  id: string
  name: string
  color: string
  unicodeEmoji?: string | null // C21
}
export interface UserCardVoiceDto {
  channelId: string
  channelName: string
  guildId: string
  guildName: string
  streaming: boolean // ekran paylaşımı
  video: boolean // kamera
}

// Sprint 4A §3 + Sprint C5 §3 + C10 — kullanıcı profil kartı DTO (genişletildi)
export interface UserProfileCardDto {
  id: string
  username: string
  avatarUrl: string | null
  bannerUrl: string | null // Sprint C8 — profil afişi (görsel)
  avatarAnimatedUrl?: string | null // Sprint C13 — yalnız kart/tam profil DTO'sunda (sözleşme §2.5)
  bannerAnimatedUrl?: string | null // Sprint C13
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self'
  selfBlocked: boolean
  bio: string | null // Sprint C5
  bannerColor: string | null // profil afiş rengi (preset veya null=varsayılan)
  memberSince: string // Sprint C5 — createdAt ISO
  mutualFriends: { id: string; username: string; avatarUrl: string | null }[] // Sprint C5
  mutualGuilds: { id: string; name: string; iconUrl: string | null }[] // Sprint C5
  canMessage: boolean // C10 — inline mesaj kutusu kapısı (canDm)
  roles: UserCardRoleDto[] // C10 — yalnız guildId bağlamında dolu
  voiceStatus: UserCardVoiceDto | null // C10 — hedef aktif seste + erişim varsa
  connections?: ProfileConnectionDto[] // C36 — bağlı Kick/Twitch hesapları (yalnız showOnProfile)
}

// ── C36: Kick + Twitch hesap bağlama ve yayın duyurusu ───────────────────────
export type StreamProviderKey = 'kick' | 'twitch'

export interface ProfileConnectionDto {
  provider: StreamProviderKey
  username: string
  url: string
}

export interface ExternalAccountDto extends ProfileConnectionDto {
  showOnProfile: boolean
  linkedAt: string
}

export interface AnnounceGuildDto {
  guildId: string
  name: string
  iconUrl: string | null
  optedIn: boolean
}

export interface StreamAnnounceConfigDto {
  channelId: string
  mentionRoleId: string | null
  enabled: boolean
}

export interface SessionDto {
  id: string
  device: string | null
  ip: string | null
  lastActiveAt: string
  createdAt: string
  current: boolean
}

export interface TwoFactorSetupDto {
  otpauthUrl: string
  qrDataUrl: string
  secret: string
}

export interface RecoveryCodesDto {
  codes: string[]
}

export interface LoginChallengeDto {
  twoFactorRequired: true
  challengeToken: string
}

export interface GuildDto {
  id: string
  name: string
  ownerId: string
  adultsOnly: boolean
  iconUrl: string | null
  iconAnimatedUrl?: string | null // C19 — hareketli simge (WebP); iconUrl daima statik kare
  bannerUrl: string | null // Sprint C8 — ortam afişi (görsel), bannerColor'ın üstünde gösterilir
  bannerAnimatedUrl?: string | null // C19 — hareketli afiş (WebP); bannerUrl daima statik kare
  description: string | null
  createdAt: string
  unreadCount: number
  unreadMentionCount: number
  // Sprint C6 — Keşfet
  discoverable: boolean
  tags: string[]
  bannerColor: string | null
  memberCount?: number // yalnız findMyGuilds doldurur (Ortamların kartı)
}

// Sprint C6 §4 — Keşfet kart DTO (discoverable guild'ler; herkes erişir, adultsOnly minöre backend'de süzülür)
export interface DiscoveryGuildDto {
  id: string
  name: string
  iconUrl: string | null
  iconAnimatedUrl?: string | null // C19
  bannerColor: string | null
  bannerAnimatedUrl?: string | null // C19
  bannerUrl: string | null // C8 — yüklenmiş afiş görseli (varsa gösterilir, yoksa bannerColor gradient)
  description: string | null
  memberCount: number
  tags: string[]
  adultsOnly: boolean
}

// Sprint C6 §2 — Popüler etiket agregatı (GET /discovery/tags)
export interface DiscoveryTagDto {
  tag: string
  count: number
}

// Sprint C6 §2 — Keşfet listesi sayfalama zarfı
export interface DiscoveryListDto {
  items: DiscoveryGuildDto[]
  nextCursor: string | null
}

export interface ChannelDto {
  id: string
  type: ChannelType
  guildId: string | null
  name: string | null
  ageGated: boolean
  isPrivate: boolean
  // item 6: özel kanal herkese görünür; locked=true ise kullanıcı görür ama GİREMEZ (üye değil)
  locked?: boolean
  position: number
  slowModeSeconds: number
  unreadCount: number
  unreadMentionCount: number
  categoryId: string | null
  userLimit: number // R10 — ses kanalı kullanıcı limiti (0 = sınırsız, 0–99); metin kanallarında 0
  bitrate?: number // R10 — ses kanalı bit hızı (kbps, 8–96); metin kanallarında anlamsız
  mediaEnabled?: boolean // C7 — GUILD_VOICE kanalında kamera/ekran grant'i (admin toggle; default false)
  readOnly?: boolean // C57 — salt okunur metin kanalı; yalnız MANAGE_CHANNELS yazar
}

// Sprint V2 — Kategori DTO (§3 toCategoryDto)
export interface CategoryDto {
  id: string
  guildId: string
  name: string
  position: number
}

// Sprint 5 §4 — Attachment DTO
export const ScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  FLAGGED: 'FLAGGED',
} as const
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus]

export interface AttachmentDto {
  id: string
  filename: string
  contentType: string
  size: number
  scanStatus: ScanStatus
  durationMs?: number | null // M6b — yalnız ses ekinde dolu
  waveform?: string | null // M6b §7 — base64, 64 bayt; yalnız ses ekinde
  // M6c — yalnız video ekinde
  thumbnail?: string | null // base64 JPEG, `data:` öneksiz
  width?: number | null
  height?: number | null
  aiGenerated?: boolean // C14b: yapay zeka ile üretildi (sunucu türetir)
}

export interface ReactionDto {
  emoji: string
  count: number
  reactedByMe: boolean
}

// C46 §3 — GET /channels/:id/messages/:messageId/reactions satırı
export interface ReactionGroupDto {
  emoji: string
  count: number
  users: { id: string; username: string; avatarUrl: string | null }[]
}

/** Yanıt alıntısındaki ek özeti: alıntılanan mesajın İLK eki (adres yok, görsel `getUrl` ile gelir). */
export type ReplyAttachmentDto = Pick<
  AttachmentDto,
  'id' | 'filename' | 'contentType' | 'scanStatus' | 'thumbnail'
>

export interface ReplyPreviewDto {
  id: string
  content: string
  authorUsername: string
  attachment?: ReplyAttachmentDto | null // eski önbellek/olayda alan yok → yalnız metin
  // E1 — YALNIZ yerel: alıntılanan mesaj şifreli ve düz metni bu cihazda yok ("Şifreli mesaj" gösterilir).
  e2eeUnknown?: boolean
}

// C35 §2.5 - webhook mesajındaki embed (yalniz izinli alanlar; gorsel alani yok)
export interface MessageEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  author?: { name: string; url?: string }
  fields?: { name: string; value: string; inline: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

// C35 §4.1 - Webhook yonetim DTO'su (token/ozet ASLA donmez; `url` yalniz olusturma/yenileme cevabinda)
export interface WebhookDto {
  id: string
  name: string
  channelId: string
  createdBy: { id: string; username: string }
  disabled: boolean
  lastUsedAt: string | null
  createdAt: string
  url?: string
}

export interface MessageDto {
  id: string
  channelId: string
  content: string
  replyToId: string | null
  replyTo?: ReplyPreviewDto | null
  author: {
    id: string
    username: string
    avatarUrl: string | null
    avatarAnimatedUrl?: string | null // Sprint C16 — hover'da canlanır; yoksa statik
    roleEmoji?: string | null // C21 — ortam kanalında yazarın rol emojisi; DM'de null
  }
  createdAt: string
  editedAt: string | null
  attachments?: AttachmentDto[]
  reactions?: ReactionDto[]
  mentions?: string[] // Sprint V2 — doğrulanmış bahsedilen userId'ler (boşsa [])
  mentionsEveryone?: boolean // @everyone toplu bahsetme (everyone rolü mentionable iken)
  // R15 — bahsedilen ROL id'leri (≤3, everyone hariç). Kendi rollerimle kesişimi istemcide
  // hesaplanır: "bana rolümden bahsedildi" bandı ve rol çipi bunu kullanır.
  mentionRoles?: string[]
  pinnedAt: string | null // Sprint V2 Pins — dolu ise sabitlenen mesaj
  // C35 - gelen webhook mesaji: author webhook kimligidir (olusturanin id'si yok); eski sunucuda alan yok
  webhook?: { id: string } | null
  embeds?: MessageEmbed[] | null
  // C29 — iyimser gönderim: sunucu `nonce`'u cevapta ve message.created'da aynen yankılar.
  nonce?: string
  // C29 — YALNIZ yerel (sunucudan gelmez): geçici mesajın durumu ve hata metni.
  localStatus?: 'sending' | 'failed'
  localError?: string
  // E1 — şifreli DM mesajı: sunucu yalnız şifreliyse `encrypted:true` + ciphertext + senderDeviceId verir
  // (content ''). Düz metin istemcide çözülüp `content`'e yazılır; `ciphertext` ekran durumunda tutulmaz.
  encrypted?: boolean
  ciphertext?: string
  senderDeviceId?: string | null
  // E4 — gönderenin mesaj taahhüdü (base64); okuyan cihaz v2 yükü bununla doğrular.
  frankingTag?: string | null
  // E1 — YALNIZ yerel: çözme sonucu. 'ok' dışı = metin yok, arayüz durum metni gösterir.
  // E4: 'unverified' = parmak izi tutmadı/yok, gövde gösterilmez.
  e2eeStatus?: 'ok' | 'unsupported' | 'undecryptable' | 'failed' | 'unverified'
}

// Sprint V2 — Özel kanal üye DTO (GET/POST /channels/:id/members)
export interface ChannelMemberDto {
  id: string
  username: string
  avatarUrl: string | null
}

// Sprint 7B — Ortam üye DTO
// R20 (2026-08-11) — enum-ADMIN kaldırıldı: rol dışı ayrıcalıklı bir "yönetici" enum değeri
// sessiz yetki yükselmesine yol açıyordu (sahiplik devri sonrası kalıcı ADMIN kalma vakası).
// Kalan tek ayrıcalıklı katman OWNER; "tam yetkili yap" ihtiyacı artık rol sisteminin
// ADMINISTRATOR bayrağıyla karşılanır (bkz. useGuildPermissions.ts).
export const GuildMemberRole = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const
export type GuildMemberRole = (typeof GuildMemberRole)[keyof typeof GuildMemberRole]

export interface GuildMemberDto {
  userId: string
  username: string
  avatarUrl: string | null
  bannerUrl: string | null // Sprint C8 — profil afişi (görsel); üye listesinde şu an gösterilmiyor
  avatarAnimatedUrl?: string | null // Sprint C16 — satır hover'da canlanır; yoksa statik
  role: GuildMemberRole
  roles: {
    id: string
    name: string
    color: string
    position: number
    hoist: boolean
    unicodeEmoji?: string | null
  }[]
  roleEmoji?: string | null // C21 — emojisi olan en yüksek pozisyonlu rolün emojisi (sunucu hesaplar)
}

// Sprint V3 — Rol DTO
export interface RoleDto {
  id: string
  guildId: string
  name: string
  color: string
  position: number
  hoist: boolean
  mentionable: boolean
  permissions: string[]
  iconUrl: string | null
  unicodeEmoji?: string | null // C21 — tek emoji, yalnız görünüm
  isEveryone: boolean
  isDefault: boolean // yeni katılan üyelere otomatik atanan varsayılan rol (guild başına tek)
  memberCount: number
}

// Sprint V3 — Etkinlik (Event) DTO'ları
export const EventLocationType = {
  VOICE_CHANNEL: 'VOICE_CHANNEL',
  EXTERNAL: 'EXTERNAL',
} as const
export type EventLocationType = (typeof EventLocationType)[keyof typeof EventLocationType]

export const EventRecurrence = {
  NONE: 'NONE',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const
export type EventRecurrence = (typeof EventRecurrence)[keyof typeof EventRecurrence]

export const EventStatus = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
} as const
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus]

export interface EventDto {
  id: string
  guildId: string
  creatorId: string
  name: string
  description: string | null
  locationType: EventLocationType
  channelId: string | null
  channelName: string | null
  externalLocation: string | null
  startAt: string
  endAt: string | null
  // Sprint V3 Etkinlik Motoru §3 — ilgili örnek (occurrence) zamanları (backend türetir; FE yeniden hesaplamaz).
  // Görüntülemede startAt/endAt ÇAPA değil, BUNLAR kullanılır. NONE'da occurrenceStartAt = startAt.
  occurrenceStartAt: string
  occurrenceEndAt: string | null
  recurrence: EventRecurrence
  status: EventStatus
  interestedCount: number
  interestedByMe: boolean
  createdAt: string
  // Sprint V3 Etkinlik Kapak Görseli §4 — yalnız tarama-CLEAN'de dolu presigned GET URL; aksi null.
  coverImageUrl: string | null
}

// Sprint 7A §3 — Davet DTO'ları
export interface InviteDto {
  code: string
  guildId: string
  maxUses: number | null
  uses: number
  expiresAt: string | null
  createdAt: string
}

export interface InvitePreviewDto {
  guildName: string
  adultsOnly: boolean
  valid: boolean
}

// Sprint C1 — Kalıcı bildirim sistemi (SPRINT_C1_NOTIFICATIONS_CONTRACT.md §5)
export const NotificationType = {
  MENTION: 'MENTION',
  FRIEND_REQUEST: 'FRIEND_REQUEST',
  FRIEND_ACCEPT: 'FRIEND_ACCEPT',
  GUILD_INVITE: 'GUILD_INVITE',
  // Sprint R14 — ortamda yeni etkinlik oluşturuldu
  EVENT_CREATED: 'EVENT_CREATED',
  // Sprint C46 — mesajına tepki bırakıldı
  REACTION: 'REACTION',
  // Sprint C49 — yapay zeka video bitti / üretilemedi
  AI_VIDEO_READY: 'AI_VIDEO_READY',
  AI_VIDEO_FAILED: 'AI_VIDEO_FAILED',
} as const
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]

export interface NotificationDto {
  id: string
  type: NotificationType
  actor: { id: string; username: string; avatarUrl: string | null } | null
  guildId: string | null
  guildName?: string | null
  channelId: string | null
  messageId: string | null
  preview: string | null
  aiVideoId: string | null
  readAt: string | null
  createdAt: string
}

// Bildirim tercihleri (GET/PUT /notifications/prefs) — guild/kanal sustur + seviye.
export const NotifTargetType = {
  GUILD: 'GUILD',
  CHANNEL: 'CHANNEL',
} as const
export type NotifTargetType = (typeof NotifTargetType)[keyof typeof NotifTargetType]

export const NotificationLevel = {
  ALL: 'ALL',
  MENTIONS: 'MENTIONS',
  NONE: 'NONE',
} as const
export type NotificationLevel = (typeof NotificationLevel)[keyof typeof NotificationLevel]

export interface NotificationPrefDto {
  targetType: NotifTargetType
  targetId: string
  muted: boolean
  mutedUntil: string | null // ISO; null = süresiz (muted true ise). Geçmişse mute bitmiş.
  level: NotificationLevel
  // Sprint R14 — yalnız GUILD satırında anlamlı; CHANNEL satırında sunucu her zaman false döner.
  suppressEveryone: boolean
  suppressEvents: boolean
  // Sprint R15 — rol bahsetmelerini sustur (yine yalnız GUILD)
  suppressRoleMentions: boolean
}

// Sprint R5 — Ortam denetim kaydı (moderasyon aksiyon logları)
export interface AuditLogEntryDto {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  actor: { id: string; username: string; avatarUrl: string | null }
  targetUser: { id: string; username: string; avatarUrl: string | null } | null
  reason: string | null
}

// Response envelope
export interface ApiResponse<T> {
  success: boolean
  statusCode: number
  data: T
}

export interface ApiError {
  success: false
  statusCode: number
  message: string
  error: string
  timestamp: string
  path: string
}
