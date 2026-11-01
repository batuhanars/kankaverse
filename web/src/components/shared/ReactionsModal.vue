<script setup lang="ts">
/**
 * "Tepkileri gör" penceresi (C46 §5.3): üstte emoji sekmeleri ("Tümü" + her emoji ve sayısı),
 * altta avatar + ad kaydırmalı liste; kişiye tıklayınca kullanıcı kartı.
 * Veri GET /channels/:id/messages/:messageId/reactions (önbellekli, tepki olayında düşer).
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import UserAvatar from './UserAvatar.vue'
import UserCardPopover from './UserCardPopover.vue'
import { getReactionUsers } from '@/composables/useReactionUsers'
import type { ReactionGroupDto } from '@/types'

const props = defineProps<{ channelId: string; messageId: string; guildId?: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const ALL = '__all__'
const groups = ref<ReactionGroupDto[]>([])
const loading = ref(true)
const failed = ref(false)
const activeTab = ref(ALL)

type Row = { key: string; emoji: string; id: string; username: string; avatarUrl: string | null }

const tabs = computed(() => [
  { key: ALL, label: t('reaction.all'), count: groups.value.reduce((n, g) => n + g.count, 0) },
  ...groups.value.map((g) => ({ key: g.emoji, label: g.emoji, count: g.count })),
])

// Her kişi mesajda tek tepki bırakabildiği için "Tümü" listesinde kişi tekrarlanmaz.
const rows = computed<Row[]>(() =>
  groups.value
    .filter((g) => activeTab.value === ALL || g.emoji === activeTab.value)
    .flatMap((g) =>
      g.users.map((u) => ({ key: `${g.emoji}:${u.id}`, emoji: g.emoji, ...u })),
    ),
)

const showCard = ref(false)
const cardUserId = ref('')
const cardX = ref(0)
const cardY = ref(0)

function openCard(e: MouseEvent, userId: string) {
  cardUserId.value = userId
  cardX.value = e.clientX
  cardY.value = e.clientY
  showCard.value = true
}

onMounted(async () => {
  try {
    groups.value = await getReactionUsers(props.channelId, props.messageId)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <KvModal :title="t('reaction.whoReacted')" @close="emit('close')">
    <p v-if="loading" class="text-[13px] py-6 text-center" style="color: var(--kv-text-muted);">
      {{ t('common.loading') }}
    </p>
    <p v-else-if="failed || !groups.length" class="text-[13px] py-6 text-center" style="color: var(--kv-text-muted);">
      {{ failed ? t('common.error') : t('reaction.empty') }}
    </p>
    <template v-else>
      <!-- Sekmeler: yatay kaydırılır (320px'te taşmaz) -->
      <div class="flex gap-1.5 overflow-x-auto pb-2 mb-2 border-b" style="border-color: var(--kv-border-subtle);">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] cursor-pointer border transition-colors"
          :style="activeTab === tab.key
            ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
            : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <span class="text-[12px] font-medium">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Kişi listesi -->
      <ul class="flex flex-col">
        <li v-for="row in rows" :key="row.key">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] cursor-pointer text-left transition-colors hover:bg-[var(--kv-bg-elevated)]"
            @click="openCard($event, row.id)"
          >
            <UserAvatar :username="row.username" :avatar-url="row.avatarUrl" />
            <span class="flex-1 min-w-0 truncate text-[14px]" style="color: var(--kv-text-primary);">
              {{ row.username }}
            </span>
            <span v-if="activeTab === ALL" class="text-[16px] shrink-0">{{ row.emoji }}</span>
          </button>
        </li>
      </ul>
    </template>
  </KvModal>

  <UserCardPopover
    v-if="showCard"
    :user-id="cardUserId"
    :x="cardX"
    :y="cardY"
    :guild-id="guildId"
    @close="showCard = false"
  />
</template>
