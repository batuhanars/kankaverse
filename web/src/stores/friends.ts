import { defineStore } from 'pinia'
import { ref } from 'vue'
import { friendsApi } from '@/api/friends'
import type { FriendDto, FriendRequestDto, BlockedUserDto } from '@/types'

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref<FriendDto[]>([])
  const requests = ref<FriendRequestDto[]>([])
  const blocked = ref<BlockedUserDto[]>([])

  async function fetchFriends() {
    const res = await friendsApi.getFriends()
    friends.value = res.data
  }

  async function fetchRequests() {
    const res = await friendsApi.getRequests()
    requests.value = res.data
  }

  async function fetchBlocked() {
    const res = await friendsApi.getBlocked()
    blocked.value = res.data
  }

  async function sendRequest(friendCode: string) {
    await friendsApi.sendRequest(friendCode)
    await Promise.all([fetchRequests(), fetchFriends()])
  }

  async function acceptRequest(requestId: string) {
    await friendsApi.acceptRequest(requestId)
    await Promise.all([fetchRequests(), fetchFriends()])
  }

  async function declineRequest(requestId: string) {
    await friendsApi.declineRequest(requestId)
    requests.value = requests.value.filter((r) => r.id !== requestId)
  }

  async function removeFriend(userId: string) {
    await friendsApi.removeFriend(userId)
    friends.value = friends.value.filter((f) => f.user.id !== userId)
  }

  async function blockUser(userId: string) {
    await friendsApi.blockUser(userId)
    friends.value = friends.value.filter((f) => f.user.id !== userId)
    requests.value = requests.value.filter((r) => r.user.id !== userId)
    await fetchBlocked()
  }

  async function unblockUser(userId: string) {
    await friendsApi.unblockUser(userId)
    blocked.value = blocked.value.filter((b) => b.user.id !== userId)
  }

  return {
    friends,
    requests,
    blocked,
    fetchFriends,
    fetchRequests,
    fetchBlocked,
    sendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    blockUser,
    unblockUser,
  }
})
