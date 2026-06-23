<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useGuildsStore } from '@/stores/guilds'
import { guildsApi } from '@/api/guilds'
import { bannerBackground } from '@/utils/bannerColor'

const emit = defineEmits<{
  addFriend: []
  createOrtam: []
  joinOrtam: []
  importOrtam: []
  openGuild: [guildId: string]
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const guildsStore = useGuildsStore()

// Discord göçü bayrağı — yalnız açıkken "Discord'tan İçeri Aktar" hızlı aksiyonu görünür (ServerModal ile aynı kapı).
const discordImportEnabled = ref(false)
onMounted(async () => {
  try {
    const res = await guildsApi.discordImportStatus()
    discordImportEnabled.value = res.data.enabled === true
  } catch {
    discordImportEnabled.value = false
  }
})

// "Ağu 2025" — kuruluş tarihi kısa etiketi
function createdLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col mb-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
       style="background-color: var(--kv-bg-content);">
    <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">

      <!-- Karşılama -->
      <div class="px-1">
        <h1 class="text-[26px] font-bold mb-1.5" style="color: var(--kv-text-primary);">
          {{ t('home.welcome', { username: authStore.user?.username }) }} 👋
        </h1>
        <p class="text-[15px]" style="color: var(--kv-text-muted);">
          {{ t('home.welcomeSubtitle') }}
        </p>
      </div>

      <!-- Hızlı Aksiyonlar -->
      <div>
        <p class="section-label">{{ t('home.quickActions') }}</p>
        <div
          class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          :class="discordImportEnabled ? 'xl:grid-cols-4' : ''"
        >

          <!-- Kanka Ekle -->
          <button class="tile-btn" @click="emit('addFriend')">
            <div class="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--kv-accent-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </div>
            <div>
              <p class="tile-title">{{ t('home.addFriend') }}</p>
              <p class="tile-desc">{{ t('home.addFriendDesc') }}</p>
            </div>
          </button>

          <!-- Ortam Oluştur -->
          <button class="tile-btn" @click="emit('createOrtam')">
            <div class="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--kv-accent-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <p class="tile-title">{{ t('home.createOrtam') }}</p>
              <p class="tile-desc">{{ t('home.createOrtamDesc') }}</p>
            </div>
          </button>

          <!-- Ortama Katıl -->
          <button class="tile-btn" @click="emit('joinOrtam')">
            <div class="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--kv-accent-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div>
              <p class="tile-title">{{ t('home.joinOrtam') }}</p>
              <p class="tile-desc">{{ t('home.joinOrtamDesc') }}</p>
            </div>
          </button>

          <!-- Discord'tan İçeri Aktar (yalnız göç bayrağı açıkken) -->
          <button v-if="discordImportEnabled" class="tile-btn" @click="emit('importOrtam')">
            <div class="tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--kv-accent-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </div>
            <div>
              <p class="tile-title">{{ t('home.importOrtam') }}</p>
              <p class="tile-desc">{{ t('home.importOrtamDesc') }}</p>
            </div>
          </button>

        </div>
      </div>

      <!-- Ortamların -->
      <div>
        <p class="section-label">{{ t('home.myOrtamlar') }}</p>

        <p v-if="!guildsStore.guilds.length" class="empty-text">
          {{ t('home.noOrtam') }}
        </p>

        <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="guild in guildsStore.guilds"
            :key="guild.id"
            class="ortam-card"
            @click="emit('openGuild', guild.id)"
          >
            <!-- Afiş + altıgen simge -->
            <div class="ortam-card__banner" :style="{ background: bannerBackground(guild.bannerColor) }">
              <div class="ortam-card__icon">
                <img
                  v-if="guild.iconUrl"
                  :src="guild.iconUrl"
                  :alt="guild.name"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ guild.name.charAt(0).toUpperCase() }}</span>
              </div>
            </div>
            <!-- Gövde: ad + üye sayısı · kuruluş -->
            <div class="px-4 pt-7 pb-4">
              <p class="text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
                {{ guild.name }}
              </p>
              <p class="text-[12px] mt-1" style="color: var(--kv-text-muted);">
                <template v-if="guild.memberCount !== undefined">{{ t('discover.memberCount', { count: guild.memberCount }) }} · </template>{{ t('home.createdAt', { date: createdLabel(guild.createdAt) }) }}
              </p>
            </div>
          </button>
        </div>
      </div>

    </div>
    </div>
  </div>
</template>

<style scoped>
.section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--kv-text-muted);
  margin-bottom: 12px;
  padding: 0 2px;
}

.tile-btn {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: var(--kv-radius-md);
  text-align: left;
  cursor: pointer;
  width: 100%;
  border: 1px solid var(--kv-border-subtle);
  background-color: var(--kv-bg-elevated);
  transition: border-color 150ms ease;
}

.tile-btn:hover {
  border-color: var(--kv-accent-500);
}

.tile-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--kv-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--kv-accent-subtle);
  flex-shrink: 0;
}

.tile-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
  color: var(--kv-text-primary);
}

.tile-desc {
  font-size: 12px;
  color: var(--kv-text-muted);
}

.guild-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--kv-radius-md);
  cursor: pointer;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--kv-border-subtle);
  background-color: var(--kv-bg-elevated);
  transition: border-color 150ms ease;
}

.guild-btn:hover {
  border-color: var(--kv-accent-500);
}

/* Ortamların — tombul kart (afiş + altıgen simge + ad + üye/kuruluş) */
.ortam-card {
  display: flex;
  flex-direction: column;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  border-radius: var(--kv-radius-lg);
  overflow: hidden;
  border: 1px solid var(--kv-border-subtle);
  background-color: var(--kv-bg-elevated);
  transition: border-color 150ms ease;
}
.ortam-card:hover {
  border-color: var(--kv-accent-500);
}
.ortam-card__banner {
  position: relative;
  height: 64px;
  flex-shrink: 0;
}
.ortam-card__icon {
  position: absolute;
  left: 16px;
  bottom: -20px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background-color: var(--kv-accent-500);
}

.empty-text {
  font-size: 14px;
  padding: 4px 2px;
  color: var(--kv-text-muted);
}
</style>
