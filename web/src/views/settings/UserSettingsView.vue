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
import { useToastStore } from '@/stores/toast'
import { usersApi } from '@/api/users'
import { attachmentsApi } from '@/api/attachments'
import { DmPolicy } from '@/types'
import { BANNER_PRESET_KEYS, bannerBackground } from '@/utils/bannerColor'
import { animatedOrStatic, ANIMATED_ACCEPT, ANIMATED_TYPES, ANIMATED_GIF_MAX_BYTES, STATIC_IMAGE_TYPES } from '@/utils/animatedMedia'
import type { AnimatedTarget } from '@/api/users'
import { isMobile } from '@/composables/useResponsive'
import KvButton from '@/components/ui/KvButton.vue'
import KvModal from '@/components/ui/KvModal.vue'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import TwoFactorSection from './components/TwoFactorSection.vue'
import SessionsSection from './components/SessionsSection.vue'
import ChangePasswordSection from './components/ChangePasswordSection.vue'
import ChangeEmailSection from './components/ChangeEmailSection.vue'
import ChangeUsernameSection from './components/ChangeUsernameSection.vue'
import DeleteAccountSection from './components/DeleteAccountSection.vue'
import VoiceDevicesSection from './components/VoiceDevicesSection.vue'
import PlatformInviteSection from './components/PlatformInviteSection.vue'
import PlatformFunnelSection from './components/PlatformFunnelSection.vue'
import PlatformUsersSection from './components/PlatformUsersSection.vue'
import MasaustuSection from './components/MasaustuSection.vue'
import AnimatedClipModal from './components/AnimatedClipModal.vue'

const props = defineProps<{ initialSection?: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const toast = useToastStore()

type NavSection = 'hesap' | 'profil' | 'ses' | 'gizlilik' | 'masaustu' | 'admin'
const VALID_SECTIONS: NavSection[] = ['profil', 'hesap', 'ses', 'gizlilik', 'masaustu', 'admin']
// Masaüstü (Electron) istemcisinde ek sekme — tarayıcıda gizli.
const isElectron = window.kankaverse?.isElectron === true
const activeSection = ref<NavSection>(
  VALID_SECTIONS.includes(props.initialSection as NavSection) ? (props.initialSection as NavSection) : 'profil',
)

// Profil en üstte — profil görünümü düzenlemeleri buradan başlar (sahip tercihi).
const baseNavItems: { key: NavSection; labelKey: string }[] = [
  { key: 'profil', labelKey: 'settings.tabProfile' },
  { key: 'hesap', labelKey: 'settings.tabAccount' },
  { key: 'ses', labelKey: 'settings.tabVoice' },
  { key: 'gizlilik', labelKey: 'settings.tabPrivacy' },
]

// Admin sekmesi: yalnız isModerator kullanıcıya göster
const navItems = computed(() => {
  const items = [...baseNavItems]
  if (isElectron) items.push({ key: 'masaustu', labelKey: 'settings.tabDesktop' })
  if (authStore.user?.isModerator) items.push({ key: 'admin', labelKey: 'settings.tabAdmin' })
  return items
})

// ── Admin alt-geçişi: kullanıcılar (varsayılan) / davetler ──
type AdminSub = 'kullanicilar' | 'davetler' | 'huni'
const adminSub = ref<AdminSub>('kullanicilar')
const adminSubLabel = computed<Record<AdminSub, string>>(() => ({
  kullanicilar: t('admin.users.title'),
  davetler: t('admin.platformInvite.listTitle'),
  huni: t('admin.funnel.title'),
}))

// ── Hesap düzenleme modalları (Discord-tarzı: satır + "Düzenle" → modal) ──
type EditModal = null | 'username' | 'password' | 'email' | '2fa' | 'sessions' | 'delete'
const editModal = ref<EditModal>(null)
const revealEmail = ref(false)

const maskedEmail = computed(() => {
  const e = authStore.user?.email ?? ''
  if (revealEmail.value) return e
  const [local, domain] = e.split('@')
  if (!domain) return e ? '••••••' : ''
  return '•'.repeat(Math.min(local.length, 12)) + '@' + domain
})

// ── ESC ile kapat — alt modal açıksa önce onu kapat ──────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (editModal.value) editModal.value = null
  else emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value)
  if (bannerImagePreviewUrl.value) URL.revokeObjectURL(bannerImagePreviewUrl.value)
})

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
    toast.success(t('toast.profileSaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    bioError.value = err.response?.data?.message ?? t('settings.saveError')
    toast.error(err.response?.data?.message ?? t('toast.saveError'))
  } finally {
    savingBio.value = false
  }
}

