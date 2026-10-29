import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

/** Sunucunun yaydığı oyun: kimlik + tablodaki ad (ad istemciden asla gelmez). */
export interface GameActivity {
  gameId: string
  name: string
}

/**
 * C31b §4.2 — kullanıcı başına "oynuyor" durumu. Yalnız sunucudan beslenir:
 * `presence:snapshot` (tam liste, bağlanınca) + `activity:update` (tek kullanıcı, null = oyun yok).
 * Görünürlük kararı sunucuda (`canSeeActivity`); burada filtre YOK, gelen neyse gösterilir.
 */
export const useActivityStore = defineStore('activity', () => {
  const byUser = reactive<Record<string, GameActivity>>({})

  /** Snapshot tam durumdur: önceki kayıtlar bayat olabilir, hepsi yeniden kurulur. */
  function applySnapshot(states: Array<{ userId: string; gameId?: string; gameName?: string }>) {
    for (const key of Object.keys(byUser)) delete byUser[key]
    for (const s of states) {
      if (s.gameId && s.gameName) byUser[s.userId] = { gameId: s.gameId, name: s.gameName }
    }
  }

  function applyUpdate(userId: string, game: { id: string; name: string } | null) {
    if (game) byUser[userId] = { gameId: game.id, name: game.name }
    else delete byUser[userId]
  }

  function getGame(userId: string): GameActivity | null {
    return byUser[userId] ?? null
  }

  /** Kendi oyunum (yayın önerisi buradan okur). */
  function myGame(): GameActivity | null {
    const myId = useAuthStore().user?.id
    return myId ? getGame(myId) : null
  }

  /**
   * Yayın önerisi bildirimine tıklandı (§4.6): ses çubuğu bunu görünce ekran paylaşım akışını
   * (nudge dahil, mevcut kapılarla) başlatır. Bayrak, çubuk henüz bağlı değilken gelen isteği de taşır.
   */
  const pendingShare = ref(false)
  function requestShare() {
    pendingShare.value = true
  }

  return { byUser, applySnapshot, applyUpdate, getGame, myGame, pendingShare, requestShare }
})
