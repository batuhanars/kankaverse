<script setup lang="ts">
/**
 * UserSettingsView — Birleşik kullanıcı ayarları modalı (Sprint C5 §4).
 * GuildSettingsView modal+sol-nav desenini tekrar kullanır (Teleport, ESC, sol nav + sağ içerik).
 * Sekmeler: Hesap (mevcut Security Section'ları) · Profil (bio) · Gizlilik (dmPolicy).
 * Anti-placeholder: yalnız gerçek/enforced sekmeler — boş/future sekme YOK.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { usersApi } from '@/api/users'
import { DmPolicy } from '@/types'
import KvButton from '@/components/ui/KvButton.vue'
import TwoFactorSection from './components/TwoFactorSection.vue'
import SessionsSection from './components/SessionsSection.vue'
import ChangePasswordSection from './components/ChangePasswordSection.vue'
import ChangeEmailSection from './components/ChangeEmailSection.vue'
import DeleteAccountSection from './components/DeleteAccountSection.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const authStore = useAuthStore()

type NavSection = 'hesap' | 'profil' | 'gizlilik'
const activeSection = ref<NavSection>('hesap')

const navItems: { key: NavSection; labelKey: string }[] = [
  { key: 'hesap', labelKey: 'settings.tabAccount' },
  { key: 'profil', labelKey: 'settings.tabProfile' },
  { key: 'gizlilik', labelKey: 'settings.tabPrivacy' },
]

// ── ESC ile kapat ──────────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

// ── Profil: bio ──────────────────────────────────────────────────────────--
const BIO_MAX = 512
const draftBio = ref(authStore.user?.bio ?? '')
const savingBio = ref(false)
const bioError = ref('')
const bioSaved = ref(false)

const bioDirty = computed(() => draftBio.value !== (authStore.user?.bio ?? ''))

async function saveBio() {
  if (!bioDirty.value || savingBio.value) return
  savingBio.value = true
  bioError.value = ''
  bioSaved.value = false
  try {
    const { data } = await usersApi.updateProfile({ bio: draftBio.value.trim() })
    authStore.updateUser(data)
    draftBio.value = data.bio ?? ''
    bioSaved.value = true
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    bioError.value = err.response?.data?.message ?? t('settings.saveError')
  } finally {
    savingBio.value = false
  }
}

// ── Gizlilik: dmPolicy ──────────────────────────────────────────────────────
const savingPolicy = ref(false)
const policyError = ref('')
const policySaved = ref(false)
const policyOptions = [DmPolicy.EVERYONE, DmPolicy.FRIENDS, DmPolicy.NONE] as const

const currentPolicy = computed(() => authStore.user?.dmPolicy ?? DmPolicy.EVERYONE)

function policyLabel(p: DmPolicy): string {
  if (p === DmPolicy.EVERYONE) return t('settings.dmPolicy.everyone')
  if (p === DmPolicy.FRIENDS) return t('settings.dmPolicy.friends')
  return t('settings.dmPolicy.none')
}

async function selectPolicy(p: DmPolicy) {
  if (p === currentPolicy.value || savingPolicy.value) return
  savingPolicy.value = true
  policyError.value = ''
  policySaved.value = false
  try {
    const { data } = await usersApi.updateProfile({ dmPolicy: p })
    authStore.updateUser(data)
    policySaved.value = true
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    policyError.value = err.response?.data?.message ?? t('settings.saveError')
  } finally {
    savingPolicy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex"
      style="background-color: var(--kv-bg-overlay);"
      role="dialog"
      aria-modal="true"
      :aria-label="t('settings.title')"
    >
      <!-- Sol bölge: sidebar rengi tam yükseklik, nav sağa yaslı -->
      <div
        class="shrink-0 flex justify-end"
        style="width: 42%; min-width: 280px; max-width: 560px; background-color: var(--kv-bg-sidebar);"
      >
        <!-- Sol nav kolonu -->
        <div
          class="shrink-0 flex flex-col py-8 px-3 border-r"
          style="width: 220px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
        >
          <div class="px-2 mb-4">
            <p class="text-[11px] font-bold uppercase tracking-widest truncate" style="color: var(--kv-text-muted);">
              {{ t('settings.title') }}
            </p>
          </div>

          <nav class="flex flex-col gap-0.5 flex-1">
            <button
              v-for="item in navItems"
              :key="item.key"
              type="button"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] font-medium text-left cursor-pointer transition-colors"
              :class="activeSection === item.key
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
                : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]'"
              @click="activeSection = item.key"
            >
              {{ t(item.labelKey) }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Sağ içerik alanı -->
      <div class="flex-1 flex flex-col overflow-hidden" style="background-color: var(--kv-bg-content);">
        <!-- İçerik header -->
        <div
          class="shrink-0 flex items-center justify-between border-b"
          style="height: var(--kv-header-height); border-color: var(--kv-border-subtle);"
        >
          <div class="flex items-center justify-between flex-1" style="max-width: 1000px;">
            <h2 class="text-[18px] font-semibold px-8" style="color: var(--kv-text-primary);">
              {{ t(navItems.find((i) => i.key === activeSection)!.labelKey) }}
            </h2>
            <div class="flex items-center gap-3 px-8">
              <span class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">ESC</span>
              <button
                type="button"
                class="flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
                style="width: 32px; height: 32px; color: var(--kv-text-muted);"
                :aria-label="t('common.close')"
                @click="emit('close')"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- İçerik gövde -->
        <div class="flex-1 overflow-y-auto">
          <div style="max-width: 1000px; width: 100%;">
            <div class="px-8 py-6">

              <!-- ── Hesap ── (mevcut Security Section'ları yeniden kullanılır — akış/reauth değişmez) -->
              <div v-if="activeSection === 'hesap'" class="flex flex-col gap-4 max-w-xl">
                <!-- Kullanıcı adı / e-posta read-only -->
                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <div class="flex flex-col gap-1">
                    <p class="text-[12px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
                      {{ t('settings.usernameLabel') }}
                    </p>
                    <p class="text-[15px] font-medium" style="color: var(--kv-text-primary);">
                      {{ authStore.user?.username }}
                    </p>
                    <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                      {{ t('settings.usernameReadonlyHint') }}
                    </p>
                  </div>
                </section>

                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <TwoFactorSection />
                </section>
                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <SessionsSection />
                </section>
                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <ChangePasswordSection />
                </section>
                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <ChangeEmailSection />
                </section>
                <section class="rounded-[var(--kv-radius-lg)] p-6" style="background-color: var(--kv-bg-sidebar);">
                  <DeleteAccountSection />
                </section>
              </div>

              <!-- ── Profil ── (bio) -->
              <div v-else-if="activeSection === 'profil'" class="flex flex-col gap-6 max-w-xl">
                <section>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
                      {{ t('settings.bioLabel') }}
                    </h3>
                    <span class="text-[12px]" :style="`color: ${draftBio.length > BIO_MAX ? 'var(--kv-danger)' : 'var(--kv-text-muted)'};`">
                      {{ t('settings.bioCounter', { count: draftBio.length }) }}
                    </span>
                  </div>
                  <textarea
                    v-model="draftBio"
                    :placeholder="t('settings.bioPlaceholder')"
                    :disabled="savingBio"
                    rows="5"
                    :maxlength="BIO_MAX"
                    class="w-full resize-none rounded-[var(--kv-radius-md)] border px-3 py-2 text-[14px] outline-none transition-colors"
                    style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
                  />

                  <div class="flex items-center justify-between gap-3 mt-3">
                    <p v-if="bioError" class="text-[12px] flex-1" style="color: var(--kv-danger);">{{ bioError }}</p>
                    <p v-else-if="bioSaved && !bioDirty" class="text-[12px] flex-1" style="color: var(--kv-success);">
                      {{ t('settings.bioSaved') }}
                    </p>
                    <span v-else class="flex-1" />
                    <KvButton :disabled="!bioDirty || savingBio" :loading="savingBio" @click="saveBio">
                      {{ t('common.save') }}
                    </KvButton>
                  </div>
                </section>
              </div>

              <!-- ── Gizlilik ── (dmPolicy) -->
              <div v-else-if="activeSection === 'gizlilik'" class="flex flex-col gap-6 max-w-xl">
                <section>
                  <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
                    {{ t('settings.dmPolicy.label') }}
                  </h3>
                  <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">
                    {{ t('settings.dmPolicy.description') }}
                  </p>
                  <div class="flex flex-col gap-2">
                    <button
                      v-for="opt in policyOptions"
                      :key="opt"
                      type="button"
                      class="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-[var(--kv-radius-md)] border text-left cursor-pointer transition-colors"
                      :style="opt === currentPolicy
                        ? 'border-color: var(--kv-accent-500); background-color: var(--kv-bg-elevated);'
                        : 'border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);'"
                      :disabled="savingPolicy"
                      @click="selectPolicy(opt)"
                    >
                      <span class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                        {{ policyLabel(opt) }}
                      </span>
                      <span
                        v-if="opt === currentPolicy"
                        class="shrink-0 flex items-center justify-center w-5 h-5 rounded-full"
                        style="background-color: var(--kv-accent-500);"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    </button>
                  </div>

                  <p v-if="policyError" class="text-[12px] mt-3" style="color: var(--kv-danger);">{{ policyError }}</p>
                  <p v-else-if="policySaved" class="text-[12px] mt-3" style="color: var(--kv-success);">
                    {{ t('settings.dmPolicy.saved') }}
                  </p>
                </section>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
