import http from './axios'
import type { UserProfileCardDto, UserDto, DmPolicy } from '@/types'

// Sprint C5 §2 — PATCH /users/me body (yalnız verilen alanlar güncellenir)
export interface UpdateProfilePayload {
  bio?: string
  dmPolicy?: DmPolicy
}

export const usersApi = {
  getCard: (userId: string) => http.get<UserProfileCardDto>(`/users/${userId}/card`),
  // Sprint C5 §2 — kendi profil/gizlilik güncelle → güncel UserDto
  updateProfile: (payload: UpdateProfilePayload) => http.patch<UserDto>('/users/me', payload),
}
