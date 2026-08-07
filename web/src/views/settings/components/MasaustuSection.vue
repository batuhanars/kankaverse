<script setup lang="ts">
/**
 * MasaustuSection — yalnız Electron masaüstü istemcisinde görünen ayarlar.
 * Ayarlar ana process'te (userData/settings.json) tutulur; köprü üzerinden okunur/yazılır.
 * Tarayıcıda bu sekme hiç gösterilmez (UserSettingsView isElectron ile guard'lar).
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import KvSwitch from '@/components/ui/KvSwitch.vue'

const { t } = useI18n()

type DesktopSettings = { openAtLogin: boolean; startMinimized: boolean; closeToTray: boolean }
const settings = ref<DesktopSettings>({ openAtLogin: false, startMinimized: false, closeToTray: true })
const loading = ref(true)

onMounted(async () => {
  try {
    const s = await window.kankaverse?.getDesktopSettings()
    if (s) settings.value = s
  } finally {
    loading.value = false
  }
})

async function update(key: keyof DesktopSettings, value: boolean) {
  settings.value = { ...settings.value, [key]: value } // optimistik
  const s = await window.kankaverse?.setDesktopSetting(key, value)
  if (s) settings.value = s
}

const rows: { key: keyof DesktopSettings; titleKey: string; descKey: string }[] = [
  { key: 'openAtLogin', titleKey: 'settings.desktop.openAtLoginLabel', descKey: 'settings.desktop.openAtLoginDesc' },
  { key: 'startMinimized', titleKey: 'settings.desktop.startMinimizedLabel', descKey: 'settings.desktop.startMinimizedDesc' },
  { key: 'closeToTray', titleKey: 'settings.desktop.closeToTrayLabel', descKey: 'settings.desktop.closeToTrayDesc' },
]
</script>

<template>
  <div class="max-w-xl">
    <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
      {{ t('settings.desktop.title') }}
    </h3>
    <p class="text-[12px] mb-4" style="color: var(--kv-text-muted);">
      {{ t('settings.desktop.intro') }}
    </p>

    <div class="flex flex-col">
      <div
        v-for="row in rows"
        :key="row.key"
        class="flex items-center justify-between gap-4 py-3 border-b"
        style="border-color: var(--kv-border-subtle);"
      >
        <div class="min-w-0">
          <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">{{ t(row.titleKey) }}</p>
          <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">{{ t(row.descKey) }}</p>
        </div>
        <KvSwitch
          :model-value="settings[row.key]"
          :disabled="loading"
          @update:model-value="(v) => update(row.key, v)"
        />
      </div>
    </div>
  </div>
</template>
