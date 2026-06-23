<script setup lang="ts">
/**
 * TextChannelView — metin kanalı merkez görünümü (TopBar + MessageArea + sağ sütun).
 * VoiceRoomView ile simetrik; ikisi de prop'suz (store okur), GuildChannelView'da <component :is> ile seçilir.
 * Sağ sütun:
 *   ≥1280 (isWide): inline — GuildSearchPanel veya MemberPanel
 *   <1280:          overlay drawer (sağdan) — useAppShellNav.rightPanelOpen
 *
 * Mevcut showMemberPanel yerel ref'i useAppShellNav.rightPanelOpen'a bağlandı
 * (paralel state yok — contract §4 "mevcut toggle'ı yeniden kullan").
 */
import { computed } from 'vue'
import { useGuildsStore } from '@/stores/guilds'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isWide } from '@/composables/useResponsive'
import { useI18n } from 'vue-i18n'
import TopBar from '@/components/layout/TopBar.vue'
import MemberPanel from '@/components/layout/MemberPanel.vue'
import GuildSearchPanel from '@/components/shared/GuildSearchPanel.vue'
import MessageArea from './MessageArea.vue'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const { isOpen: searchOpen } = useGuildSearchPanel()
const { rightPanelVisible, toggleRightPanel, closeRightPanel } = useAppShellNav()

// TopBar'ın showMemberPanel prop'u: efektif görünürlük (≥1280 varsayılan açık).
const showMemberPanel = computed(() => rightPanelVisible.value)
</script>

<template>
  <div class="flex flex-1 min-w-0 overflow-hidden gap-4 relative">
    <div class="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]">
      <TopBar
        :show-member-panel="showMemberPanel"
        @toggle-members="toggleRightPanel"
      />
      <MessageArea class="flex-1 min-h-0" />
    </div>

    <!-- ≥1280: inline sağ sütun -->
    <template v-if="isWide">
      <GuildSearchPanel
        v-if="searchOpen && guildsStore.activeGuildId"
        :key="guildsStore.activeGuildId"
        :guild-id="guildsStore.activeGuildId"
        class="flex"
      />
      <MemberPanel v-else-if="showMemberPanel" class="flex" />
    </template>

    <!-- <1280: sağdan overlay drawer (default kapalı: null ?? false) -->
    <template v-else>
      <!-- Backdrop -->
      <Transition name="kv-fade">
        <div
          v-if="rightPanelVisible"
          class="absolute inset-0 z-20"
          style="background-color: rgba(0,0,0,0.6);"
          aria-hidden="true"
          @click="closeRightPanel"
        />
      </Transition>

      <!-- Panel overlay -->
      <Transition name="kv-slide-right">
        <div
          v-if="rightPanelVisible"
          class="absolute right-0 inset-y-0 z-30 flex overflow-hidden rounded-[var(--kv-radius-lg)]"
          :style="{ width: 'var(--kv-panel-width)' }"
          role="dialog"
          :aria-label="t('member.panel')"
        >
          <GuildSearchPanel
            v-if="searchOpen && guildsStore.activeGuildId"
            :key="guildsStore.activeGuildId"
            :guild-id="guildsStore.activeGuildId"
            class="flex w-full"
          />
          <MemberPanel v-else class="flex w-full" />
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.kv-fade-enter-active,
.kv-fade-leave-active {
  transition: opacity 0.25s ease;
}
.kv-fade-enter-from,
.kv-fade-leave-to {
  opacity: 0;
}
.kv-slide-right-enter-active,
.kv-slide-right-leave-active {
  transition: transform 0.3s ease;
}
.kv-slide-right-enter-from,
.kv-slide-right-leave-to {
  transform: translateX(100%);
}
</style>
