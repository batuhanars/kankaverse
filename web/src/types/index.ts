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
  DM: 'DM',
  GROUP_DM: 'GROUP_DM',
} as const
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType]

// Sprint 1 §5 + Sprint 2A §4 + Sprint 2B §4 + Sprint 3 §5 — DTO'lar
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
  friendTag: string // Sprint 3 R1
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

export interface DmChannelDto {
  id: string
  otherUser: FriendCodeUserDto
  lastMessage: MessageDto | null
  unread: boolean
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
  createdAt: string
}

export interface ChannelDto {
  id: string
  type: ChannelType
  guildId: string | null
  name: string | null
  ageGated: boolean
  position: number
}

export interface MessageDto {
  id: string
  channelId: string
  content: string
  replyToId: string | null
  author: {
    id: string
    username: string
    avatarUrl: string | null
  }
  createdAt: string
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
