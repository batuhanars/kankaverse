<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'

defineEmits<{ close: [] }>()

const { t } = useI18n()

const WINDOWS_URL = 'https://kankaverse.com/indir/kankaverse-setup.exe'
const LINUX_URL = 'https://kankaverse.com/indir/kankaverse.AppImage'

/**
 * Basit OS tespiti — pill/badge gibi hafif bir vurgu için yeterli.
 * Yanlış pozitif verebilir (örn. Linux'ta Chromium userAgent'ı Mac gibi raporlayabilir)
 * ama bu yalnız görsel bir ipucu; tıklanabilirlik her koşulda korunur.
 */
const detectedOs = computed<'windows' | 'linux' | 'macos' | null>(() => {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  if (ua.includes('mac')) return 'macos'
  return null
})

const platforms = computed(() => [
  {
    key: 'windows' as const,
    label: t('download.windows'),
    url: WINDOWS_URL,
    available: true,
  },
  {
    key: 'linux' as const,
    label: t('download.linux'),
    url: LINUX_URL,
    available: true,
  },
  {
    key: 'macos' as const,
    label: t('download.macos'),
    url: null,
    available: false,
  },
])
</script>

<template>
  <KvModal :title="t('download.modalTitle')" @close="$emit('close')">
    <div class="flex flex-col gap-5">
      <!-- Alt başlık -->
      <p class="text-[14px] -mt-2" style="color: var(--kv-text-muted);">
        {{ t('download.modalSubtitle') }}
      </p>

      <!-- Platform kartları -->
      <div class="flex flex-col gap-3">
        <div
          v-for="platform in platforms"
          :key="platform.key"
          :class="[
            'flex items-center gap-4 px-4 py-3 rounded-[var(--kv-radius-md)] border transition-colors',
            !platform.available && 'opacity-50',
            detectedOs === platform.key
              ? 'border-[var(--kv-accent-500)]'
              : 'border-[var(--kv-border-subtle)]',
          ]"
          style="background-color: var(--kv-bg-elevated);"
        >
          <!-- Platform logosu (inline SVG) -->
          <span class="shrink-0 flex items-center justify-center w-8 h-8" style="color: var(--kv-text-secondary);">
            <!-- Windows logo -->
            <svg
              v-if="platform.key === 'windows'"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>

            <!-- Linux (Tux) logo -->
            <svg
              v-else-if="platform.key === 'linux'"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.09-2.127 2.389-2.716 4.065-.287.816-.422 1.707-.322 2.612.1.905.476 1.814 1.093 2.503.557.623 1.27 1.063 2.047 1.296C8.53 20.394 9.527 20.5 10.5 20.5s1.97-.106 2.093-.784c.118-.667-.23-1.43-.67-2.207-.54-.952-1.13-1.95-1.13-3.01 0-.643.142-1.173.318-1.693.187-.549.42-1.068.626-1.578.427-1.065.79-2.101.79-3.263 0-1.073-.232-2.21-.927-3.085-.695-.876-1.816-1.44-3.2-1.44-.18 0-.362.01-.546.03C5.7 3.487 4.03 5.13 4.03 7.5c0 .42.048.855.152 1.287.44 1.842 2.178 3.108 3.753 4.1.342.214.67.416.986.606.553.33 1.039.668 1.39 1.01.346.34.57.681.619 1.047.106.797-.234 1.577-.717 2.243-.482.663-1.103 1.233-1.615 1.81-.513.575-.91 1.152-.91 1.803 0 .497.168.994.607 1.389.44.394 1.095.622 1.923.622.62 0 1.322-.126 2.048-.394.726-.268 1.484-.668 2.2-1.228a8.5 8.5 0 001.65-1.812c.47-.727.802-1.553.947-2.414l.046-.27c.09-.528.235-1.05.468-1.519.46-.928 1.278-1.649 2.358-2.26.54-.303 1.143-.563 1.764-.784A6.05 6.05 0 0020.5 12.5c0-2.025-.888-3.74-2.29-4.894C16.807 6.453 15.054 6 13.25 6c-.33 0-.655.02-.972.056C11.453 3.65 12.18 0 12.504 0zM9.5 15c.276 0 .5.224.5.5s-.224.5-.5.5-.5-.224-.5-.5.224-.5.5-.5zm5 0c.276 0 .5.224.5.5s-.224.5-.5.5-.5-.224-.5-.5.224-.5.5-.5z"/>
            </svg>

            <!-- Apple/macOS logo -->
            <svg
              v-else-if="platform.key === 'macos'"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
          </span>

          <!-- Platform adı -->
          <span class="flex-1 text-[15px] font-semibold" style="color: var(--kv-text-primary);">
            {{ platform.label }}
          </span>

          <!-- İndir / Yakında butonu -->
          <a
            v-if="platform.available && platform.url"
            :href="platform.url"
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0"
          >
            <KvButton size="sm">{{ t('download.downloadBtn') }}</KvButton>
          </a>
          <KvButton
            v-else
            size="sm"
            variant="ghost"
            disabled
            class="shrink-0"
          >
            {{ t('download.comingSoon') }}
          </KvButton>
        </div>
      </div>

      <!-- Alt not -->
      <p class="text-[13px]" style="color: var(--kv-text-muted);">
        {{ t('download.footerNote') }}
      </p>
    </div>
  </KvModal>
</template>
