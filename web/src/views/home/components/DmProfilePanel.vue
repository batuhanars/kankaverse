<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { usersApi } from '@/api/users'
import { useFriendsStore } from '@/stores/friends'
import { useToastStore } from '@/stores/toast'
import { renderMessageHtml } from '@/utils/markdown'
import { bannerBackground } from '@/utils/bannerColor'
import FullProfileModal from '@/components/shared/FullProfileModal.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
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

// ── SPRINT_DM_MENU §4 — panel aksiyonları (Kanka Ekle · Şikâyet Et) ──
// Panel kartı zaten çekiyor, yeni istek yok. ≥1280'de kanka ekleme kapısı burasıdır;
// başlıktaki ikon `xl:hidden` ile yalnız panel gizliyken görünür (çift giriş yok).
const friendsStore = useFriendsStore()
const toast = useToastStore()
const addingFriend = ref(false)
const addFriendSent = ref(false)
const showReport = ref(false)

const canAddFriend = computed(
  () => !!card.value && card.value.friendStatus === 'none' && !addFriendSent.value,
)

/** Ret **jenerik** — sebep/statü gösterilmez (Sprint 4A G2 kuralı). */
async function addFriend() {
  if (addingFriend.value) return
  addingFriend.value = true
  try {
    await friendsStore.sendRequestByUser(props.otherUser.id)
    addFriendSent.value = true
  } catch {
    toast.error(t('friends.addFailed'))
  } finally {
    addingFriend.value = false
  }
}

// Başka kullanıcıya geçilince "istek gönderildi" durumu sıfırlanır
watch(
  () => props.otherUser.id,
  () => {
    addFriendSent.value = false
    showReport.value = false
  },
)
</script>

<template>
  <aside
    class="shrink-0 flex flex-col mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 340px; background-color: var(--kv-bg-sidebar)"
  >
    <!-- Başlık: banner + banner'a binen avatar (absolute, overflow DIŞI → kırpılmaz; FullProfileModal deseni) -->
    <div class="relative shrink-0">
      <div
        class="h-[96px] relative overflow-hidden"
        :style="{ background: bannerBackground(card?.bannerColor ?? null) }"
      >
        <img
          v-if="card?.bannerUrl"
          :src="card.bannerUrl"
          alt=""
          class="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div
        class="absolute left-5 -bottom-9 z-10 w-[76px] h-[76px] rounded-full border-4 overflow-hidden flex items-center justify-center text-[26px] font-bold text-white"
        style="border-color: var(--kv-bg-sidebar); background-color: var(--kv-accent-500)"
      >
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ otherUser.username[0].toUpperCase() }}</span>
      </div>
    </div>

    <!-- Ad (banner'a binen avatar için üst boşluk) -->
    <div class="px-5 pt-11 shrink-0">
      <p class="text-[19px] font-bold leading-tight" style="color: var(--kv-text-primary)">
        {{ otherUser.username }}
      </p>
    </div>

    <!-- Profil detayları (kart geldiyse) -->
    <div v-if="card" class="flex-1 overflow-y-auto px-5 pt-4 pb-4 flex flex-col gap-3">
      <!-- Bilgi kartı: bio + üyelik tarihi -->
      <div
        class="rounded-[var(--kv-radius-md)] p-4 flex flex-col gap-4"
        style="background-color: var(--kv-bg-content)"
      >
        <section>
          <h3
            class="text-[11px] font-bold uppercase tracking-widest mb-1.5"
            style="color: var(--kv-text-muted)"
          >
            {{ t('profile.bio') }}
          </h3>
          <div
            v-if="card.bio"
            class="kv-md text-[13px] break-words leading-relaxed"
            style="color: var(--kv-text-body)"
            v-html="bioHtml"
          />
          <p v-else class="text-[13px]" style="color: var(--kv-text-muted)">
            {{ t('profile.noBio') }}
          </p>
        </section>

        <div class="h-px" style="background-color: var(--kv-border-subtle)" />

        <section>
          <h3
            class="text-[11px] font-bold uppercase tracking-widest mb-1.5"
            style="color: var(--kv-text-muted)"
          >
            {{ t('profile.memberSince') }}
          </h3>
          <p class="text-[13px]" style="color: var(--kv-text-body)">{{ memberSinceLabel }}</p>
        </section>
      </div>

      <!-- Ortak ortam/kanka satırları → tam profili açar -->
      <button
        v-if="card.mutualGuilds.length > 0"
        class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left hover:bg-[var(--kv-bg-elevated)]"
        style="background-color: var(--kv-bg-content)"
        @click="showFullProfile = true"
      >
        <span class="text-[13px] font-medium" style="color: var(--kv-text-secondary)">
          {{ t('profile.mutualGuildsCount', { count: card.mutualGuilds.length }) }}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="color: var(--kv-text-muted)"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <button
        v-if="card.mutualFriends.length > 0"
        class="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left hover:bg-[var(--kv-bg-elevated)]"
        style="background-color: var(--kv-bg-content)"
        @click="showFullProfile = true"
      >
        <span class="text-[13px] font-medium" style="color: var(--kv-text-secondary)">
          {{ t('profile.mutualFriendsCount', { count: card.mutualFriends.length }) }}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="color: var(--kv-text-muted)"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>

    <!-- Aksiyon satırları (SPRINT_DM_MENU §4). Şikâyet satırı `card` gelmese de durur:
         güvenlik aksiyonu veri kapısına bağlanmaz. -->
    <div class="px-5 pb-3 shrink-0 flex flex-col gap-2">
      <button
        v-if="canAddFriend"
        class="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80 text-left disabled:opacity-60"
        style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500)"
        :disabled="addingFriend"
        @click="addFriend"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        <span class="text-[13px] font-semibold">{{ t('friends.add') }}</span>
      </button>
      <p
        v-else-if="addFriendSent"
        class="px-4 py-2.5 text-[13px]"
        style="color: var(--kv-text-muted)"
      >
        {{ t('friends.requestSent') }}
      </p>

      <button
        class="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--kv-radius-md)] cursor-pointer transition-colors text-left hover:bg-[var(--kv-bg-elevated)]"
        style="color: var(--kv-danger)"
        @click="showReport = true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <span class="text-[13px] font-semibold">{{ t('report.reportUser') }}</span>
      </button>
    </div>

    <!-- Tam profil (alt sabit) -->
    <div v-if="card" class="p-4 border-t" style="border-color: var(--kv-border-subtle)">
      <button
        class="w-full py-2.5 text-[13px] font-semibold rounded-[var(--kv-radius-md)] cursor-pointer transition-opacity hover:opacity-80"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary)"
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

    <ReportModal
      v-if="showReport"
      target-type="USER"
      :target-id="otherUser.id"
      @close="showReport = false"
    />
  </aside>
</template>
