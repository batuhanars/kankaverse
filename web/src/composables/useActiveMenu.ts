import { ref, computed } from 'vue'

/**
 * useActiveMenu — paylaşılan "aktif bağlamsal overlay" durumu (R8/R13).
 *
 * Çekirdek ilke: bir bağlamsal menü/kart AÇIKKEN, BAŞKA öğelerin hover-tetiklemeli
 * affordance'ları (araç çubuğu/⋯ butonu/hover-vurgu) görünmemeli. Kullanıcı fareyi
 * açık menüye götürürken başka satırlar tepki vermesin.
 *
 * Mekanizma: modül-seviyesi tek bir ref, şu an açık overlay'in "sahip anahtarını" tutar
 * (örn. mesaj satırı `msg:<id>`, üye satırı `member:<id>`). Satırlar buna bakar:
 *   - hiç overlay açık değilse → normal hover davranışı
 *   - overlay açık ve sahibi BEN'sem → affordance'ım görünür kalır
 *   - overlay açık ama sahibi başkasıysa → affordance'ımı bastır
 *
 * Not: Bu yalnız GÖRÜNÜRLÜK koordinasyonudur. Menü/kart açma-kapama state'i hâlâ
 * ilgili component'larda yaşar (MessageActionsMenu singleton, MemberPanel openMenu/openCard);
 * onlar açıldığında/kapandığında burada `setActive(key)` / `clearActive(key)` çağırır.
 */

// Modül-seviyesi singleton — tüm satırlar paylaşır.
const activeOwnerKey = ref<string | null>(null)

export function useActiveMenu() {
  /** Bir overlay açıldı/güncellendi: bu anahtarı aktif sahip yap. */
  function setActive(key: string) {
    activeOwnerKey.value = key
  }

  /**
   * Bu anahtara ait overlay kapandı: yalnız hâlâ sahip BEN'sem temizle
   * (başka bir satır araya girip sahipliği devraldıysa onu ezmeyiz).
   */
  function clearActive(key: string) {
    if (activeOwnerKey.value === key) activeOwnerKey.value = null
  }

  /**
   * Bu satırın hover affordance'ı bastırılmalı mı?
   * Açık bir overlay var VE sahibi ben değilsem → true (bastır).
   */
  function isSuppressed(key: string): boolean {
    return activeOwnerKey.value !== null && activeOwnerKey.value !== key
  }

  return {
    activeOwnerKey: computed(() => activeOwnerKey.value),
    setActive,
    clearActive,
    isSuppressed,
  }
}
