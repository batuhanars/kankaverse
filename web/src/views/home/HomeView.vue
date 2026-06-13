<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDmStore } from '@/stores/dm'
import HomeSidebar from './components/HomeSidebar.vue'
import FriendsPanel from './components/FriendsPanel.vue'
import DmConversation from './components/DmConversation.vue'

const dmStore = useDmStore()
const activeView = ref<'friends' | 'dm'>('friends')

function selectFriends() {
  activeView.value = 'friends'
  dmStore.setActiveChannel(null)
}

function selectDm(channelId: string) {
  activeView.value = 'dm'
  dmStore.setActiveChannel(channelId)
}

function openDm(channelId: string) {
  activeView.value = 'dm'
  dmStore.setActiveChannel(channelId)
}

const activeDmChannel = computed(() => dmStore.activeChannel())
</script>

<template>
  <div class="flex flex-1 min-w-0 overflow-hidden">
    <HomeSidebar
      :active-view="activeView"
      :active-dm-channel-id="dmStore.activeDmChannelId"
      @select-friends="selectFriends"
      @select-dm="selectDm"
    />

    <div class="flex flex-1 min-w-0 overflow-hidden">
      <FriendsPanel v-if="activeView === 'friends'" @open-dm="openDm" />
      <DmConversation
        v-else-if="activeView === 'dm' && activeDmChannel"
        :channel="activeDmChannel"
        @cleared="selectFriends"
        @left="selectFriends"
        @deleted="selectFriends"
      />
    </div>
  </div>
</template>