// ── Sprint C8 §5 — Avatar + Profil Afişi (görsel) ──────────────────────────
// Immediate-action deseni (bio/afiş rengi gibi bu view'da her alan kendi başına kaydeder;
// GuildSettingsView'ın toplu saveAll'ı burada YOK — dosya seçilince direkt presign+upload+set).
const MEDIA_MAX_BYTES = 2 * 1024 * 1024 // ikon deseniyle hizalı (2 MB)
const MEDIA_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] // GIF YOK — sözleşme §0

// Presign 403 UPLOADS_DISABLED → paylaşılan gating sinyali (avatar+afiş aynı bayrağa tabi;
// CreateEventWizard'ın coverUploadsDisabled reaktif-gizleme deseniyle aynı sinyal).
const mediaUploadsDisabled = ref(false)

// Sprint C13 §5.2 — hareketli avatar/afiş (GIF + video kesit). ANIMATED_DISABLED 403 → statik moda düş
// (UPLOADS_DISABLED deseni). Bayrak için ayrı uç yok; ilk denemede öğrenilir.
const animatedDisabled = ref(false)
const animatedFile = ref<File | null>(null)
const animatedTarget = ref<AnimatedTarget>('AVATAR')
const mediaAccept = computed(() =>
  animatedDisabled.value ? 'image/png,image/jpeg,image/webp' : `image/png,image/jpeg,image/webp,${ANIMATED_ACCEPT}`,
)

// true dönerse dosya hareketli akışa devredildi (modal açıldı) ya da reddedildi; statik akış devam etmez
function routeAnimated(file: File, target: AnimatedTarget, setError: (msg: string) => void): boolean {
  if (!ANIMATED_TYPES.includes(file.type)) return false
  // C13b: bayrak yalnız GIF/video girişini kapatır; statik görsel her zaman konumlandırma modalından gider
  if (animatedDisabled.value && !STATIC_IMAGE_TYPES.includes(file.type)) {
    setError(t('profile.animated.disabled'))
    return true
  }
  if (file.type.startsWith('image/') && file.size > ANIMATED_GIF_MAX_BYTES) {
    setError(t('profile.animated.errorImageSize'))
    return true
  }
  animatedTarget.value = target
  animatedFile.value = file
  return true
}

function onAnimatedDone(user: Parameters<typeof authStore.updateUser>[0]) {
  authStore.updateUser(user)
  animatedFile.value = null
  toast.success(t('toast.profileSaved'))
}

function onAnimatedDisabled() {
  animatedDisabled.value = true
  const msg = t('profile.animated.disabled')
  if (animatedTarget.value === 'AVATAR') avatarError.value = msg
  else bannerImageError.value = msg
  animatedFile.value = null
}

const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarPreviewUrl = ref<string | null>(null)
const avatarUploading = ref(false)
const avatarUploadPct = ref(0)
const avatarError = ref('')

const avatarDisplayUrl = computed(() => avatarPreviewUrl.value ?? animatedOrStatic(authStore.user, 'avatar'))

function triggerAvatarPicker() {
  if (avatarUploading.value) return
  avatarFileInput.value?.click()
}

