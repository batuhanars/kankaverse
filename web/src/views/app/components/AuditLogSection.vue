<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { guildsApi } from '@/api/guilds'
import KvButton from '@/components/ui/KvButton.vue'
import type { AuditLogEntryDto } from '@/types'

const props = defineProps<{
  guildId: string
}>()

const { t } = useI18n()

const PAGE_SIZE = 50

const entries = ref<AuditLogEntryDto[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(false)
const hasMore = ref(false)

// action → i18n cümle anahtarı eşlemesi; bilinmeyen action → fallback
const ACTION_KEYS: Record<string, string> = {
  'guild.member_kicked': 'audit.action.member_kicked',
  'guild.member_banned': 'audit.action.member_banned',
  'guild.member_unbanned': 'audit.action.member_unbanned',
  'guild.member_role_updated': 'audit.action.member_role_updated',
  'guild.ownership_transferred': 'audit.action.ownership_transferred',
}

function sentenceKey(entry: AuditLogEntryDto): string {
  const key = ACTION_KEYS[entry.action]
  // target gerektiren cümle ama target yoksa → genel fallback
  if (!key || !entry.targetUser) return 'audit.action.fallback'
  return key
}

function avatarInitial(username: string): string {
  return username[0]?.toUpperCase() ?? '?'
}

// createdAt → "25 Ekim 2023 18.42" (TR formatı; saat ayıracı nokta)
function formatDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  return `${date} ${time}`
}

async function load(before?: string) {
  if (before) loadingMore.value = true
  else loading.value = true
  error.value = false
  try {
    const res = await guildsApi.getAuditLogs(props.guildId, before)
    const batch = res.data
    if (before) entries.value.push(...batch)
    else entries.value = batch
    hasMore.value = batch.length === PAGE_SIZE
  } catch {
    error.value = true
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  const last = entries.value[entries.value.length - 1]
  if (last) load(last.id)
}

const isEmpty = computed(() => !loading.value && !error.value && entries.value.length === 0)

onMounted(() => load())
</script>

<template>
  <section class="flex flex-col gap-4 max-w-xl">
    <div>
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
        {{ t('audit.title') }}
      </h3>
      <p class="text-[12px]" style="color: var(--kv-text-muted);">
        {{ t('audit.subtitle') }}
      </p>
    </div>

    <!-- Yükleniyor (ilk) -->
    <p v-if="loading" class="text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('audit.loading') }}
    </p>

    <!-- Hata -->
    <p v-else-if="error" class="text-[13px]" style="color: var(--kv-danger);">
      {{ t('audit.error') }}
    </p>

    <!-- Boş durum -->
    <p v-else-if="isEmpty" class="text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('audit.empty') }}
    </p>

    <!-- Kayıt listesi -->
    <ul v-else class="flex flex-col gap-1.5">
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--kv-radius-md)] border"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >
        <!-- Actor avatarı (daire) -->
        <div
          class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
          style="background-color: var(--kv-accent-500);"
        >
          <img
            v-if="entry.actor.avatarUrl"
            :src="entry.actor.avatarUrl"
            :alt="entry.actor.username"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ avatarInitial(entry.actor.username) }}</span>
        </div>

        <div class="flex-1 min-w-0">
          <!-- İnsan-okur Türkçe cümle (i18n-t ile actor/target bold) -->
          <i18n-t :keypath="sentenceKey(entry)" tag="p" class="text-[14px]" style="color: var(--kv-text-primary);">
            <template #actor>
              <strong style="color: var(--kv-text-primary);">{{ entry.actor.username }}</strong>
            </template>
            <template v-if="entry.targetUser" #target>
              <strong style="color: var(--kv-text-primary);">{{ entry.targetUser.username }}</strong>
            </template>
          </i18n-t>

          <!-- Sebep -->
          <p v-if="entry.reason" class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
            {{ t('audit.reason', { reason: entry.reason }) }}
          </p>

          <!-- Tarih -->
          <p class="text-[11px] mt-1" style="color: var(--kv-text-muted);">
            {{ formatDate(entry.createdAt) }}
          </p>
        </div>
      </li>
    </ul>

    <!-- Daha fazla yükle -->
    <div v-if="hasMore && !loading && !error" class="pt-1">
      <KvButton variant="ghost" size="sm" :loading="loadingMore" @click="loadMore">
        {{ t('audit.loadMore') }}
      </KvButton>
    </div>
  </section>
</template>
