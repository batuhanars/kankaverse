<script setup lang="ts">
/**
 * GuildMediaSection (Sprint C19): ortam simgesi ve afişi. Profil düzenlemedeki akışın aynısı:
 * dosya seç, AnimatedClipModal (statik görsel = konumlandırma, GIF/video = kesit + konum), anında uygulanır.
 * Kaldırma da anında (eski PATCH ucu; hareketli alanı da temizler).
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import AnimatedClipModal from '@/components/shared/AnimatedClipModal.vue'
import {
  ANIMATED_ACCEPT,
  ANIMATED_TYPES,
  ANIMATED_GIF_MAX_BYTES,
  STATIC_IMAGE_TYPES,
} from '@/utils/animatedMedia'
import type { AnimatedTarget } from '@/api/users'
import type { GuildDto } from '@/types'

const props = defineProps<{ guild: GuildDto; disabled?: boolean }>()
const emit = defineEmits<{ updated: [guild: GuildDto] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const toast = useToastStore()

type Kind = 'icon' | 'banner'
// i18n anahtar öneki: guildSettings.{prefix}Section|Hint|Upload|Remove
const KINDS: { kind: Kind; target: AnimatedTarget; prefix: string }[] = [
  { kind: 'icon', target: 'GUILD_ICON', prefix: 'icon' },
  { kind: 'banner', target: 'GUILD_BANNER', prefix: 'bannerImage' },
]

const animatedDisabled = ref(false)
const accept = computed(() =>
  animatedDisabled.value
    ? STATIC_IMAGE_TYPES.join(',')
    : `${STATIC_IMAGE_TYPES.join(',')},${ANIMATED_ACCEPT}`,
)

const inputs = ref<Record<Kind, HTMLInputElement | null>>({ icon: null, banner: null })
const errors = ref<Record<Kind, string>>({ icon: '', banner: '' })
const clipFile = ref<File | null>(null)
const clipTarget = ref<AnimatedTarget>('GUILD_ICON')
const busy = ref(false)

function hasMedia(kind: Kind): boolean {
  return kind === 'icon' ? !!props.guild.iconUrl : !!props.guild.bannerUrl
}

function onPick(kind: Kind, target: AnimatedTarget, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  errors.value[kind] = ''
  if (!ANIMATED_TYPES.includes(file.type)) {
    errors.value[kind] = t('profile.animated.errorType')
    return
  }
  if (animatedDisabled.value && !STATIC_IMAGE_TYPES.includes(file.type)) {
    errors.value[kind] = t('profile.animated.disabled')
    return
  }
  if (file.type.startsWith('image/') && file.size > ANIMATED_GIF_MAX_BYTES) {
    errors.value[kind] = t('profile.animated.errorImageSize')
    return
  }
  clipTarget.value = target
  clipFile.value = file
}

function onDone(result: unknown) {
  const guild = result as GuildDto
  guildsStore.applyGuild(guild)
  emit('updated', guild)
  clipFile.value = null
  toast.success(t('toast.guildSaved'))
}

function onClipDisabled() {
  animatedDisabled.value = true
  errors.value[clipTarget.value === 'GUILD_ICON' ? 'icon' : 'banner'] = t('profile.animated.disabled')
  clipFile.value = null
}

async function remove(kind: Kind) {
  busy.value = true
  errors.value[kind] = ''
  try {
    const guild =
      kind === 'icon'
        ? await guildsStore.updateGuildIcon(props.guild.id, null)
        : await guildsStore.updateGuildBanner(props.guild.id, null)
    emit('updated', guild)
    toast.success(t('toast.guildSaved'))
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    errors.value[kind] = err.response?.data?.message ?? t('toast.saveError')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <section v-for="k in KINDS" :key="k.kind">
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
        {{ t(`guildSettings.${k.prefix}Section`) }}
      </h3>
      <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">
        {{ t(`guildSettings.${k.prefix}Hint`) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <KvButton size="sm" :disabled="disabled || busy" @click="inputs[k.kind]?.click()">
          {{ t(`guildSettings.${k.prefix}Upload`) }}
        </KvButton>
        <KvButton
          v-if="hasMedia(k.kind)"
          size="sm"
          variant="danger"
          :disabled="disabled || busy"
          @click="remove(k.kind)"
        >
          {{ t(`guildSettings.${k.prefix}Remove`) }}
        </KvButton>
      </div>
      <p v-if="errors[k.kind]" class="text-[12px] mt-2" style="color: var(--kv-danger);">{{ errors[k.kind] }}</p>
      <input
        :ref="(el) => (inputs[k.kind] = el as HTMLInputElement | null)"
        type="file"
        :accept="accept"
        class="hidden"
        @change="onPick(k.kind, k.target, $event)"
      />
    </section>

    <AnimatedClipModal
      v-if="clipFile"
      :file="clipFile"
      :target="clipTarget"
      :guild-id="guild.id"
      @close="clipFile = null"
      @done="onDone"
      @disabled="onClipDisabled"
    />
  </div>
</template>
