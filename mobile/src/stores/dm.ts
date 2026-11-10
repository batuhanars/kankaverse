import { create } from 'zustand';
import { dmApi, type DmChannelDto, type DmLastReactionDto } from '@/api/dm';
import { extractErrorMessage } from '@/api/errors';
import { playMessageTone } from '@/audio/messageTone';

/** 3 yerde aynı "id'ye göre çıkar" tekrarı (clearChannel/leaveGroup/deleteGroup) — Rule of Three,
 *  dosya-içi özel yardımcıya çıkarıldı (dışa açılmaz, sözleşme kapsamı yalnız bu store). */
function withoutChannel(list: DmChannelDto[], channelId: string): DmChannelDto[] {
  return list.filter((c) => c.id !== channelId);
}

// Sözleşme §8.3 — DM listesi CANLI olmak zorunda. Önceden `DmSidebar` kendi içinde tek seferlik
// çekiyordu: liste yalnız mount'ta doluyordu, sekmeler mount'ta kaldığı için (expo-router Tabs)
// kullanıcı bayat bir listeye süresiz bakabiliyordu — pull-to-refresh de yok. Bu store, soket
// katmanının (realtime/socket.ts) dokunabileceği tek yer; `applyActivity` semantiği web
// `stores/dm.ts` ile birebir aynı: yerinde güncelle + başa taşı + okunmadı işaretle, kanal listede
// yoksa tam tazele.
type LoadState = 'loading' | 'error' | 'ready';

interface DmActivity {
  channelId: string;
  lastMessage: { content: string; createdAt: string };
  senderId: string;
}

interface DmState {
  channels: DmChannelDto[];
  requestCount: number;
  state: LoadState;
  errorMessage: string;
  /** Açık DM ekranı — o kanala gelen mesaj listede "okunmadı" olarak işaretlenmez (web ile aynı). */
  activeDmChannelId: string | null;
  /** Oturum sahibinin id'si. Store auth'u İMPORT ETMEZ (auth.ts → socket.ts → store yönü var, ters
   *  yön döngü kurar); değeri `(app)/_layout.tsx` besler — oturum kapsamlı tek nokta. */
  myId: string | null;

  fetchAll: () => Promise<void>;
  refreshRequests: () => Promise<void>;
  /**
   * Sprint M3b R6 — mesaj isteğini reddet; `block: true` ise sunucu aynı işlemde **engeller**.
   *
   * 🔴 Neden store'a girdi (M1d-0 dersi): `dm-requests.tsx` bugüne kadar `dmApi.rejectRequest`i
   * DOĞRUDAN çağırıp yalnız KENDİ yerel listesini süzüyordu. Sonuç: bu store'daki `requestCount`
   * (DmSidebar'daki "Mesaj İstekleri (n)" rozeti) bayat kalıyordu. Engelleme eklenince aynı boşluk
   * daha da büyürdü — engel, DM'in `canMessage`/`selfBlocked` bayraklarını da değiştiriyor ve o
   * bayraklar da bu store'da. Mutasyonun yan etkisinin sahibi tek olmalı: artık burası.
   *
   * `fetchAll()` ikisini birden tazeliyor (kanal listesi + istek sayısı), ayrı çağrı gerekmiyor.
   * 🔴 `useFriendsStore` BURADAN çağrılmaz — friends.ts zaten dm.ts'i import ediyor, ters yön
   * döngü kurardı. Engellenenler listesi kendi ekranının mount'unda çekiliyor, bayat kalmıyor.
   */
  rejectRequest: (channelId: string, block: boolean) => Promise<void>;
  /**
   * Sprint M3b R6 — mesaj isteğini kabul et. `rejectRequest` ile **aynı kalıp**, aynı gerekçe:
   * ekran bunu da `dmApi` üzerinden doğrudan çağırıyordu, store hiç haberdar olmuyordu → (a)
   * `requestCount` rozeti bayat kalıyordu, (b) kabul edilen kanal `PENDING`ten `ACCEPTED`e geçtiği
   * hâlde bir sonraki `fetchAll`a kadar DM listesine girmiyordu (`visibleChannels` PENDING olanları
   * süzüyor). Reddetme store'dan, kabul etme API'den geçseydi aynı dosyada iki desen kalırdı.
   *
   * 🔴 **Dönüş değeri korunuyor:** `dmApi.acceptRequest` kabul edilen kanalı döndürüyor ve çağıran
   * ekran onunla sohbete yönleniyor. Store araya girerken `void`e düşürülseydi o akış sessizce
   * kırılırdı (web'in dm store'u da bu yüzden kanalı döndürüyor).
   */
  acceptRequest: (channelId: string) => Promise<DmChannelDto>;
  applyActivity: (payload: DmActivity) => Promise<void>;
  setActiveDm: (channelId: string | null) => void;
  clearUnread: (channelId: string) => void;
  /** C46 §4b — WS `dm.reaction`: satırın tepki göstergesini yazar/temizler. Süzgeç sunucuda. */
  applyReaction: (channelId: string, lastReaction: DmLastReactionDto | null) => void;
  /** C12 §4.1 — WS `dm:read`: karşı taraf bu kanalı okudu, kanal başına tek tarih güncellenir. */
  applyReadReceipt: (payload: { channelId: string; readAt: string }) => void;
  applyGroupReadReceipt: (payload: {
    channelId: string;
    receiptsEnabled: boolean;
    groupAllReadAt: string | null;
  }) => void;
  /** Sözleşme §3.2 — sıfırdan DM başlat. Sunucu kanal zaten varsa mevcut olanı döner; burada id'ye
   *  göre eşleştirilir (kopya kutucuk açılmaz). */
  createChannel: (userId: string) => Promise<DmChannelDto>;
  /** Sözleşme §3.6 / G4 — "Sohbeti temizle" (dil bilinçli: "sil" değil — mesaj DB'de kalır). */
  clearChannel: (channelId: string) => Promise<void>;
  /** Sözleşme §3.3 — Grup DM kur (1-9 üye). */
  createGroup: (memberIds: string[], name?: string) => Promise<DmChannelDto>;
  addGroupMember: (groupId: string, userId: string) => Promise<void>;
  removeGroupMember: (groupId: string, userId: string) => Promise<void>;
  setGroupAdmin: (groupId: string, userId: string, isAdmin: boolean) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  /** Oturum başlar/biter: id verilir ya da null ile TÜM DM durumu silinir. null hâli kritik —
   *  liste artık store'da yaşıyor, temizlenmezse çıkıştan sonra bir sonraki kullanıcı öncekinin
   *  DM listesini görür (bileşen yerel state'inde bu sorun kendiliğinden yoktu). */
  setSessionUser: (userId: string | null) => void;
}

