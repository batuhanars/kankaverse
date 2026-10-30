<script setup lang="ts">
/**
 * PlatformLogo - C36: Kick / Twitch simgesi (tek renkli resmi marka glifi, projede SVG dosyası).
 * Süs değil bilgi taşır; erişilebilir ad isteyen yerde üst eleman aria-label verir.
 */
import kickLogo from '@/assets/brand/kick.svg'
import twitchLogo from '@/assets/brand/twitch.svg'
import type { StreamProviderKey } from '@/types'

withDefaults(defineProps<{ provider: StreamProviderKey; size?: number }>(), { size: 20 })

const sources: Record<StreamProviderKey, string> = { kick: kickLogo, twitch: twitchLogo }
</script>

<template>
  <img :src="sources[provider]" alt="" :width="size" :height="size" class="shrink-0" draggable="false" />
</template>
