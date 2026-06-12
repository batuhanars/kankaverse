<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import KvButton from '@/components/ui/KvButton.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()

type Step = 'choose' | 'create' | 'join'
const step = ref<Step>('choose')
const name = ref('')
const guildId = ref('')
const error = ref('')
const loading = ref(false)

function reset() {
  step.value = 'choose'
  name.value = ''
  guildId.value = ''
  error.value = ''
  loading.value = false
}

async function handleCreate() {
  if (!name.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const guild = await guildsStore.createGuild(name.value.trim())
    guildsStore.setActiveGuild(guild.id)
    await channelsStore.fetchChannels(guild.id)
    const channels = channelsStore.channelsForGuild(guild.id)
    if (channels.length) channelsStore.setActiveChannel(channels[0].id)
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    error.value =
      code === 'EMAIL_NOT_VERIFIED'
        ? t('auth.errors.EMAIL_NOT_VERIFIED')
        : err.response?.data?.message ?? t('common.error')
  } finally {
    loading.value = false
  }
}

async function handleJoin() {
  if (!guildId.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const guild = await guildsStore.joinGuild(guildId.value.trim())
    guildsStore.setActiveGuild(guild.id)
    await channelsStore.fetchChannels(guild.id)
    const channels = channelsStore.channelsForGuild(guild.id)
    if (channels.length) channelsStore.setActiveChannel(channels[0].id)
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string; error?: string } } }
    const code = err.response?.data?.error
    error.value =
      (code && t(`guild.errors.${code}`, '')) || err.response?.data?.message || t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center"
      style="background-color: var(--kv-bg-overlay);"
      @click.self="emit('close')"
    >
      <div
        class="relative w-full rounded-[var(--kv-radius-lg)] overflow-hidden"
        style="max-width: 440px; background-color: var(--kv-bg-sidebar);"
        role="dialog"
        aria-modal="true"
      >
        <!-- Kapat butonu -->
        <button
          class="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)] z-10"
          style="color: var(--kv-text-muted);"
          @click="emit('close')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- ── Adım 1: Seç ── -->
        <template v-if="step === 'choose'">
          <div class="px-6 pt-7 pb-2 text-center">
            <h2 class="text-[22px] font-bold mb-2" style="color: var(--kv-text-primary);">
              {{ t('guild.modal.chooseTitle') }}
            </h2>
            <p class="text-[14px] leading-relaxed" style="color: var(--kv-text-muted);">
              {{ t('guild.modal.chooseDesc') }}
            </p>
          </div>

          <div class="px-4 pb-4 mt-4 flex flex-col gap-2">
            <!-- Kendin Oluştur -->
            <button
              class="flex items-center gap-4 w-full px-4 py-3.5 rounded-[var(--kv-radius-md)] border text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
              style="border-color: var(--kv-border-subtle);"
              @click="step = 'create'"
            >
              <span class="text-[24px] shrink-0 leading-none">🏗️</span>
              <div class="flex-1 min-w-0">
                <p class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
                  {{ t('guild.modal.createOption') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guild.modal.createOptionDesc') }}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="color: var(--kv-text-muted);">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <!-- Bir Sunucuya Katıl -->
            <button
              class="flex items-center gap-4 w-full px-4 py-3.5 rounded-[var(--kv-radius-md)] border text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
              style="border-color: var(--kv-border-subtle);"
              @click="step = 'join'"
            >
              <span class="text-[24px] shrink-0 leading-none">🔗</span>
              <div class="flex-1 min-w-0">
                <p class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
                  {{ t('guild.modal.joinOption') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guild.modal.joinOptionDesc') }}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="color: var(--kv-text-muted);">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </template>

        <!-- ── Adım 2a: Sunucu Oluştur ── -->
        <template v-else-if="step === 'create'">
          <div class="px-6 pt-7 pb-6">
            <!-- Geri -->
            <button
              class="flex items-center gap-1.5 text-[13px] mb-5 cursor-pointer transition-colors hover:opacity-80"
              style="color: var(--kv-text-muted);"
              @click="reset"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              {{ t('guild.modal.back') }}
            </button>

            <h2 class="text-[22px] font-bold mb-1" style="color: var(--kv-text-primary);">
              {{ t('guild.modal.createTitle') }}
            </h2>
            <p class="text-[13px] mb-6" style="color: var(--kv-text-muted);">
              {{ t('guild.modal.createDesc') }}
            </p>

            <form @submit.prevent="handleCreate">
              <label class="block text-[11px] font-semibold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
                {{ t('guild.nameLabel') }}
              </label>
              <input
                v-model="name"
                :placeholder="t('guild.namePlaceholder')"
                required
                class="w-full px-3 py-2.5 text-[14px] rounded-[var(--kv-radius-md)] outline-none mb-1"
                style="background-color: var(--kv-bg-rail); color: var(--kv-text-primary); border: 1px solid var(--kv-border-subtle);"
                @focus="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-accent-500)'"
                @blur="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-border-subtle)'"
              />
              <p v-if="error" class="text-[12px] mb-3" style="color: var(--kv-danger);">{{ error }}</p>

              <div class="flex justify-between items-center mt-5">
                <KvButton variant="ghost" type="button" @click="emit('close')">
                  {{ t('common.cancel') }}
                </KvButton>
                <KvButton type="submit" :loading="loading">
                  {{ t('guild.createButton') }}
                </KvButton>
              </div>
            </form>
          </div>
        </template>

        <!-- ── Adım 2b: Sunucuya Katıl ── -->
        <template v-else-if="step === 'join'">
          <div class="px-6 pt-7 pb-6">
            <!-- Geri -->
            <button
              class="flex items-center gap-1.5 text-[13px] mb-5 cursor-pointer transition-colors hover:opacity-80"
              style="color: var(--kv-text-muted);"
              @click="reset"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              {{ t('guild.modal.back') }}
            </button>

            <h2 class="text-[22px] font-bold mb-1" style="color: var(--kv-text-primary);">
              {{ t('guild.modal.joinTitle') }}
            </h2>
            <p class="text-[13px] mb-6" style="color: var(--kv-text-muted);">
              {{ t('guild.modal.joinDesc') }}
            </p>

            <form @submit.prevent="handleJoin">
              <label class="block text-[11px] font-semibold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
                {{ t('guild.idLabel') }}
              </label>
              <input
                v-model="guildId"
                :placeholder="t('guild.idPlaceholder')"
                required
                class="w-full px-3 py-2.5 text-[14px] rounded-[var(--kv-radius-md)] outline-none mb-1"
                style="background-color: var(--kv-bg-rail); color: var(--kv-text-primary); border: 1px solid var(--kv-border-subtle);"
                @focus="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-accent-500)'"
                @blur="($event.target as HTMLInputElement).style.borderColor = 'var(--kv-border-subtle)'"
              />
              <p v-if="error" class="text-[12px] mb-3" style="color: var(--kv-danger);">{{ error }}</p>

              <div class="flex justify-between items-center mt-5">
                <KvButton variant="ghost" type="button" @click="emit('close')">
                  {{ t('common.cancel') }}
                </KvButton>
                <KvButton type="submit" :loading="loading">
                  {{ t('guild.joinButton') }}
                </KvButton>
              </div>
            </form>
          </div>
        </template>

      </div>
    </div>
  </Teleport>
</template>
