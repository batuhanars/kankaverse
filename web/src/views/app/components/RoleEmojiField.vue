<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EmojiInsertButton from '@/components/shared/EmojiInsertButton.vue'

defineOptions({ name: 'RoleEmojiField' })

/** C21: rol emojisi seçici (tek emoji; yalnız görünüm). Boş = emoji yok. */
defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const { t } = useI18n()
</script>

<template>
  <section>
    <label class="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
      {{ t('guildSettings.roles.emojiLabel') }}
    </label>
    <p class="text-[12px] mb-2" style="color: var(--kv-text-muted);">
      {{ t('guildSettings.roles.emojiHint') }}
    </p>
    <div class="flex items-center gap-2">
      <span
        class="inline-flex items-center justify-center w-10 h-10 rounded-[var(--kv-radius-md)] border text-[20px]"
        style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      >{{ model }}</span>
      <EmojiInsertButton v-if="!disabled" :label="t('guildSettings.roles.emojiPick')" @pick="model = $event" />
      <button
        v-if="model && !disabled"
        type="button"
        class="text-[13px] cursor-pointer hover:underline"
        style="color: var(--kv-text-secondary);"
        @click="model = ''"
      >
        {{ t('guildSettings.roles.emojiRemove') }}
      </button>
    </div>
  </section>
</template>
