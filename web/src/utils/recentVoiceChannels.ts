/** C31c §4.3 — son girilen ses kanalları (yerel, en yeni başta, en fazla 5). Yalnız kimlik tutulur. */
const KEY = 'kv.recentVoiceChannels'
const MAX = 5

export function readRecentVoiceChannels(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === 'string').slice(0, MAX)
      : []
  } catch {
    return []
  }
}

export function recordRecentVoiceChannel(channelId: string): void {
  try {
    const next = [channelId, ...readRecentVoiceChannels().filter((id) => id !== channelId)]
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)))
  } catch {
    /* depolama kapalı: son kanallar tutulmaz */
  }
}
