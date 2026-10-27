import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { DiscoveryGuildDto } from '@/types'

/**
 * Keşfet'ten ortama katılma + varış akışı (Sprint C18). DiscoverView ve ana ekran öneri bloğu
 * AYNI hata/yönlendirme mantığını paylaşır; iki yerde ayrı tutulursa ALREADY_MEMBER ve toast
 * davranışı ayrışır. Katılma kapıları (yaş, ban) backend'de; burada yalnız sonuç gösterilir.
 */
export function useDiscoverJoin() {
  const { t } = useI18n()
  const router = useRouter()
  const guildsStore = useGuildsStore()
  const channelsStore = useChannelsStore()
  const authStore = useAuthStore()
  const toast = useToastStore()

  const joiningId = ref<string | null>(null)

  /** Bir ortama git (kanalları yükle, ilk kanala yönlendir) — join sonrası / zaten üye. */
  async function goToGuild(guildId: string) {
    if (!channelsStore.channelsForGuild(guildId).length) {
      await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
    }
    const channels = channelsStore.channelsForGuild(guildId)
    if (channels.length > 0) {
      void router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
    } else {
      guildsStore.setActiveGuild(guildId)
      channelsStore.setActiveChannel(null)
      void router.push({ name: 'app' })
    }
  }

  async function joinGuild(guild: DiscoveryGuildDto) {
    if (joiningId.value) return
    joiningId.value = guild.id
    try {
      await guildsStore.joinDiscovery(guild.id)
      await goToGuild(guild.id)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; message?: string } } }
      // Zaten üye → hata değil; o ortama git.
      if (err.response?.data?.error === 'ALREADY_MEMBER') {
        await goToGuild(guild.id)
        return
      }
      toast.error(err.response?.data?.message ?? t('toast.joinError'))
    } finally {
      joiningId.value = null
    }
  }

  return { joiningId, joinGuild, goToGuild }
}