async function onAvatarFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  avatarError.value = ''
  if (routeAnimated(file, 'AVATAR', (m) => (avatarError.value = m))) return
  if (!MEDIA_ACCEPTED_TYPES.includes(file.type)) {
    avatarError.value = t('settings.avatar.errorType')
    return
  }
  if (file.size > MEDIA_MAX_BYTES) {
    avatarError.value = t('settings.avatar.errorSize')
    return
  }

  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value)
  avatarPreviewUrl.value = URL.createObjectURL(file)
  avatarUploading.value = true
  avatarUploadPct.value = 0

  try {
    const { data: presigned } = await usersApi.avatarPresign(file.type)
    await attachmentsApi.uploadToS3(presigned.uploadUrl, file, (pct) => {
      avatarUploadPct.value = pct
    })
    const { data } = await usersApi.setAvatar(presigned.storageKey)
    authStore.updateUser(data)
    toast.success(t('toast.profileSaved'))
  } catch (err: unknown) {
    const e2 = err as { response?: { data?: { error?: string; message?: string } } }
    const code = e2.response?.data?.error
    if (code === 'UPLOADS_DISABLED') {
      mediaUploadsDisabled.value = true
    } else {
      avatarError.value = e2.response?.data?.message ?? t('settings.avatar.errorUpload')
    }
  } finally {
    avatarUploading.value = false
    avatarUploadPct.value = 0
    if (avatarPreviewUrl.value) {
      URL.revokeObjectURL(avatarPreviewUrl.value)
      avatarPreviewUrl.value = null
    }
  }
}

async function removeAvatar() {
  if (avatarUploading.value) return
  avatarUploading.value = true
  avatarError.value = ''
  try {
    const { data } = await usersApi.setAvatar(null)
    authStore.updateUser(data)
    toast.success(t('toast.profileSaved'))
  } catch (err: unknown) {
    const e2 = err as { response?: { data?: { message?: string } } }
    avatarError.value = e2.response?.data?.message ?? t('settings.avatar.errorUpload')
  } finally {
    avatarUploading.value = false
  }
}

const bannerImageFileInput = ref<HTMLInputElement | null>(null)
const bannerImagePreviewUrl = ref<string | null>(null)
const bannerImageUploading = ref(false)
const bannerImageUploadPct = ref(0)
const bannerImageError = ref('')

const bannerImageDisplayUrl = computed(() => bannerImagePreviewUrl.value ?? animatedOrStatic(authStore.user, 'banner'))

function triggerBannerImagePicker() {
  if (bannerImageUploading.value) return
  bannerImageFileInput.value?.click()
}

async function onBannerImageFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  bannerImageError.value = ''
  if (routeAnimated(file, 'BANNER', (m) => (bannerImageError.value = m))) return
  if (!MEDIA_ACCEPTED_TYPES.includes(file.type)) {
    bannerImageError.value = t('settings.bannerImage.errorType')
    return
  }
  if (file.size > MEDIA_MAX_BYTES) {
    bannerImageError.value = t('settings.bannerImage.errorSize')
    return
  }

  if (bannerImagePreviewUrl.value) URL.revokeObjectURL(bannerImagePreviewUrl.value)
  bannerImagePreviewUrl.value = URL.createObjectURL(file)
  bannerImageUploading.value = true
  bannerImageUploadPct.value = 0

  try {
    const { data: presigned } = await usersApi.bannerPresign(file.type)
    await attachmentsApi.uploadToS3(presigned.uploadUrl, file, (pct) => {
      bannerImageUploadPct.value = pct
    })
    const { data } = await usersApi.setBanner(presigned.storageKey)
    authStore.updateUser(data)
    toast.success(t('toast.profileSaved'))
  } catch (err: unknown) {
    const e2 = err as { response?: { data?: { error?: string; message?: string } } }
    const code = e2.response?.data?.error
    if (code === 'UPLOADS_DISABLED') {
      mediaUploadsDisabled.value = true
    } else {
      bannerImageError.value = e2.response?.data?.message ?? t('settings.bannerImage.errorUpload')
    }
  } finally {
    bannerImageUploading.value = false
    bannerImageUploadPct.value = 0
    if (bannerImagePreviewUrl.value) {
      URL.revokeObjectURL(bannerImagePreviewUrl.value)
      bannerImagePreviewUrl.value = null
    }
  }
}

async function removeBannerImage() {
  if (bannerImageUploading.value) return
  bannerImageUploading.value = true
  bannerImageError.value = ''
  try {
    const { data } = await usersApi.setBanner(null)
    authStore.updateUser(data)
    toast.success(t('toast.profileSaved'))
  } catch (err: unknown) {
    const e2 = err as { response?: { data?: { message?: string } } }
    bannerImageError.value = e2.response?.data?.message ?? t('settings.bannerImage.errorUpload')
  } finally {
    bannerImageUploading.value = false
  }
}

