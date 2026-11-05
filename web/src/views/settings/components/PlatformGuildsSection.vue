<script setup lang="ts">
/**
 * PlatformGuildsSection — Admin ortam listesi (C48 Rev 1/2). Yalnız isModerator, UserSettingsView admin sekmesinden.
 * Keşfet'e açık olmayan test ortamlarını da gösterir; üye olarak katılınabilir, silinebilir
 * (soft-delete, onay penceresi ile).
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import type { AdminGuildDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import { useGuildsStore } from '@/stores/guilds'
import { useDiscoverJoin } from '@/composables/useDiscoverJoin'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

const { t } = useI18n()
const toast = useToastStore()
const guildsStore = useGuildsStore()
const { goToGuild } = useDiscoverJoin()

const guilds = ref<AdminGuildDto[]>([])
const loading = ref(false)
const loadError = ref('')
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLocaleLowerCase('tr-TR')
  if (!q) return guilds.value
  return guilds.value.filter(
    (g) =>
      g.name.toLocaleLowerCase('tr-TR').includes(q) ||
      g.ownerUsername.toLocaleLowerCase('tr-TR').includes(q),
  )
})

async function loadGuilds() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await adminApi.listGuilds()
    guilds.value = res.data
  } catch {
    loadError.value = t('admin.guilds.loadError')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadGuilds()
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function initial(name: string): string {
  return name.trim().charAt(0).toLocaleUpperCase('tr-TR')
}

// Silme onayı (KvModal; tarayıcı confirm() yasak)
const deleteTarget = ref<AdminGuildDto | null>(null)
const deleting = ref(false)

// Katıl: Keşfet katılımıyla aynı varış akışı; zaten üyeyse (409) ortama yönlen
const joiningId = ref<string | null>(null)

async function joinGuild(g: AdminGuildDto) {
  if (joiningId.value) return
  joiningId.value = g.id
  try {
    const res = await adminApi.joinGuild(g.id)
    if (!guildsStore.guilds.find((x) => x.id === res.data.id)) guildsStore.guilds.push(res.data)
    await goToGuild(g.id)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    if (err.response?.data?.error === 'ALREADY_MEMBER') {
      await goToGuild(g.id)
      return
    }
    toast.error(err.response?.data?.message ?? t('admin.guilds.joinError'))
  } finally {
    joiningId.value = null
  }
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value) return
  deleting.value = true
  try {
    await adminApi.deleteGuild(target.id)
    guilds.value = guilds.value.filter((g) => g.id !== target.id)
    toast.info(t('admin.guilds.deleted', { name: target.name }))
    deleteTarget.value = null
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(msg ?? t('admin.guilds.deleteError'))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('admin.guilds.title') }}
      </h3>
      <div class="flex items-center gap-3">
        <span v-if="!loading && !loadError" class="text-[12px]" style="color: var(--kv-text-muted);">
          {{ t('admin.guilds.count', { count: guilds.length }) }}
        </span>
        <button
          class="text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-accent-500);"
          :disabled="loading"
          @click="loadGuilds"
        >
          {{ t('admin.guilds.refresh') }}
        </button>
      </div>
    </div>

    <input
      v-model="query"
      type="search"
      :placeholder="t('admin.guilds.search')"
      class="w-full px-3 py-2 text-[13px] rounded-[var(--kv-radius-md)] outline-none"
      style="background-color: var(--kv-bg-sidebar); color: var(--kv-text-primary);"
    />

    <div v-if="loading" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('common.loading') }}
    </div>
    <p v-else-if="loadError" class="text-[13px]" style="color: var(--kv-danger);">{{ loadError }}</p>
    <p v-else-if="guilds.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('admin.guilds.empty') }}
    </p>
    <p v-else-if="filtered.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('admin.guilds.noResults') }}
    </p>

    <div
      v-else
      class="rounded-[var(--kv-radius-lg)] overflow-hidden divide-y divide-[color:var(--kv-border-subtle)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div
        class="flex max-md:hidden items-center gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest"
        style="color: var(--kv-text-muted); background-color: var(--kv-bg-elevated);"
      >
        <span class="flex-1 min-w-0">{{ t('admin.guilds.colGuild') }}</span>
        <span class="w-[140px] shrink-0">{{ t('admin.guilds.colOwner') }}</span>
        <span class="w-[60px] shrink-0 text-right">{{ t('admin.guilds.colMembers') }}</span>
        <span class="w-[130px] shrink-0">{{ t('admin.guilds.colCreated') }}</span>
        <span class="w-[110px] shrink-0" />
      </div>

      <div
        v-for="g in filtered"
        :key="g.id"
        class="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3"
      >
        <div class="flex-1 min-w-0 flex items-center gap-3">
          <img
            v-if="g.iconUrl"
            :src="g.iconUrl"
            alt=""
            class="shrink-0 w-9 h-9 rounded-[var(--kv-radius-md)] object-cover"
          />
          <span
            v-else
            class="shrink-0 w-9 h-9 rounded-[var(--kv-radius-md)] flex items-center justify-center text-[14px] font-bold"
            style="color: var(--kv-text-primary); background-color: var(--kv-bg-elevated);"
          >{{ initial(g.name) }}</span>
          <div class="min-w-0 flex items-center gap-2 flex-wrap">
            <span class="text-[14px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ g.name }}</span>
            <span
              v-if="g.discoverable"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
              style="color: var(--kv-accent-500); background-color: var(--kv-bg-elevated);"
            >{{ t('admin.guilds.badgeDiscoverable') }}</span>
          </div>
        </div>

        <div class="w-full md:w-[140px] shrink-0 min-w-0">
          <span class="text-[12px] truncate block" :title="g.ownerUsername" style="color: var(--kv-text-muted);">
            {{ g.ownerUsername }}
          </span>
        </div>

        <div class="w-full md:w-[60px] shrink-0 md:text-right text-[12px]" style="color: var(--kv-text-muted);">
          <span class="md:hidden">{{ t('admin.guilds.memberCount', { count: g.memberCount }) }}</span>
          <span class="max-md:hidden">{{ g.memberCount }}</span>
        </div>

        <div class="w-full md:w-[130px] shrink-0">
          <span class="text-[12px]" style="color: var(--kv-text-muted);">{{ formatDate(g.createdAt) }}</span>
        </div>

        <div class="w-full md:w-[110px] shrink-0 flex items-center gap-1 md:justify-end">
          <button
            type="button"
            class="text-[12px] font-medium px-2.5 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)] disabled:opacity-50"
            style="color: var(--kv-accent-500);"
            :disabled="joiningId !== null"
            @click="joinGuild(g)"
          >
            {{ t('admin.guilds.join') }}
          </button>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
            style="color: var(--kv-danger);"
            :title="t('admin.guilds.delete')"
            :aria-label="t('admin.guilds.delete')"
            @click="deleteTarget = g"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <KvModal v-if="deleteTarget" :title="t('admin.guilds.deleteTitle')" @close="deleteTarget = null">
    <p class="text-[14px] font-medium mb-1" style="color: var(--kv-text-primary);">{{ deleteTarget.name }}</p>
    <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('admin.guilds.deleteBody') }}</p>
    <div class="flex justify-end gap-2 mt-5">
      <KvButton type="button" variant="ghost" :disabled="deleting" @click="deleteTarget = null">
        {{ t('common.cancel') }}
      </KvButton>
      <KvButton type="button" variant="danger" :loading="deleting" @click="confirmDelete">
        {{ t('admin.guilds.deleteConfirm') }}
      </KvButton>
    </div>
  </KvModal>
</template>
