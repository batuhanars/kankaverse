<script setup lang="ts">
/**
 * CameraNudgeModal — genel/açık GUILD_VOICE kanalında ilk kamera açışta gösterilen
 * tek-seferlik bağlam uyarısı (§E2).
 *
 * Yaş-nötr: minöre özel metin/işaret YOK. Herkes aynı uyarıyı görür.
 * Çıkış mesajı metinde (ayrıl/bildir); aksiyonlar ses barında zaten var, modalda buton fazlalık (sahip 2026-06-30).
 * Akıl: modalı "Kamerayı Aç" ile onaylamak kamera açmaz, parent action'ı tetikler.
 */
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  confirm: [] // Kullanıcı "Kamerayı Aç" dedi → parent kamerayı aç
  close: [] // Vazgeç / backdrop tıkla
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background-color: var(--kv-bg-overlay)"
      @click.self="emit('close')"
    >
      <!-- Modal kutusu -->
      <div
        class="w-full max-w-sm rounded-[var(--kv-radius-lg)] border overflow-hidden"
        style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle)"
      >
        <!-- Üst aksan şeridi -->
        <div class="h-1 w-full" style="background-color: var(--kv-accent-500)" />

        <div class="p-6">
          <!-- İkon + başlık -->
          <div class="flex items-center gap-3 mb-4">
            <div
              class="shrink-0 flex items-center justify-center rounded-full"
              style="width: 40px; height: 40px; background-color: var(--kv-accent-subtle)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: var(--kv-accent-500)"
              >
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <p class="text-[16px] font-semibold" style="color: var(--kv-text-primary)">
              {{ t('voice.nudge.cameraTitle') }}
            </p>
          </div>

          <!-- Açıklama metni -->
          <p class="text-[14px] leading-relaxed mb-6" style="color: var(--kv-text-secondary)">
            {{ t('voice.nudge.cameraBody') }}
          </p>

          <!-- Butonlar -->
          <div class="flex flex-col gap-2">
            <!-- Birincil: kamerayı aç -->
            <button
              type="button"
              class="w-full py-2.5 rounded-[var(--kv-radius-md)] text-[14px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
              style="background-color: var(--kv-accent-500)"
              @click="emit('confirm')"
            >
              {{ t('voice.nudge.cameraConfirm') }}
            </button>
            <!-- İkincil: vazgeç (kamera açılmaz, hatırlanmaz) -->
            <button
              type="button"
              class="w-full py-2 text-[13px] cursor-pointer transition-colors"
              style="color: var(--kv-text-muted)"
              @click="emit('close')"
            >
              {{ t('voice.nudge.cameraCancel') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