// ── Profil: afiş rengi (preset; null = marka varsayılanı). Tıklayınca anında kaydeder. ──
const bannerPresetKeys = BANNER_PRESET_KEYS
const draftBannerColor = computed(() => authStore.user?.bannerColor ?? null)
const profileMemberSince = computed(() =>
  authStore.user
    ? new Date(authStore.user.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '',
)
async function setBannerColor(key: string | null) {
  if (draftBannerColor.value === key) return
  try {
    const { data } = await usersApi.updateProfile({ bannerColor: key })
    authStore.updateUser(data)
    toast.success(t('toast.profileSaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('toast.saveError'))
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

function policyDesc(p: DmPolicy): string {
  if (p === DmPolicy.EVERYONE) return t('settings.dmPolicy.everyoneDesc')
  if (p === DmPolicy.FRIENDS) return t('settings.dmPolicy.friendsDesc')
  return t('settings.dmPolicy.noneDesc')
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
    toast.success(t('toast.privacySaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    policyError.value = err.response?.data?.message ?? t('settings.saveError')
    toast.error(err.response?.data?.message ?? t('toast.saveError'))
  } finally {
    savingPolicy.value = false
  }
}

// ── C12 §2: Okundu bilgisi anahtarı ─────────────────────────────────────────
// KARŞILIKLI: kapatan kendi okumasını paylaşmaz VE karşı tarafınkini de göremez. Karar sunucuda
// (`visibleReadAt`, R7); burada yalnız tercih yazılıyor. Kullanıcıya karşılıklılık AÇIKÇA
// söyleniyor (aşağıdaki açıklama metni) — sessizce uygulanan bir kural, kural değil sürprizdir.
const savingReceipts = ref(false)
const readReceipts = computed(() => authStore.user?.readReceipts ?? true)

async function toggleReadReceipts(next: boolean) {
  if (savingReceipts.value || next === readReceipts.value) return
  savingReceipts.value = true
  try {
    const { data } = await usersApi.updateProfile({ readReceipts: next })
    authStore.updateUser(data)
    toast.success(t('toast.privacySaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('toast.saveError'))
  } finally {
    savingReceipts.value = false
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
      <!-- ── MASAÜSTÜ (≥768): Sol sidebar nav ── -->
      <div
        v-if="!isMobile"
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
                ? 'bg-[var(--kv-bg-elevated)] text-[var(--kv-accent-400)] shadow-[inset_2px_0_0_var(--kv-accent-500)]'
                : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]'"
              @click="activeSection = item.key"
            >
              {{ t(item.labelKey) }}
            </button>
          </nav>
        </div>
      </div>

      <!-- ── İçerik alanı (hem mobil hem masaüstü) ── -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0" style="background-color: var(--kv-bg-content);">

        <!-- ── MOBİL (<768): Üst sekme şeridi ── -->
        <div
          v-if="isMobile"
          class="shrink-0 flex items-center border-b overflow-x-auto"
          style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle); scrollbar-width: none;"
        >
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="shrink-0 px-4 py-3 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap border-b-2"
            :style="activeSection === item.key
              ? 'color: var(--kv-accent-400); border-color: var(--kv-accent-500);'
              : 'color: var(--kv-text-secondary); border-color: transparent;'"
            @click="activeSection = item.key"
          >
            {{ t(item.labelKey) }}
          </button>

          <!-- Kapat — sekme şeridinin sağında -->
          <button
            type="button"
            class="shrink-0 ml-auto flex items-center justify-center cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
            style="width: 44px; height: 44px; color: var(--kv-text-muted);"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- ── MASAÜSTÜ: İçerik header (başlık + kapat) ── -->
        <div
          v-if="!isMobile"
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
            <div class="px-4 py-4 md:px-8 md:py-6">

              <!-- ── Hesap ── (Discord-tarzı satırlar; "Düzenle" → modal) -->
              <div v-if="activeSection === 'hesap'" class="flex flex-col gap-8 max-w-2xl">
                <!-- Hesap Bilgileri -->
                <section>
                  <h3 class="text-[18px] font-bold mb-2" style="color: var(--kv-text-primary);">
                    {{ t('settings.account.infoTitle') }}
                  </h3>
                  <div class="rounded-[var(--kv-radius-lg)] divide-y divide-[color:var(--kv-border-subtle)]" style="background-color: var(--kv-bg-sidebar);">
                    <!-- Kullanıcı Adı -->
                    <div class="flex items-center justify-between gap-4 px-5 py-4">
                      <p class="text-[14px] font-medium shrink-0" style="color: var(--kv-text-secondary);">
                        {{ t('settings.account.username') }}
                      </p>
                      <div class="flex items-center gap-3 min-w-0">
                        <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ authStore.user?.username }}</span>
                        <button class="kv-row-btn" @click="editModal = 'username'">{{ t('settings.account.edit') }}</button>
                      </div>
                    </div>
                    <!-- E-posta -->
                    <div class="flex items-center justify-between gap-4 px-5 py-4" style="border-color: var(--kv-border-subtle);">
                      <p class="text-[14px] font-medium shrink-0" style="color: var(--kv-text-secondary);">
                        {{ t('settings.account.email') }}
                      </p>
                      <div class="flex items-center gap-3 min-w-0">
                        <span class="text-[14px] truncate" style="color: var(--kv-text-primary); font-variant-numeric: tabular-nums;">{{ maskedEmail }}</span>
                        <button
                          class="text-[13px] cursor-pointer shrink-0 hover:underline"
                          style="color: var(--kv-accent-500);"
                          @click="revealEmail = !revealEmail"
                        >{{ revealEmail ? t('settings.account.hide') : t('settings.account.show') }}</button>
                        <button class="kv-row-btn" @click="editModal = 'email'">{{ t('settings.account.edit') }}</button>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- Şifre ve Güvenlik -->
                <section>
                  <h3 class="text-[18px] font-bold mb-2" style="color: var(--kv-text-primary);">
                    {{ t('settings.account.securityTitle') }}
                  </h3>
                  <div class="rounded-[var(--kv-radius-lg)] divide-y divide-[color:var(--kv-border-subtle)]" style="background-color: var(--kv-bg-sidebar);">
                    <!-- Şifre -->
                    <div class="flex items-center justify-between gap-4 px-5 py-4" style="border-color: var(--kv-border-subtle);">
                      <p class="text-[14px] font-medium" style="color: var(--kv-text-secondary);">
                        {{ t('settings.account.password') }}
                      </p>
                      <button class="kv-row-btn" @click="editModal = 'password'">{{ t('settings.account.edit') }}</button>
                    </div>
                    <!-- 2FA -->
                    <button
                      class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
                      style="border-color: var(--kv-border-subtle);"
                      @click="editModal = '2fa'"
                    >
                      <p class="text-[14px] font-medium" style="color: var(--kv-text-secondary);">
                        {{ t('settings.account.twoFactor') }}
                      </p>
                      <span class="flex items-center gap-2 shrink-0">
                        <span class="text-[13px]" :style="`color: ${authStore.user?.twoFactorEnabled ? 'var(--kv-online, #3DB46E)' : 'var(--kv-text-muted)'};`">
                          {{ authStore.user?.twoFactorEnabled ? t('settings.account.twoFactorOn') : t('settings.account.twoFactorSetup') }}
                        </span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><polyline points="9 18 15 12 9 6"/></svg>
                      </span>
                    </button>
                    <!-- Oturumlar -->
                    <button
                      class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
                      style="border-color: var(--kv-border-subtle);"
                      @click="editModal = 'sessions'"
                    >
                      <p class="text-[14px] font-medium" style="color: var(--kv-text-secondary);">
                        {{ t('settings.account.sessions') }}
                      </p>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </section>

                <!-- Hesabı Sil -->
                <section>
                  <button
                    class="w-full flex items-center justify-between gap-4 px-5 py-4 rounded-[var(--kv-radius-lg)] text-left cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
                    style="background-color: var(--kv-bg-sidebar);"
                    @click="editModal = 'delete'"
                  >
                    <p class="text-[14px] font-medium" style="color: var(--kv-danger);">
                      {{ t('settings.account.delete') }}
                    </p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </section>
              </div>

              <!-- ── Profil ── (avatar + bio + afiş · sağda canlı önizleme kartı) -->
              <div v-else-if="activeSection === 'profil'" class="flex gap-8">
                <!-- SOL: avatar + bio + afiş görsel/renk swatch'ları -->
                <div class="flex-1 min-w-0 max-w-xl flex flex-col gap-6">

                  <!-- Sprint C8 — Avatar -->
                  <section v-if="!mediaUploadsDisabled">
                    <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                      {{ t('settings.avatar.label') }}
                    </h3>
                    <div class="flex items-center gap-4">
                      <div
                        class="w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[22px] font-bold text-white"
                        style="background-color: var(--kv-accent-500);"
                      >
                        <img v-if="avatarDisplayUrl" :src="avatarDisplayUrl" class="w-full h-full object-cover" />
                        <span v-else>{{ (authStore.user?.username ?? '?')[0].toUpperCase() }}</span>
                      </div>
                      <div class="flex flex-col gap-1.5 min-w-0">
                        <div class="flex gap-2">
                          <KvButton size="sm" :disabled="avatarUploading" :loading="avatarUploading" @click="triggerAvatarPicker">
                            {{ t('settings.avatar.upload') }}
                          </KvButton>
                          <KvButton
                            v-if="authStore.user?.avatarUrl"
                            size="sm"
                            variant="danger"
                            :disabled="avatarUploading"
                            @click="removeAvatar"
                          >
                            {{ t('settings.avatar.remove') }}
                          </KvButton>
                        </div>
                        <p v-if="avatarUploading && avatarUploadPct > 0" class="text-[12px]" style="color: var(--kv-text-muted);">
                          {{ t('settings.avatar.uploading', { pct: avatarUploadPct }) }}
                        </p>
                        <p v-if="avatarError" class="text-[12px]" style="color: var(--kv-danger);">{{ avatarError }}</p>
                      </div>
                    </div>
                    <input
                      ref="avatarFileInput"
                      type="file"
                      :accept="mediaAccept"
                      class="hidden"
                      @change="onAvatarFileChange"
                    />
                  </section>

                  <AnimatedClipModal
                    v-if="animatedFile"
                    :file="animatedFile"
                    :target="animatedTarget"
                    @close="animatedFile = null"
                    @done="onAnimatedDone"
                    @disabled="onAnimatedDisabled"
                  />

                  <!-- Görsel yükleme kapalıysa tek bir bilgi notu (avatar + afiş ortak bayrak) -->
                  <p v-if="mediaUploadsDisabled" class="text-[12px]" style="color: var(--kv-text-muted);">
                    {{ t('settings.mediaUploadsDisabled') }}
                  </p>

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

                  <!-- Sprint C8 — Profil Afişi (görsel) -->
                  <section v-if="!mediaUploadsDisabled">
                    <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
                      {{ t('settings.bannerImage.label') }}
                    </h3>
                    <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">
                      {{ t('settings.bannerImage.hint') }}
                    </p>
                    <div
                      class="rounded-[var(--kv-radius-md)] overflow-hidden mb-3"
                      style="height: 80px;"
                      :style="{ background: bannerBackground(draftBannerColor) }"
                    >
                      <img v-if="bannerImageDisplayUrl" :src="bannerImageDisplayUrl" class="w-full h-full object-cover" />
                    </div>
                    <div class="flex gap-2">
                      <KvButton size="sm" :disabled="bannerImageUploading" :loading="bannerImageUploading" @click="triggerBannerImagePicker">
                        {{ t('settings.bannerImage.upload') }}
                      </KvButton>
                      <KvButton
                        v-if="authStore.user?.bannerUrl"
                        size="sm"
                        variant="danger"
                        :disabled="bannerImageUploading"
                        @click="removeBannerImage"
                      >
                        {{ t('settings.bannerImage.remove') }}
                      </KvButton>
                    </div>
                    <p v-if="bannerImageUploading && bannerImageUploadPct > 0" class="text-[12px] mt-1.5" style="color: var(--kv-text-muted);">
                      {{ t('settings.bannerImage.uploading', { pct: bannerImageUploadPct }) }}
                    </p>
                    <p v-if="bannerImageError" class="text-[12px] mt-1.5" style="color: var(--kv-danger);">{{ bannerImageError }}</p>
                    <input
                      ref="bannerImageFileInput"
                      type="file"
                      :accept="mediaAccept"
                      class="hidden"
                      @change="onBannerImageFileChange"
                    />
                  </section>

                  <!-- Afiş rengi swatch'ları (görsel afiş yoksa fallback olarak kullanılır) -->
                  <section>
                    <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
                      {{ t('settings.banner.label') }}
                    </h3>
                    <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">{{ t('settings.banner.hint') }}</p>
                    <div class="flex flex-wrap gap-2.5">
                      <button
                        class="rounded-[var(--kv-radius-md)] border-2 cursor-pointer transition-transform flex items-center justify-center"
                        style="width: 48px; height: 48px;"
                        :style="`background: ${bannerBackground(null)}; border-color: ${draftBannerColor === null ? 'var(--kv-accent-500)' : 'transparent'}; transform: ${draftBannerColor === null ? 'scale(1.06)' : 'none'};`"
                        :title="t('settings.banner.default')"
                        @click="setBannerColor(null)"
                      >
                        <svg v-if="draftBannerColor === null" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      </button>
                      <button
                        v-for="key in bannerPresetKeys"
                        :key="key"
                        class="rounded-[var(--kv-radius-md)] border-2 cursor-pointer transition-transform flex items-center justify-center"
                        style="width: 48px; height: 48px;"
                        :style="`background: ${bannerBackground(key)}; border-color: ${draftBannerColor === key ? 'var(--kv-accent-500)' : 'transparent'}; transform: ${draftBannerColor === key ? 'scale(1.06)' : 'none'};`"
                        @click="setBannerColor(key)"
                      >
                        <svg v-if="draftBannerColor === key" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      </button>
                    </div>
                  </section>
                </div>

                <!-- SAĞ: profil önizleme kartı (canlı draft; ortam ayarlarındaki gibi) -->
                <div class="block max-lg:hidden shrink-0 self-start" style="width: 320px;">
                  <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                    {{ t('settings.banner.previewTitle') }}
                  </h3>
                  <div class="overflow-hidden rounded-[var(--kv-radius-lg)] border" style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-sidebar);">
                    <!-- Afiş (görsel varsa üstte; yoksa renk/gradient) + banner'a binen avatar -->
                    <!-- overflow-hidden YOK: avatar bottom:-28px ile alta taşar; dış kart (rounded+overflow-hidden)
                         zaten afişin üst köşelerini kırpar, iç div'e gerek yok (GuildSettingsView deseni). -->
                    <div class="relative" style="height: 100px;" :style="{ background: bannerBackground(draftBannerColor) }">
                      <img
                        v-if="bannerImageDisplayUrl"
                        :src="bannerImageDisplayUrl"
                        alt=""
                        class="absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        class="absolute w-[72px] h-[72px] rounded-full border-4 overflow-hidden flex items-center justify-center text-[24px] font-bold text-white"
                        style="left: 16px; bottom: -28px; border-color: var(--kv-bg-sidebar); background-color: var(--kv-accent-500);"
                      >
                        <img v-if="avatarDisplayUrl" :src="avatarDisplayUrl" class="w-full h-full object-cover" />
                        <span v-else>{{ (authStore.user?.username ?? '?')[0].toUpperCase() }}</span>
                      </div>
                    </div>
                    <!-- Ad + üyelik tarihi -->
                    <div class="pt-9 pb-4 px-4">
                      <p class="text-[16px] font-semibold truncate" style="color: var(--kv-text-primary);">
                        {{ authStore.user?.username }}
                      </p>
                      <p class="text-[12px] mt-1" style="color: var(--kv-text-muted);">
                        {{ t('settings.banner.previewMemberSince', { date: profileMemberSince }) }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ── Ses ── (cihaz seçimi + çıkış sesi) -->
              <div v-else-if="activeSection === 'ses'">
                <VoiceDevicesSection />
              </div>

              <!-- ── Masaüstü ── (yalnız Electron istemcisi) -->
              <div v-else-if="activeSection === 'masaustu' && isElectron">
                <MasaustuSection />
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
                      <span class="flex-1 min-w-0">
                        <span class="block text-[14px] font-medium" style="color: var(--kv-text-primary);">
                          {{ policyLabel(opt) }}
                        </span>
                        <span class="block text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                          {{ policyDesc(opt) }}
                        </span>
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

                <!-- ── C12 §2: Okundu bilgisi ── -->
                <section
                  class="rounded-[var(--kv-radius-lg)] border p-5"
                  style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
                >
                  <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                      <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
                        {{ t('settings.readReceipts.label') }}
                      </h3>
                      <!-- Karşılıklılık kuralı AÇIKÇA yazılı: sessizce uygulanan kural sürprizdir. -->
                      <p class="text-[13px] mt-1" style="color: var(--kv-text-secondary);">
                        {{ t('settings.readReceipts.description') }}
                      </p>
                    </div>
                    <KvSwitch
                      :model-value="readReceipts"
                      :disabled="savingReceipts"
                      @update:model-value="toggleReadReceipts"
                    />
                  </div>
                </section>
              </div>

              <!-- ── Admin — Kullanıcılar + Platform Davetleri ── (yalnız isModerator) -->
              <div v-else-if="activeSection === 'admin' && authStore.user?.isModerator" class="flex flex-col gap-6">
                <!-- Alt-geçiş: kullanıcılar / davetler -->
                <div class="flex items-center gap-1 self-start rounded-[var(--kv-radius-md)] p-1" style="background-color: var(--kv-bg-sidebar);">
                  <button
                    v-for="sub in (['kullanicilar', 'davetler', 'huni'] as const)"
                    :key="sub"
                    type="button"
                    class="px-3 py-1.5 rounded-[var(--kv-radius-sm)] text-[13px] font-medium cursor-pointer transition-colors"
                    :style="adminSub === sub
                      ? 'color: var(--kv-accent-400); background-color: var(--kv-bg-elevated);'
                      : 'color: var(--kv-text-secondary); background-color: transparent;'"
                    @click="adminSub = sub"
                  >
                    {{ adminSubLabel[sub] }}
                  </button>
                </div>

                <PlatformUsersSection v-if="adminSub === 'kullanicilar'" />
                <PlatformFunnelSection v-else-if="adminSub === 'huni'" />
                <PlatformInviteSection v-else />
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Hesap düzenleme modalları (Düzenle → modal) ── -->
    <KvModal v-if="editModal === 'username'" :title="t('security.username.title')" @close="editModal = null">
      <ChangeUsernameSection :in-modal="true" @saved="editModal = null" />
    </KvModal>
    <KvModal v-if="editModal === 'password'" :title="t('security.password.title')" @close="editModal = null">
      <ChangePasswordSection :in-modal="true" @saved="editModal = null" />
    </KvModal>
    <KvModal v-if="editModal === 'email'" :title="t('security.email.title')" @close="editModal = null">
      <ChangeEmailSection :in-modal="true" />
    </KvModal>
    <!-- 2FA / Oturumlar / Sil → kendi başlıklarını gösterir (KvModal title'sız) -->
    <KvModal v-if="editModal === '2fa'" @close="editModal = null">
      <TwoFactorSection />
    </KvModal>
    <KvModal v-if="editModal === 'sessions'" @close="editModal = null">
      <SessionsSection />
    </KvModal>
    <KvModal v-if="editModal === 'delete'" @close="editModal = null">
      <DeleteAccountSection />
    </KvModal>
  </Teleport>
</template>

<style scoped>
/* Discord-tarzı satır "Düzenle" butonu */
.kv-row-btn {
  flex-shrink: 0;
  padding: 6px 16px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--kv-text-primary);
  background-color: var(--kv-bg-elevated);
  transition: background-color 0.12s;
}
.kv-row-btn:hover {
  background-color: var(--kv-bg-content);
}
</style>
