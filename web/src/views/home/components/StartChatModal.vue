<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFriendsStore } from '@/stores/friends'
import { useDmStore } from '@/stores/dm'

const emit = defineEmits<{ close: []; created: [channelId: string] }>()

const { t } = useI18n()
const friendsStore = useFriendsStore()
const dmStore = useDmStore()

const selectedIds = ref<Set<string>>(new Set())
const groupName = ref('')
const submitting = ref(false)
const error = ref('')

const friends = computed(() => friendsStore.friends)
const selectionCount = computed(() => selectedIds.value.size)
const isGroup = computed(() => selectionCount.value >= 2)

function toggleFriend(id: string) {
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  } else {
    selectedIds.value.add(id)
  }
  // trigger reactivity
  selectedIds.value = new Set(selectedIds.value)
}

async function submit() {
  if (selectionCount.value === 0 || submitting.value) return
  error.value = ''
  submitting.value = true
  try {
    const ids = Array.from(selectedIds.value)
    let channel
    if (ids.length === 1) {
      // 1-1 DM — canDm kapısı (minör+arkadaş izinli)
      channel = await dmStore.openChannel(ids[0])
    } else {
      // Grup DM — grup kapısı (minör reddedilir)
      const name = groupName.value.trim() || undefined
      channel = await dmStore.createGroup(ids, name)
    }
    emit('created', channel.id)
  } catch {
    // Jenerik hata — GROUP_MINOR_FORBIDDEN veya NOT_FRIEND / canDm sebep gösterilmez (T&S: statü sızdırma yok)
    error.value = t('startChat.error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-stretch md:items-center md:justify-center"
    style="background-color: rgba(0,0,0,0.6);"
    @click.self="emit('close')"
  >
    <div
      class="w-full h-full flex flex-col rounded-none overflow-hidden
             md:w-[420px] md:h-auto md:max-h-[80vh] md:rounded-[var(--kv-radius-lg)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <!-- Başlık -->
      <div
        class="flex items-center justify-between px-5 py-4 border-b shrink-0"
        style="border-color: var(--kv-border-subtle);"
      >
        <h2 class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('startChat.title') }}
        </h2>
        <button
          class="text-[20px] leading-none cursor-pointer transition-opacity hover:opacity-70"
          style="color: var(--kv-text-muted);"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Grup adı — yalnızca 2+ seçimde görünür -->
      <div v-if="isGroup" class="px-5 pt-4 pb-2 shrink-0">
        <label class="block text-[11px] font-semibold uppercase tracking-wide mb-1" style="color: var(--kv-text-muted);">
          {{ t('startChat.groupNameLabel') }}
        </label>
        <input
          v-model="groupName"
          maxlength="50"
          :placeholder="t('startChat.groupNamePlaceholder')"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border"
          style="background-color: var(--kv-bg-content); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        />
      </div>

      <!-- Kanka listesi başlığı -->
      <p class="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide shrink-0" style="color: var(--kv-text-muted);">
        {{ t('startChat.selectFriends') }}
      </p>

      <!-- Kanka listesi (scroll) -->
      <div class="flex-1 overflow-y-auto px-3 pb-2">
        <p
          v-if="!friends.length"
          class="px-2 py-3 text-[13px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('startChat.noFriends') }}
        </p>
        <button
          v-for="f in friends"
          :key="f.user.id"
          class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer text-left"
          :style="selectedIds.has(f.user.id)
            ? 'background-color: var(--kv-accent-subtle);'
            : ''"
          @click="toggleFriend(f.user.id)"
        >
          <!-- Checkbox göstergesi -->
          <div
            class="w-4 h-4 rounded-sm border shrink-0 flex items-center justify-center"
            :style="selectedIds.has(f.user.id)
              ? 'background-color: var(--kv-accent-500); border-color: var(--kv-accent-500);'
              : 'border-color: var(--kv-border-strong);'"
          >
            <svg
              v-if="selectedIds.has(f.user.id)"
              width="10" height="10" viewBox="0 0 12 12" fill="none"
              stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            >
              <polyline points="2,6 5,9 10,3" />
            </svg>
          </div>

          <!-- Avatar -->
          <div
            class="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[12px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="f.user.avatarUrl"
              :src="f.user.avatarUrl"
              :alt="f.user.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ f.user.username[0].toUpperCase() }}</span>
          </div>

          <span class="text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">
            {{ f.user.username }}
          </span>
        </button>
      </div>

      <!-- Hata + Aksiyonlar -->
      <div class="px-5 pb-5 pt-3 shrink-0 border-t" style="border-color: var(--kv-border-subtle);">
        <p v-if="error" class="text-[13px] mb-2" style="color: var(--kv-danger);">
          {{ error }}
        </p>
        <div class="flex gap-2 justify-end">
          <button
            class="px-4 py-2 text-[14px] font-medium rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            @click="emit('close')"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="px-4 py-2 text-[14px] font-semibold rounded-[var(--kv-radius-md)] transition-opacity"
            :class="selectionCount === 0 || submitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'"
            style="background-color: var(--kv-accent-500); color: #fff;"
            :disabled="selectionCount === 0 || submitting"
            @click="submit"
          >
            <span v-if="submitting">{{ t('startChat.submitting') }}</span>
            <span v-else-if="isGroup">{{ t('startChat.createGroup') }}</span>
            <span v-else>{{ t('startChat.openChat') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