/** Bekleyen GİDEN istek normal listede görünmez (web `DmList.vue` C9 kuralı) — gönderen kendi
 *  bekleyen isteğini iki kez görmesin. */
function visibleChannels(list: DmChannelDto[]): DmChannelDto[] {
  return list.filter((c) => !(c.type === 'DM' && c.requestStatus === 'PENDING'));
}

export const useDmStore = create<DmState>((set, get) => ({
  channels: [],
  requestCount: 0,
  state: 'loading',
  errorMessage: '',
  activeDmChannelId: null,
  myId: null,

  async fetchAll() {
    try {
      const [list, requests] = await Promise.all([dmApi.listChannels(), dmApi.listRequests()]);
      set((s) => ({
        // 🔴 Kusur düzeltmesi (sahip bulgusu 2026-08-12): açık DM'in rozeti sunucu yanıtıyla
        // GERİ GELİYORDU. Sunucu `unread`i `lastReadAt`e göre hesaplıyor ve o an ekranda olan
        // sohbete yeni mesaj düştüğünde (markRead henüz gitmemişken) `true` dönüyor; araya giren
        // her `fetchAll` bu değeri listeye yazıyordu. Bir kez `true` olduktan sonra `applyActivity`
        // onu bir daha düşürmediği için rozet sohbet açıkken bile takılı kalıyordu (liste noktası,
        // ray sayacı, sekme rozeti, geri okundaki rozet — hepsi bu tek alandan besleniyor).
        // Kural tek cümle: BAKMAKTA OLDUĞUN DM okunmamış değildir. Sunucu birazdan zaten aynı
        // şeyi söyleyecek (`markRead` MessageScreen'den gidiyor), burada yalnız yarış kapatılıyor.
        channels: visibleChannels(list).map((c) =>
          c.id === s.activeDmChannelId ? ({ ...c, unread: false, lastReaction: null } as DmChannelDto) : c,
        ),
        requestCount: requests.length,
        state: 'ready' as LoadState,
        errorMessage: '',
      }));
    } catch (e) {
      set({ state: 'error', errorMessage: extractErrorMessage(e) });
    }
  },

  async refreshRequests() {
    try {
      const requests = await dmApi.listRequests();
      set({ requestCount: requests.length });
    } catch {
      // sessizce yut — rozet güncellenmeden kalır, liste yine çalışır
    }
  },

  async rejectRequest(channelId, block) {
    await dmApi.rejectRequest(channelId, block);
    // Hata YUTULMAZ (yukarıdaki `refreshRequests`in aksine): çağıran ekran kullanıcıya Türkçe
    // mesajı göstermek zorunda, sessiz başarısızlık "reddettim sandım" durumu üretirdi.
    await get().fetchAll();
  },

  async acceptRequest(channelId) {
    // Kanal SUNUCU yanıtından alınır, `fetchAll` sonrası listeden aranmaz: yanıt otoriter kaynak ve
    // liste bir sebeple onu taşımasa bile yönlendirme kırılmamalı.
    const channel = await dmApi.acceptRequest(channelId);
    // Hata yutulmaz (aynı gerekçe: sessiz başarısızlık "kabul ettim sandım" üretir).
    await get().fetchAll();
    return channel;
  },

  async applyActivity(payload) {
    const { channels, activeDmChannelId, myId } = get();
    const idx = channels.findIndex((c) => c.id === payload.channelId);

    if (idx === -1) {
      // Alıcının listesinde henüz yok (yeni DM / yeni grup) — tam tazele. Yeni bir mesaj isteği de
      // olabilir, o yüzden istek sayacı da bu yolla güncellenir.
      await get().fetchAll();
      return;
    }

    const existing = channels[idx];
    const lastMessage: DmChannelDto['lastMessage'] = existing.lastMessage
      ? { ...existing.lastMessage, content: payload.lastMessage.content, createdAt: payload.lastMessage.createdAt }
      : {
          // Önceki lastMessage null idi — minimal şekle yazılır (web ile aynı; eksik alanlar
          // yalnız önizleme için kullanılmıyor, liste `content`+`createdAt` okuyor).
          id: '',
          channelId: payload.channelId,
          content: payload.lastMessage.content,
          replyToId: null,
          author: { id: payload.senderId, username: '', avatarUrl: null },
          createdAt: payload.lastMessage.createdAt,
          editedAt: null,
          pinnedAt: null,
        };

    // Açık DM'de rozet HER ZAMAN düşer (`existing.unread` korunmaz): kanal zaten ekranda okunuyor
    // ve bayrak bir yarış yüzünden (bkz. `fetchAll` notu) takılı kalmış olabilir — o durumda yeni
    // mesaj gelmesi rozeti temizlemek için doğru an, çünkü ekran mesajı gösteriyor.
    const unread =
      payload.channelId === activeDmChannelId
        ? false
        : payload.senderId === myId
          ? false // C20: cevapladım = okudum (başka cihazımdan gönderdim; sunucu işaretçiyi ilerletti)
          : true;

    // Sprint M5f §3 — uygulama içi mesaj sesi. Rozet düşürme dalıyla AYNI ayrımı okur (kullanıcı
    // tam bu DM ekranındayken · gönderen BAŞKASI): kendi mesajında çalmaz, başka bir kanalda/DM
    // listesindeyken de çalmaz (M5e §1 kararını geri almaz — gösterilen bildirim yine yok, yalnız
    // burada kısa bir ses var). Yeni bir tetikleyici KURULMADI, var olan koşul yeniden okundu.
    if (payload.channelId === activeDmChannelId && payload.senderId !== myId) {
      playMessageTone();
    }

    // Yeni mesaj tepki göstergesinin yerini alır (C46 §4b.5)
    const updated = { ...existing, lastMessage, unread, lastReaction: null } as DmChannelDto;
    const rest = channels.filter((_, i) => i !== idx);
    set({ channels: [updated, ...rest] });
  },

  setActiveDm(channelId) {
    set({ activeDmChannelId: channelId });
  },

  clearUnread(channelId) {
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId ? ({ ...c, unread: false, lastReaction: null } as DmChannelDto) : c,
      ),
    }));
  },

  applyReaction(channelId, lastReaction) {
    if (lastReaction === null) {
      // Yalnız göstergeyi temizle; `unread` değişmez (yenilemede sunucu doğrusunu söyler).
      set((s) => ({
        channels: s.channels.map((c) => (c.id === channelId ? ({ ...c, lastReaction: null } as DmChannelDto) : c)),
      }));
      return;
    }
    if (channelId === get().activeDmChannelId) {
      // Açık sohbet: gösterge yazılmaz, mevcut okundu çağrısı gider (MessageScreen ile aynı uç).
      void dmApi.markRead(channelId).catch(() => {});
      return;
    }
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === channelId ? ({ ...c, lastReaction, unread: true } as DmChannelDto) : c,
      ),
    }));
  },

  /**
   * C12 §4.1 — kanal başına TEK tarih tutulur, mesaj başına durum yok: `otherReadAt`ten büyük
   * olmayan her kendi mesajım "görüldü" sayılır. Tek alan güncellemesi o sohbetteki bütün tikleri
   * aynı anda doğru duruma geçirir.
   *
   * Gizlilik kararı SUNUCUDA (`visibleReadAt`, R7): görmeye hakkımız yoksa olay hiç gelmez.
   * Burada ikinci bir süzgeç YOK — olsaydı kural iki yerde yaşar ve ikisi ayrışırdı.
   */
  applyReadReceipt({ channelId, readAt }) {
    set((s) => ({
      channels: s.channels.map((c) => {
        if (c.id !== channelId || c.type !== 'DM') return c;
        // Geriye gitme: yarış hâlinde eski bir olay yeni tarihi ezmesin.
        if (c.otherReadAt && c.otherReadAt >= readAt) return c;
        return { ...c, otherReadAt: readAt } as DmChannelDto;
      }),
    }));
  },

  /**
   * C34 — WS `dm:groupRead`: grup üyesi okudu; sunucu bu izleyicinin gözünden toplu durumu yollar
   * (bireysel okuma anı yok). Kapı ve zaman sunucudan olduğu gibi alınır, burada ikinci süzgeç yok.
   */
  applyGroupReadReceipt({ channelId, receiptsEnabled, groupAllReadAt }) {
    set((s) => ({
      channels: s.channels.map((c) => {
        if (c.id !== channelId || c.type !== 'GROUP_DM') return c;
        // Geriye gitme: yarış hâlinde eski olay yeni tarihi ezmesin.
        if (groupAllReadAt && c.groupAllReadAt && c.groupAllReadAt > groupAllReadAt) return c;
        return { ...c, receiptsEnabled, groupAllReadAt } as DmChannelDto;
      }),
    }));
  },

  async createChannel(userId) {
    const channel = await dmApi.createChannel(userId);
    const idx = get().channels.findIndex((c) => c.id === channel.id);
    set((s) => {
      const rest = idx === -1 ? s.channels : s.channels.filter((_, i) => i !== idx);
      return { channels: visibleChannels([channel, ...rest]) };
    });
    return channel;
  },

  async clearChannel(channelId) {
    await dmApi.clearChannel(channelId);
    set((s) => ({ channels: withoutChannel(s.channels, channelId) }));
  },

  async createGroup(memberIds, name) {
    const channel = await dmApi.createGroup(memberIds, name);
    // D49: sunucu tek üyeli (toplam 2 kişi) istekte GRUP DEĞİL 1-1 DM döner — mevcut DM varsa
    // o kanalın kendisi. Dönen kanal listede zaten olabilir; körü körüne başa eklemek kopya
    // satır açardı. `createChannel` ile aynı eşleştirme deseni (visibleChannels PENDING isteği
    // listeden süzer, ekran yine sohbete gider).
    set((s) => ({ channels: visibleChannels([channel, ...withoutChannel(s.channels, channel.id)]) }));
    return channel;
  },

  async addGroupMember(groupId, userId) {
    await dmApi.addGroupMember(groupId, userId);
    // Üye eklenince kanal listesi tazelenir (members dizisi güncellensin — web `fetchChannels` ile aynı).
    await get().fetchAll();
  },

  async removeGroupMember(groupId, userId) {
    await dmApi.removeGroupMember(groupId, userId);
    set((s) => ({
      channels: s.channels.map((c) =>
        c.id === groupId && c.type === 'GROUP_DM' ? { ...c, members: c.members.filter((m) => m.id !== userId) } : c,
      ),
    }));
  },

  async setGroupAdmin(groupId, userId, isAdmin) {
    await dmApi.setGroupAdmin(groupId, userId, isAdmin);
    set((s) => ({
      channels: s.channels.map((c) => {
        if (c.id !== groupId || c.type !== 'GROUP_DM') return c;
        const rest = (c.adminIds ?? []).filter((id) => id !== userId);
        return { ...c, adminIds: isAdmin ? [...rest, userId] : rest };
      }),
    }));
  },

  async leaveGroup(groupId) {
    await dmApi.leaveGroup(groupId);
    set((s) => ({ channels: withoutChannel(s.channels, groupId) }));
  },

  async deleteGroup(groupId) {
    await dmApi.deleteGroup(groupId);
    set((s) => ({ channels: withoutChannel(s.channels, groupId) }));
  },

  async renameGroup(groupId, name) {
    const updated = await dmApi.renameGroup(groupId, name);
    set((s) => ({
      channels: s.channels.map((c) => (c.id === groupId && c.type === 'GROUP_DM' ? { ...c, name: updated.name } : c)),
    }));
  },

  setSessionUser(userId) {
    if (userId === null) {
      set({
        channels: [],
        requestCount: 0,
        state: 'loading',
        errorMessage: '',
        activeDmChannelId: null,
        myId: null,
      });
      return;
    }
    set({ myId: userId });
  },
}));
