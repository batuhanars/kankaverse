import http from './axios'
import type { UserProfileCardDto } from '@/types'

export const usersApi = {
  getCard: (userId: string) => http.get<UserProfileCardDto>(`/users/${userId}/card`),
}
