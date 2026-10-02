/**
 * M6b §2 — "Aynı anda tek ses çalar": uygulama genelinde tek "şu an çalan" durumu.
 *
 * Her oynatıcı çalmaya başlarken `claim(pause)` çağırır; önceki sahibin `pause`u çalıştırılır.
 * Modül seviyesinde durum bilinçli: Pinia store gerekmez, oynatıcılar birbirini tanımaz.
 */
let activePause: (() => void) | null = null

export function useExclusivePlayback() {
  function claim(pause: () => void) {
    if (activePause && activePause !== pause) activePause()
    activePause = pause
  }

  function release(pause: () => void) {
    if (activePause === pause) activePause = null
  }

  return { claim, release }
}
