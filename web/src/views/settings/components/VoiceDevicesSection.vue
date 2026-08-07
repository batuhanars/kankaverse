<script setup lang="ts">
/**
 * VoiceDevicesSection — Ses ayarları: giriş (mikrofon) + çıkış (hoparlör) cihaz seçimi
 * ve çıkış sesi. Tarayıcı WebRTC: enumerateDevices + setSinkId (çıkış). Tercihler voice
 * store'da kalıcı; canlı odada anında uygulanır. (Masaüstü uygulamada da aynı API.)
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore } from '@/stores/voice'

const { t } = useI18n()
const voice = useVoiceStore()

const inputs = ref<MediaDeviceInfo[]>([])
const outputs = ref<MediaDeviceInfo[]>([])
const needsPermission = ref(false)
// setSinkId yalnız bazı tarayıcılarda (çıkış cihazı seçimi); yoksa sistem varsayılanı.
const supportsOutputSelect = ref(
  typeof (document.createElement('audio') as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === 'function',
)

async function refresh() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    inputs.value = devices.filter((d) => d.kind === 'audioinput')
    outputs.value = devices.filter((d) => d.kind === 'audiooutput')
    // Etiket boşsa izin verilmemiş demektir (cihaz adları gizli)
    needsPermission.value = inputs.value.length > 0 && inputs.value.every((d) => !d.label)
  } catch {
    inputs.value = []
    outputs.value = []
  }
}

async function grantPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((tr) => tr.stop())
    await refresh()
  } catch {
    /* reddedildi — etiketler boş kalır */
  }
}

function onInput(e: Event) {
  voice.setInputDevice((e.target as HTMLSelectElement).value)
}
function onOutput(e: Event) {
  voice.setOutputDevice((e.target as HTMLSelectElement).value)
}
function onVolume(e: Event) {
  voice.setOutputVolume(Number((e.target as HTMLInputElement).value) / 100)
}

function deviceLabel(d: MediaDeviceInfo, i: number): string {
  return d.label || t('settings.voice.deviceFallback', { n: i + 1 })
}

onMounted(refresh)
</script>

<template>
  <div class="flex flex-col gap-6 max-w-xl">
    <!-- İzin uyarısı -->
    <div
      v-if="needsPermission"
      class="flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--kv-radius-md)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('settings.voice.permissionHint') }}</p>
      <button class="kv-row-btn shrink-0" @click="grantPermission">{{ t('settings.voice.grant') }}</button>
    </div>

    <!-- Giriş Cihazı (Mikrofon) -->
    <section>
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
        {{ t('settings.voice.inputDevice') }}
      </h3>
      <select
        :value="voice.inputDeviceId"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border cursor-pointer"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        @change="onInput"
      >
        <option value="default">{{ t('settings.voice.systemDefault') }}</option>
        <option v-for="(d, i) in inputs" :key="d.deviceId" :value="d.deviceId">{{ deviceLabel(d, i) }}</option>
      </select>
    </section>

    <!-- Çıkış Cihazı (Hoparlör) -->
    <section>
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-2" style="color: var(--kv-text-muted);">
        {{ t('settings.voice.outputDevice') }}
      </h3>
      <select
        v-if="supportsOutputSelect"
        :value="voice.outputDeviceId"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border cursor-pointer"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
        @change="onOutput"
      >
        <option value="default">{{ t('settings.voice.systemDefault') }}</option>
        <option v-for="(d, i) in outputs" :key="d.deviceId" :value="d.deviceId">{{ deviceLabel(d, i) }}</option>
      </select>
      <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('settings.voice.outputUnsupported') }}</p>
    </section>

    <!-- Çıkış Sesi -->
    <section>
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('settings.voice.outputVolume') }}
        </h3>
        <span class="text-[13px] font-semibold" style="color: var(--kv-text-primary); font-variant-numeric: tabular-nums;">
          {{ Math.round(voice.outputVolume * 100) }}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="Math.round(voice.outputVolume * 100)"
        class="kv-vol-range w-full"
        :style="`background: linear-gradient(to right, var(--kv-accent-500) ${Math.round(voice.outputVolume * 100)}%, var(--kv-bg-elevated) ${Math.round(voice.outputVolume * 100)}%);`"
        @input="onVolume"
      />
    </section>
  </div>
</template>

<style scoped>
.kv-row-btn {
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
.kv-vol-range {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.kv-vol-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}
.kv-vol-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
}
</style>
