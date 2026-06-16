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

export const GuildRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
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
  isMinor: boolean
  verificationStatus: VerificationStatus
  createdAt: string
  emailVerified: boolean
  twoFactorEnabled: boolean // Sprint 2B
  friendCode: string // Sprint 3
  isModerator?: boolean // Sprint 4B — backend toUserDto'da eklenmesi gerekir
}

// Sprint 3 §5 — sosyal katman DTO'ları
export interface FriendCodeUserDto {
  id: string
  username: string
  avatarUrl: string | null
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
}

// Sprint 12 §3 — DmChannelDto discriminated union: 1-1 DM | GROUP_DM
export type DmChannelDto =
  | {
      type: 'DM'
      id: string
      otherUser: FriendCodeUserDto
      lastMessage: MessageDto | null
      unread: boolean
      canMessage: boolean
      selfBlocked: boolean
    }
  | {
      type: 'GROUP_DM'
      id: string
      name: string | null
      ownerId: string
      members: GroupDmMemberDto[]
      lastMessage: MessageDto | null
      unread: boolean
    }

// Sprint 4A §3 — kullanıcı profil kartı DTO
export interface UserProfileCardDto {
  id: string
  username: string
  avatarUrl: string | null
  friendStatus: 'none' | 'friends' | 'pending_in' | 'pending_out' | 'self'
  selfBlocked: boolean
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
  description: string | null
  createdAt: string
  unreadCount: number
  unreadMentionCount: number
}

export interface ChannelDto {
  id: string
  type: ChannelType
  guildId: string | null
  name: string | null
  ageGated: boolean
  isPrivate: boolean
  position: number
  slowModeSeconds: number
  unreadCount: number
  unreadMentionCount: number
  categoryId: string | null
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
}

export interface ReactionDto {
  emoji: string
  count: number
  reactedByMe: boolean
}

export interface ReplyPreviewDto {
  id: string
  content: string
  authorUsername: string
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
  }
  createdAt: string
  editedAt: string | null
  attachments?: AttachmentDto[]
  reactions?: ReactionDto[]
  mentions?: string[]  // Sprint V2 — doğrulanmış bahsedilen userId'ler (boşsa [])
  pinnedAt: string | null  // Sprint V2 Pins — dolu ise sabitlenen mesaj
}

// Sprint V2 — Özel kanal üye DTO (GET/POST /channels/:id/members)
export interface ChannelMemberDto {
  id: string
  username: string
  avatarUrl: string | null
}

// Sprint 7B — Ortam üye DTO
export const GuildMemberRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const
export type GuildMemberRole = (typeof GuildMemberRole)[keyof typeof GuildMemberRole]

export interface GuildMemberDto {
  userId: string
  username: string
  avatarUrl: string | null
  role: GuildMemberRole
  roles: { id: string; name: string; color: string; position: number; hoist: boolean }[]
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
  isEveryone: boolean
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
