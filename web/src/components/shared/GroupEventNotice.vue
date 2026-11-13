<script setup lang="ts">
/**
 * C64 — grup üyelik olayı satırı ("Ayla gruptan ayrıldı"). Mesaj değildir: seçilemez, menüsü yok;
 * E2eeDeviceNotice ile aynı gri dil. Metinler ek gerektirmeyen kalıplarla (§4).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import type { GroupDmEventDto } from '@/types'

const props = defineProps<{ event: GroupDmEventDto }>()
const { t } = useI18n()
const authStore = useAuthStore()

const text = computed(() => {
  const e = props.event
  const me = authStore.user?.id
  const params = { actor: e.actor?.username ?? '', target: e.target.username }
  const targetIsMe = e.target.id === me
  const actorIsMe = !!e.actor && e.actor.id === me
  if (e.kind === 'MEMBER_LEFT') return t(targetIsMe ? 'groupEvent.leftMe' : 'groupEvent.left', params)
  const base = e.kind === 'MEMBER_ADDED' ? 'added' : 'removed'
  if (targetIsMe) return t(`groupEvent.${base}Me`, params)
  return t(actorIsMe ? `groupEvent.${base}ByMe` : `groupEvent.${base}`, params)
})
</script>

<template>
  <div class="flex items-center gap-2 px-4 mt-3 select-none pointer-events-none" role="note">
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
    <span class="text-[11px] font-semibold text-center" style="color: var(--kv-text-muted)">{{ text }}</span>
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
  </div>
</template>
