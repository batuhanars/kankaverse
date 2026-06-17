import { ref } from 'vue'

/**
 * Ortam hızlı-aksiyon köprüsü — ServerRail sağ-tık menüsünden "Kanal Ekle / Kategori
 * Oluştur / Etkinlik Oluştur" tetiklenir; ilgili create modalları ChannelPanel'de
 * (aktif ortam için) açılır. ServerRail önce hedef ortama geçer + `request` çağırır;
 * ChannelPanel aktif ortam eşleşince `consume` ile tüketip modalı açar.
 *
 * Modül-seviyesi tek `pending` — tek seferlik (consume sıfırlar).
 */
export type GuildQuickAction = 'create-channel' | 'create-category' | 'create-event'

const pending = ref<{ guildId: string; action: GuildQuickAction } | null>(null)

export function useGuildQuickAction() {
  function request(guildId: string, action: GuildQuickAction) {
    pending.value = { guildId, action }
  }
  /** Aktif ortam eşleşiyorsa aksiyonu döndür + sıfırla; aksi halde null. */
  function consume(guildId: string): GuildQuickAction | null {
    if (pending.value && pending.value.guildId === guildId) {
      const action = pending.value.action
      pending.value = null
      return action
    }
    return null
  }
  return { pending, request, consume }
}
