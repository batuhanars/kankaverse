<script setup lang="ts">
/**
 * TextChannelView — metin kanalı merkez görünümü (TopBar + MessageArea + MemberPanel).
 * VoiceRoomView ile simetrik; ikisi de prop'suz (store okur), GuildChannelView'da <component :is> ile seçilir.
 */
import { ref } from 'vue'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import MessageArea from './MessageArea.vue'

const showMemberPanel = ref(true)
</script>

<template>
  <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
    <div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]">
      <TopBar
        :show-member-panel="showMemberPanel"
        @toggle-members="showMemberPanel = !showMemberPanel"
      />
      <MessageArea class="flex-1 min-h-0" />
    </div>
    <MemberPanel v-if="showMemberPanel" class="hidden xl:flex" />
  </div>
</template>
