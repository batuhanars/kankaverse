import http from './axios'
import type { FriendDto, FriendRequestDto, BlockedUserDto } from '@/types'

export const friendsApi = {
  getFriends: () => http.get<FriendDto[]>('/friends'),
  getRequests: () => http.get<FriendRequestDto[]>('/friends/requests'),
  sendRequest: (friendCode: string) =>
    http.post<FriendRequestDto | FriendDto>('/friends/requests', { friendCode }),
  acceptRequest: (requestId: string) =>
    http.post<FriendDto>(`/friends/requests/${requestId}/accept`),
  declineRequest: (requestId: string) =>
    http.post<null>(`/friends/requests/${requestId}/decline`),
  removeFriend: (userId: string) => http.delete<null>(`/friends/${userId}`),
  getBlocked: () => http.get<BlockedUserDto[]>('/blocks'),
  blockUser: (userId: string) => http.post<null>('/blocks', { userId }),
  unblockUser: (userId: string) => http.delete<null>(`/blocks/${userId}`),
}
