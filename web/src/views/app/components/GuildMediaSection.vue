<script setup lang="ts">
/**
 * GuildMediaSection (Sprint C19): ortam simgesi ve afişi. Profil düzenlemedeki akışın aynısı:
 * "Değiştir" → MediaSourceDialog (C22: görsel / GIF-video; Kaldır sayfada, yalnız görsel varken), AnimatedClipModal (statik görsel = konumlandırma, GIF/video = kesit + konum), anında uygulanır.
 * Kaldırma da anında (eski PATCH ucu; hareketli alanı da temizler).
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import AnimatedClipModal from '@/components/shared/AnimatedClipModal.vue'
import MediaSourceDialog from '@/components/shared/MediaSourceDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { ANIMATED_TYPES, ANIMATED_GIF_MAX_BYTES } from '@/utils/animatedMedia'
import type { AnimatedTarget } from '@/api/users'
import type { GuildDto } from '@/types'

const props = defineProps<{ guild: GuildDto; disabled?: boolean }>()
const emit = defineEmits<{ updated: [guild: GuildDto] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const toast = useToastStore()
const authStore = useAuthStore()

type Kind = 'icon' | 'banner'
// i18n anahtar öneki: guildSettings.{prefix}Section|Hint|Upload|Remove
const KINDS: { kind: Kind; target: AnimatedTarget; prefix: string }[] = [
  { kind: 'icon', target: 'GUILD_ICON', prefix: 'icon' },
  { kind: 'banner', target: 'GUILD_BANNER', prefix: 'bannerImage' },
]

// Hareketli kapısı sunucudan gelir (C22); tahmin yok
const animatedAllowed = computed(() => authStore.user?.animatedAllowed === true)

// choiceKind pencere kapanınca da kalır: dosya seçici pencere kapandıktan sonra yanıt verir
const choiceKind = ref<Kind>('icon')
const choiceOpen = ref(false)
const choiceTarget = computed(() => KINDS.find((k) => k.kind === choiceKind.value)!)
const choiceTitle = computed(() =>
  t(choiceKind.value === 'icon' ? 'media.source.title.guildIcon' : 'media.source.title.guildBanner'),
)

function openChoice(kind: Kind) {
  choiceKind.value = kind
  choiceOpen.value = true
}

const errors = ref<Record<Kind, string>>({ icon: '', banner: '' })
const clipFile = ref<File | null>(null)
const clipTarget = ref<AnimatedTarget>('GUILD_ICON')
const busy = ref(false)

function hasMedia(kind: Kind): boolean {
  return kind === 'icon' ? !!props.guild.iconUrl : !!props.guild.bannerUrl
}

function onPick(file: File) {
  const { kind, target } = choiceTarget.value
  errors.value[kind] = ''
  if (!ANIMATED_TYPES.includes(file.type)) {
    errors.value[kind] = t('profile.animated.errorType')
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
        <KvButton size="sm" :disabled="disabled || busy" @click="openChoice(k.kind)">
          {{ t(`guildSettings.${k.prefix}Upload`) }}
        </KvButton>
        <!-- Kaldır sayfada, yalnız görsel varken (sahip kararı 2026-10-27: pencere yalnız yükleme yeri) -->
        <KvButton v-if="hasMedia(k.kind)" size="sm" variant="danger" :disabled="disabled || busy" @click="remove(k.kind)">
          {{ t(`guildSettings.${k.prefix}Remove`) }}
        </KvButton>
      </div>
      <p v-if="errors[k.kind]" class="text-[12px] mt-2" style="color: var(--kv-danger);">{{ errors[k.kind] }}</p>
    </section>

    <MediaSourceDialog
      :open="choiceOpen"
      :title="choiceTitle"
      :animated-allowed="animatedAllowed"
      @close="choiceOpen = false"
      @file="onPick"
    />

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
