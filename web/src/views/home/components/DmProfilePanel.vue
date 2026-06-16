<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usersApi } from '@/api/users'
import { renderMessageHtml } from '@/utils/markdown'
import FullProfileModal from '@/components/shared/FullProfileModal.vue'
import type { FriendCodeUserDto, UserProfileCardDto } from '@/types'

const props = defineProps<{ otherUser: FriendCodeUserDto }>()

const { t } = useI18n()
const router = useRouter()

// Profil kartı (bio/üyelik/ortaklar) — GET /users/:id/card
const card = ref<UserProfileCardDto | null>(null)

watch(
  () => props.otherUser.id,
  async (id) => {
    card.value = null
    try {
      const { data } = await usersApi.getCard(id)
      card.value = data
    } catch {
      // erişim kapısı 404 → kart yok
      card.value = null
    }
  },
  { immediate: true },
)

const bioHtml = computed(() =>
  card.value?.bio ? renderMessageHtml(card.value.bio, () => undefined, '') : '',
)

const memberSinceLabel = computed(() =>
  card.value
    ? new Date(card.value.memberSince).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '',
)

const showFullProfile = ref(false)

function onOpenDm(channelId: string) {
  showFullProfile.value = false
  router.push({ name: 'dm', params: { channelId } })
}
</script>

<template>
  <aside
    class="shrink-0 flex flex-col mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 340px; background-color: var(--kv-bg-sidebar);"
  >
    <!-- Avatar + ad -->
    <div
      class="flex flex-col items-center pt-8 pb-6 px-4 gap-3 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <div
        class="w-16 h-16 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[22px] font-bold text-white"
        style="background-color: var(--kv-accent-500);"
      >
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ otherUser.username[0].toUpperCase() }}</span>
      </div>
      <p class="text-[16px] font-bold text-center" style="color: var(--kv-text-primary);">
        {{ otherUser.username }}
      </p>
    </div>

    <!-- Profil detayları (kart geldiyse) -->
    <div v-if="card" class="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      <!-- Bio -->
      <section>
        <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
          {{ t('profile.bio') }}
        </h3>
        <div
          v-if="card.bio"
          class="kv-md text-[13px] break-words"
          style="color: var(--kv-text-body);"
          v-html="bioHtml"
        />
        <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('profile.noBio') }}</p>
      </section>

      <!-- Üyelik tarihi -->
      <section>
        <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
          {{ t('profile.memberSince') }}
        </h3>
        <p class="text-[13px]" style="color: var(--kv-text-body);">{{ memberSinceLabel }}</p>
      </section>

      <!-- Ortak kanka/ortam (sayı + kısa liste) -->
      <section v-if="card.mutualFriends.length > 0">
        <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
          {{ t('profile.mutualFriendsCount', { count: card.mutualFriends.length }) }}
        </h3>
        <div class="flex flex-col gap-1">
          <div v-for="f in card.mutualFriends.slice(0, 3)" :key="f.id" class="flex items-center gap-2">
            <div
              class="w-5 h-5 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
              style="background-color: var(--kv-accent-500);"
            >
              <img v-if="f.avatarUrl" :src="f.avatarUrl" :alt="f.username" class="w-full h-full object-cover" />
              <span v-else>{{ f.username[0].toUpperCase() }}</span>
            </div>
            <span class="text-[12px] truncate" style="color: var(--kv-text-secondary);">{{ f.username }}</span>
          </div>
        </div>
      </section>

      <section v-if="card.mutualGuilds.length > 0">
        <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
          {{ t('profile.mutualGuildsCount', { count: card.mutualGuilds.length }) }}
        </h3>
        <div class="flex flex-col gap-1">
          <div v-for="g in card.mutualGuilds.slice(0, 3)" :key="g.id" class="flex items-center gap-2">
            <div
              class="w-5 h-5 shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold"
              style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            >
              <img v-if="g.iconUrl" :src="g.iconUrl" :alt="g.name" class="w-full h-full object-cover" />
              <span v-else>{{ g.name[0].toUpperCase() }}</span>
            </div>
            <span class="text-[12px] truncate" style="color: var(--kv-text-secondary);">{{ g.name }}</span>
          </div>
        </div>
      </section>

    </div>

    <!-- Tam profil (alt sabit) -->
    <div v-if="card" class="p-4 border-t" style="border-color: var(--kv-border-subtle);">
      <button
        class="w-full py-2 text-[13px] font-medium rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
        @click="showFullProfile = true"
      >
        {{ t('profile.viewFull') }}
      </button>
    </div>

    <FullProfileModal
      v-if="showFullProfile && card"
      :card="card"
      @close="showFullProfile = false"
      @open-dm="onOpenDm"
    />
  </aside>
</template>
