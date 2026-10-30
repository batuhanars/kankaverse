<script setup lang="ts">
/**
 * ConnectionsSection - C36 §4.5: Kullanıcı ayarları "Bağlantılar" bölümü (yalnız yetişkin; minörde menü maddesi yok).
 * Düzen: kısa açıklama, "Yeni bağlantı ekle" platform simge sırası (yalnız bayrağı açık ve bağlı olmayanlar),
 * bağlı hesap kartları (kopar x + "Profilimde göster"), altta "Yayınlarımı duyuran Ortamlar".
 * Bağlama OAuth ile yapılır: sunucu adresi verir, tarayıcı platforma gider, geri dönüşte `?link=` sonucu gelir.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { integrationsApi, streamAnnounceApi } from '@/api/integrations'
import { useToastStore } from '@/stores/toast'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import PlatformLogo from '@/components/shared/PlatformLogo.vue'
import type { AnnounceGuildDto, ExternalAccountDto, StreamProviderKey } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToastStore()

const PLATFORM_NAMES: Record<StreamProviderKey, string> = { kick: 'Kick', twitch: 'Twitch' }

const accounts = ref<ExternalAccountDto[]>([])
const flags = ref<Record<StreamProviderKey, boolean>>({ kick: false, twitch: false })
const announceGuilds = ref<AnnounceGuildDto[]>([])
const loading = ref(true)
const loadError = ref(false)
const linking = ref<StreamProviderKey | null>(null)
const unlinkTarget = ref<ExternalAccountDto | null>(null)
const busy = ref(false)

type LinkResult = 'linked' | 'taken' | 'error'
const resultBanner = ref<LinkResult | null>(null)

const linkedProviders = computed(() => new Set(accounts.value.map((a) => a.provider)))
// Yalnız bayrağı açık ve henüz bağlı olmayan platformlar (pasif / "yakında" simge KONMAZ)
const addable = computed(() =>
  (Object.keys(PLATFORM_NAMES) as StreamProviderKey[]).filter(
    (p) => flags.value[p] && !linkedProviders.value.has(p),
  ),
)

function apiMessage(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } }
  return err.response?.data?.message ?? t('common.error')
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [acc, prov] = await Promise.all([integrationsApi.list(), integrationsApi.providers()])
    accounts.value = acc.data
    flags.value = prov.data
    await loadAnnounceGuilds()
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function loadAnnounceGuilds() {
  announceGuilds.value =
    accounts.value.length > 0 ? (await integrationsApi.announceGuilds()).data : []
}

async function startLink(provider: StreamProviderKey) {
  if (linking.value) return
  linking.value = provider
  try {
    const { data } = await integrationsApi.link(provider)
    window.location.assign(data.url)
  } catch (e: unknown) {
    toast.error(apiMessage(e))
    linking.value = null
  }
}

async function toggleProfile(account: ExternalAccountDto, value: boolean) {
  const previous = account.showOnProfile
  account.showOnProfile = value
  try {
    await integrationsApi.setShowOnProfile(account.provider, value)
  } catch (e: unknown) {
    account.showOnProfile = previous
    toast.error(apiMessage(e))
  }
}

async function confirmUnlink() {
  if (!unlinkTarget.value) return
  busy.value = true
  try {
    await integrationsApi.unlink(unlinkTarget.value.provider)
    unlinkTarget.value = null
    await load()
  } catch (e: unknown) {
    toast.error(apiMessage(e))
  } finally {
    busy.value = false
  }
}

async function toggleAnnounce(guild: AnnounceGuildDto, value: boolean) {
  const previous = guild.optedIn
  guild.optedIn = value
  try {
    if (value) await streamAnnounceApi.optIn(guild.guildId)
    else await streamAnnounceApi.optOut(guild.guildId)
  } catch (e: unknown) {
    guild.optedIn = previous
    toast.error(apiMessage(e))
  }
}

onMounted(async () => {
  // Geri dönüş sonucu: ?link=linked|taken|error&provider=kick (bilgi bandı, sonra adres temizlenir)
  const link = route.query.link
  if (link === 'linked' || link === 'taken' || link === 'error') {
    resultBanner.value = link
    void router.replace({ query: {} })
  }
  await load()
})
</script>

<template>
  <div class="flex flex-col gap-6 max-w-xl">
    <p class="text-[14px]" style="color: var(--kv-text-secondary);">{{ t('connections.intro') }}</p>

    <p
      v-if="resultBanner"
      role="status"
      class="px-3 py-2 text-[13px] rounded-[var(--kv-radius-md)] border"
      :style="resultBanner === 'linked'
        ? 'background-color: var(--kv-bg-elevated); border-color: var(--kv-accent-500); color: var(--kv-text-primary);'
        : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-danger); color: var(--kv-danger);'"
    >
      {{ t(`connections.result.${resultBanner}`) }}
    </p>

    <p v-if="loading" class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
    <p v-else-if="loadError" class="text-[14px]" style="color: var(--kv-danger);">
      {{ t('common.error') }}
      <button type="button" class="underline cursor-pointer" @click="load">{{ t('common.retry') }}</button>
    </p>

    <template v-else>
      <!-- Yeni bağlantı ekle -->
      <section v-if="addable.length > 0" class="flex flex-col gap-3">
        <h3 class="text-[12px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('connections.addTitle') }}
        </h3>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="p in addable"
            :key="p"
            type="button"
            :aria-label="t('connections.addAria', { platform: PLATFORM_NAMES[p] })"
            :title="PLATFORM_NAMES[p]"
            :disabled="linking !== null"
            class="w-12 h-12 flex items-center justify-center rounded-[var(--kv-radius-md)] border cursor-pointer transition-colors disabled:opacity-50 hover:brightness-125"
            style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong);"
            @click="startLink(p)"
          >
            <PlatformLogo :provider="p" :size="26" />
          </button>
        </div>
        <p v-if="linking" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('connections.linking') }}</p>
      </section>
      <p
        v-else-if="accounts.length === 0"
        class="text-[14px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('connections.noProviders') }}
      </p>

      <!-- Bağlı hesap kartları -->
      <section v-if="accounts.length > 0" class="flex flex-col gap-2">
        <div
          v-for="a in accounts"
          :key="a.provider"
          class="flex flex-col gap-3 p-4 rounded-[var(--kv-radius-md)] border min-w-0"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
        >
          <div class="flex items-center gap-3 min-w-0">
            <PlatformLogo :provider="a.provider" :size="28" />
            <div class="min-w-0 flex-1">
              <p class="text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ a.username }}</p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ PLATFORM_NAMES[a.provider] }}</p>
            </div>
            <button
              type="button"
              :aria-label="t('connections.unlinkAria', { platform: PLATFORM_NAMES[a.provider] })"
              class="w-8 h-8 shrink-0 flex items-center justify-center rounded-full cursor-pointer hover:brightness-125"
              style="color: var(--kv-text-muted);"
              @click="unlinkTarget = a"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" /></svg>
            </button>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('connections.showOnProfile') }}</span>
            <KvSwitch :model-value="a.showOnProfile" @update:model-value="toggleProfile(a, $event)" />
          </div>
        </div>
      </section>

      <!-- Yayınlarımı duyuran Ortamlar -->
      <section v-if="accounts.length > 0" class="flex flex-col gap-3">
        <h3 class="text-[12px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('connections.announceTitle') }}
        </h3>
        <p v-if="announceGuilds.length === 0" class="text-[14px]" style="color: var(--kv-text-muted);">
          {{ t('connections.announceEmpty') }}
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="g in announceGuilds"
            :key="g.guildId"
            class="flex items-center gap-3 p-3 rounded-[var(--kv-radius-md)] min-w-0"
            style="background-color: var(--kv-bg-elevated);"
          >
            <img
              v-if="g.iconUrl"
              :src="g.iconUrl"
              alt=""
              class="w-8 h-8 rounded-full object-cover shrink-0"
            />
            <span
              v-else
              class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold"
              style="background-color: var(--kv-bg-rail); color: var(--kv-text-secondary);"
              aria-hidden="true"
            >{{ g.name.slice(0, 1).toUpperCase() }}</span>
            <span class="flex-1 min-w-0 truncate text-[14px]" style="color: var(--kv-text-primary);">{{ g.name }}</span>
            <span class="text-[12px] shrink-0" style="color: var(--kv-text-muted);">{{ t('connections.announceSwitch') }}</span>
            <KvSwitch :model-value="g.optedIn" @update:model-value="toggleAnnounce(g, $event)" />
          </li>
        </ul>
      </section>
    </template>

    <ConfirmDialog
      v-if="unlinkTarget"
      :title="t('connections.unlinkTitle')"
      :message="t('connections.unlinkMessage', { platform: PLATFORM_NAMES[unlinkTarget.provider] })"
      :confirm-label="t('connections.unlinkConfirm')"
      :loading="busy"
      @confirm="confirmUnlink"
      @cancel="unlinkTarget = null"
    />
  </div>
</template>
