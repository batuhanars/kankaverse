<script setup lang="ts">
/**
 * TextChannelView — metin kanalı merkez görünümü (TopBar + MessageArea + sağ sütun).
 * VoiceRoomView ile simetrik; ikisi de prop'suz (store okur), GuildChannelView'da <component :is> ile seçilir.
 * Sağ sütun: arama paneli açıksa GuildSearchPanel, değilse MemberPanel (toggle).
 */
import { ref } from 'vue'
import { useGuildsStore } from '@/stores/guilds'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import GuildSearchPanel from '@/components/shared/GuildSearchPanel.vue'
import MessageArea from './MessageArea.vue'

const guildsStore = useGuildsStore()
const { isOpen: searchOpen } = useGuildSearchPanel()
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
    <!-- Sağ sütun: arama paneli açıksa üye panelinin yerini alır -->
    <GuildSearchPanel
      v-if="searchOpen && guildsStore.activeGuildId"
      :key="guildsStore.activeGuildId"
      :guild-id="guildsStore.activeGuildId"
      class="hidden xl:flex"
    />
    <MemberPanel v-else-if="showMemberPanel" class="hidden xl:flex" />
  </div>
</template>
