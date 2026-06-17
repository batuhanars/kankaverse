<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usersApi } from '@/api/users'
import { renderMessageHtml } from '@/utils/markdown'
import { bannerBackground } from '@/utils/bannerColor'
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
    <!-- Banner (afiş rengi; yoksa marka varsayılanı) -->
    <div class="h-[96px] shrink-0" :style="{ background: bannerBackground(card?.bannerColor ?? null) }" />

    <!-- Avatar (banner'a binen) + ad -->
    <div class="px-5 -mt-10">
      <div
        class="w-[76px] h-[76px] rounded-full border-4 shrink-0 overflow-hidden flex items-center justify-center text-[26px] font-bold text-white"
        style="border-color: var(--kv-bg-sidebar); background-color: var(--kv-accent-500);"
      >
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ otherUser.username[0].toUpperCase() }}</span>
      </div>
      <p class="mt-2.5 text-[19px] font-bold leading-tight" style="color: var(--kv-text-primary);">
        {{ otherUser.username }}
      </p>
    </div>

    <!-- Profil detayları (kart geldiyse) -->
    <div v-if="card" class="flex-1 overflow-y-auto px-5 pt-4 pb-4 flex flex-col gap-3">
      <!-- Bilgi kartı: bio + üyelik tarihi -->
      <div
        class="rounded-[var(--kv-radius-md)] p-4 flex flex-col gap-4"
        style="background-color: var(--kv-bg-content);"
      >
        <section>
          <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
            {{ t('profile.bio') }}
          </h3>
          <div
            v-if="card.bio"
            class="kv-md text-[13px] break-words leading-relaxed"
            style="color: var(--kv-text-body);"
            v-html="bioHtml"
          />
          <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('profile.noBio') }}</p>
        </section>

        <div class="h-px" style="background-color: var(--kv-border-subtle);" />

        <section>
          <h3 class="text-[11px] font-bold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
            {{ t('profile.memberSince') }}
          </h3>
          <p class="text-[13px]" style="color: var(--kv-text-body);">{{ memberSinceLabel }}</p>
        </section>
      </div>

      <!-- Ortak ortam/kanka satırları → tam profili açar -->
      <button
        v-if="card.mutualGuilds.length > 0"
        class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left hover:bg-[var(--kv-bg-elevated)]"
        style="background-color: var(--kv-bg-content);"
        @click="showFullProfile = true"
      >
        <span class="text-[13px] font-medium" style="color: var(--kv-text-secondary);">
          {{ t('profile.mutualGuildsCount', { count: card.mutualGuilds.length }) }}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <button
        v-if="card.mutualFriends.length > 0"
        class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left hover:bg-[var(--kv-bg-elevated)]"
        style="background-color: var(--kv-bg-content);"
        @click="showFullProfile = true"
      >
        <span class="text-[13px] font-medium" style="color: var(--kv-text-secondary);">
          {{ t('profile.mutualFriendsCount', { count: card.mutualFriends.length }) }}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- Tam profil (alt sabit) -->
    <div v-if="card" class="p-4 border-t" style="border-color: var(--kv-border-subtle);">
      <button
        class="w-full py-2.5 text-[13px] font-semibold rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
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
