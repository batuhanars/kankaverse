import { ref, onMounted } from 'vue'

/**
 * useAudioDevices — tarayıcı ses cihazlarını (giriş/çıkış) listele.
 * VoiceDevicesSection (Ayarlar) + ses bar'ı hızlı popover'ı paylaşır (DRY).
 * Etiketler izin verilene kadar boş gelir → needsPermission + grant().
 */
export function useAudioDevices() {
  const inputs = ref<MediaDeviceInfo[]>([])
  const outputs = ref<MediaDeviceInfo[]>([])
  const needsPermission = ref(false)
  // setSinkId yalnız bazı tarayıcılarda (çıkış cihazı seçimi)
  const supportsOutputSelect =
    typeof (document.createElement('audio') as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === 'function'

  async function refresh() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      inputs.value = devices.filter((d) => d.kind === 'audioinput')
      outputs.value = devices.filter((d) => d.kind === 'audiooutput')
      needsPermission.value = inputs.value.length > 0 && inputs.value.every((d) => !d.label)
    } catch {
      inputs.value = []
      outputs.value = []
    }
  }

  async function grant() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((tr) => tr.stop())
      await refresh()
    } catch {
      /* reddedildi — etiketler boş kalır */
    }
  }

  onMounted(refresh)
  return { inputs, outputs, needsPermission, supportsOutputSelect, refresh, grant }
}
