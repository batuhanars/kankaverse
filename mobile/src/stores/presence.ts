import { create } from 'zustand';

/**
 * Kullanıcı durumu (çevrimiçi/boşta/rahatsız etmeyin) — web `stores/presence.ts`in mobil karşılığı,
 * ihtiyaç kadarı. Sunucu tarafında YENİ HİÇBİR ŞEY YOK: `presence:snapshot` ve `presence:update`
 * olayları web için zaten yayınlanıyordu ve mobil cihaza da geliyordu, yalnız kimse dinlemiyordu
 * (M1a'daki `dm.message` ile birebir aynı sınıf eksik — bkz. `realtime/socket.ts` §8.3 notu).
 *
 * 🔒 Görünürlük kararı SUNUCUDA (`PresenceService.canSeePresence`, R7): engelli taraf göremez,
 * minör yalnız arkadaşına görünür. Bu store yalnız sunucunun gönderdiğini saklar; istemcide
 * "şunu da gösterelim" diye genişletilemez — genişletilecek yer burası değil, orası.
 *
 * Web'in store'undan tek bilinçli fark: `applySnapshot` haritayı BİRLEŞTİRMEZ, DEĞİŞTİRİR.
 * Snapshot "görebildiğin kişilerden şu an aktif olanların TAMAMI" demek; içinde olmayan herkes
 * çevrimdışıdır. Mobilde soket uygulama arka plana düştükçe kopup yeniden bağlanıyor, birleştirme
 * yapılsaydı kopukken çıkan biri ekranda sonsuza kadar "Çevrimiçi" kalırdı.
 */
export type PresenceStatus = 'online' | 'away' | 'dnd' | 'offline';

interface PresenceState {
  /** userId → durum. Yalnız aktif kullanıcılar tutulur; haritada olmayan = çevrimdışı. */
  statusMap: Record<string, PresenceStatus>;
  applySnapshot: (states: { userId: string; status: PresenceStatus }[], selfId?: string) => void;
  applyUpdate: (userId: string, status: PresenceStatus) => void;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  statusMap: {},

  applySnapshot(states, selfId) {
    const next: Record<string, PresenceStatus> = {};
    // Snapshot kullanıcının KENDİSİNİ hiç içermez (sunucu `candidatePool` kendini dışarıda bırakır);
    // kendi durumu ayrı bir `presence:update` ile gelir ve snapshot'tan ÖNCE varabilir. Değiştirme
    // mantığı onu silerse kişi kendi üye listesinde çevrimdışı görünür (sahip bulgusu 2026-11-12).
    if (selfId && get().statusMap[selfId]) next[selfId] = get().statusMap[selfId];
    for (const { userId, status } of states) {
      if (status !== 'offline') next[userId] = status;
    }
    set({ statusMap: next });
  },

  applyUpdate(userId, status) {
    set((s) => {
      if (status === 'offline') {
        if (!(userId in s.statusMap)) return s;
        const next = { ...s.statusMap };
        delete next[userId];
        return { statusMap: next };
      }
      if (s.statusMap[userId] === status) return s; // gereksiz render yok
      return { statusMap: { ...s.statusMap, [userId]: status } };
    });
  },

  reset() {
    set({ statusMap: {} });
  },
}));

/** Haritada yoksa çevrimdışı — tek yerde karar verilsin diye seçici. */
export function selectStatus(userId: string | undefined | null) {
  return (s: PresenceState): PresenceStatus => (userId ? (s.statusMap[userId] ?? 'offline') : 'offline');
}
