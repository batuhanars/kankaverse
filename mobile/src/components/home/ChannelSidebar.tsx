import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { categoriesApi, type CategoryDto } from '@/api/categories';
import { extractErrorMessage } from '@/api/errors';
import { useUnreadStore } from '@/stores/unread';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { CategorySection } from './CategorySection';
import { ChannelRow } from './ChannelRow';
import { t } from '@/i18n';
import { theme } from '@/theme';

type LoadState = 'loading' | 'error' | 'ready';

interface Props {
  guildId: string;
  guildName: string;
  /** Sprint M1d-B §10.3 — afiş GÖSTERİLİR, yüklenmez (yükleme yüzeyleri web/masaüstüne mahsus). */
  guildBannerUrl?: string | null;
  /** C19: hareketli afis; normal `Image` oldugu icin azaltilmis hareket kapaliyken gosterilir. */
  guildBannerAnimatedUrl?: string | null;
  selectedChannelId?: string;
  onOpenChannel: (channel: ChannelSummaryDto) => void;
  /** Ortam adına dokunuş → alt panel (§10.2). A yarısındaki tekil davet ikonunun yerini aldı. */
  onOpenGuildMenu: () => void;
  /**
   * Sprint M2a §4.5 — uzun basış artık HER üyeye açık (panel "Okundu İşaretle" taşıyor, yetki
   * işi değil). `canManage` gating'i buradan kalktı; panelin İÇİNDEKİ yönetim maddeleri
   * (Kanalı Düzenle/Kanal Oluştur) `home.tsx`'te `ChannelMenuSheet`/`CategoryMenuSheet`'e geçilen
   * `canManage` ile koşullu — o bayrağı burada tutmak artık gereksizdi (kullanılmayan prop).
   */
  onEditChannel: (channel: ChannelSummaryDto) => void;
  onEditCategory: (category: CategoryDto) => void;
  /** Sprint M1g §2.1 — aksiyon şeridi: ortam içi arama (tam ekran) + davet. */
  onOpenSearch: () => void;
  onInvite: () => void;
  onOpenEvents: () => void;
}

/** Kategorisiz kanallar için sentetik başlıksız bölüm anahtarı. */
const UNCATEGORIZED = '__none__';

/**
 * Collapse tercihi anahtarı — **web ile aynı şema** (`ChannelPanel.vue` `collapseKey`).
 * Web `localStorage`, mobil `AsyncStorage`; anahtar aynı olsun ki iki istemcinin zihinsel modeli
 * bölünmesin (sözleşme §2.5).
 */
function collapseKey(guildId: string, categoryId: string): string {
  return `kv:cat-collapsed:${guildId}:${categoryId}`;
}

// Sprint M1a contract §0 + §2 — YALNIZ GUILD_TEXT listeleniyordu; ses satırını gösterip dokununca
// hiçbir şey yapmamak "boş yüzey" olurdu (mobile/CLAUDE.md yasağı) — ama katılma akışı yoktu.
// Sprint M1d-B — kanallar artık kategori başlıkları altında gruplu (§2.5).
// Sprint M4c §2 — katılma akışı geldi (`home.tsx` `openChannel`), GUILD_VOICE artık süzgeçten
// ÇIKARILDI: metin kanallarıyla AYNI listede, kendi `position`inde (web'in ayrı bölüm yapmadığı
// gibi). Ses kanalının okunmamış/bahsetme sayacı YOK — `hydrateChannels`e yalnız metin alt kümesi
// verilir (§2: "okunmadı mantığı bu satırlara uygulanmaz").
export function ChannelSidebar({
  guildId,
  guildName,
  guildBannerUrl,
  guildBannerAnimatedUrl,
  selectedChannelId,
  onOpenChannel,
  onOpenGuildMenu,
  onEditChannel,
  onEditCategory,
  onOpenSearch,
  onInvite,
  onOpenEvents,
}: Props) {
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<LoadState>('loading');
  const [channels, setChannels] = useState<ChannelSummaryDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState('');

  // react-hooks/set-state-in-effect — effect senkron setState çağırmaz, yalnız fetch başlatır.
  const fetchAll = useCallback(() => {
    Promise.all([channelsApi.listByGuild(guildId), categoriesApi.listByGuild(guildId)])
      .then(([channelList, categoryList]) => {
        // Sprint M4c §2 — metin + ses, tek liste, `position` sırasıyla (web pariteti: ayrı bölüm yok).
        const visibleChannels = channelList
          .filter((c) => c.type === ChannelType.GUILD_TEXT || c.type === ChannelType.GUILD_VOICE)
          .sort((a, b) => a.position - b.position);
        setChannels(visibleChannels);
        // Sprint M2a §5 — merkezi unread store'un İLK hydrate kaynağı. `ChannelRow` artık kendi
        // sayacını bu store'dan okuyor (canlı güncelleme için); bu satır olmazsa satır her zaman
        // sıfır görürdü (ilk render'da store boş).
        // Sprint M4c §2 — yalnız METİN alt kümesi verilir: ses kanalının mesajı yok, okunmamış
        // kavramı yok; ses satırını da hydrate etmek anlamsız bir sıfır kaydı eklerdi.
        useUnreadStore.getState().hydrateChannels(
          guildId,
          visibleChannels.filter((c) => c.type === ChannelType.GUILD_TEXT),
        );
        setCategories([...categoryList].sort((a, b) => a.position - b.position));
        setState('ready');
      })
      .catch((e) => {
        setErrorMessage(extractErrorMessage(e));
        setState('error');
      });
  }, [guildId]);

  // Odaklanmada tazele (mount'ta değil): kanal/kategori oluşturma ekranından geri dönüldüğünde
  // liste kendiliğinden güncellenir. Alternatif `key` ile remount etmekti, ama o collapse
  // tercihlerini de sıfırlardı. Bildirim sekmesindeki (M1d-0 R1-b) aynı ders.
  useFocusEffect(fetchAll);

  // Kayıtlı collapse tercihlerini oku. Hata SESSİZ: tercih okunamazsa kategoriler açık gelir,
  // bu güvenli varsayılan (kullanıcı kanallarını göremez duruma düşmez).
  useEffect(() => {
    let cancelled = false;
    if (categories.length === 0) return;
    const keys = categories.map((c) => collapseKey(guildId, c.id));
    AsyncStorage.multiGet(keys)
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        entries.forEach(([key, value], i) => {
          if (value === '1') next[categories[i].id] = true;
        });
        setCollapsed(next);
      })
      .catch(() => {
        // sessiz
      });
    return () => {
      cancelled = true;
    };
  }, [categories, guildId]);

  function toggleCategory(categoryId: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [categoryId]: !prev[categoryId] };
      // Yazma hatası sessiz yutulur — tercih kaydedilmezse yalnız bir sonraki açılışta açık gelir.
      void AsyncStorage.setItem(collapseKey(guildId, categoryId), next[categoryId] ? '1' : '0').catch(
        () => {},
      );
      return next;
    });
  }

  function retry() {
    setState('loading');
    fetchAll();
  }

  /**
   * Düz listeyi bölümlere böler: **kategorisizler en üstte başlıksız**, sonra kategoriler kendi
   * sıralarında (web `ChannelPanel` okuması). Kapalı kategorinin kanalları listeye HİÇ girmez.
   * Kanalı olmayan kategori de gösterilir — yetkilinin az önce açtığı boş kategori kaybolmasın.
   */
  const rows = useMemo(() => {
    const out: (
      | { kind: 'category'; category: CategoryDto }
      | { kind: 'channel'; channel: ChannelSummaryDto }
    )[] = [];
    const byCategory = new Map<string, ChannelSummaryDto[]>();
    for (const c of channels) {
      const key = c.categoryId ?? UNCATEGORIZED;
      const list = byCategory.get(key);
      if (list) list.push(c);
      else byCategory.set(key, [c]);
    }
    for (const c of byCategory.get(UNCATEGORIZED) ?? []) out.push({ kind: 'channel', channel: c });
    for (const category of categories) {
      out.push({ kind: 'category', category });
      if (collapsed[category.id]) continue;
      for (const c of byCategory.get(category.id) ?? []) out.push({ kind: 'channel', channel: c });
    }
    return out;
  }, [channels, categories, collapsed]);

  const bannerSrc = animatedOrStatic(guildBannerUrl, guildBannerAnimatedUrl, reduceMotion);

  return (
    <View style={styles.flex}>
      {/* §10.3 — afiş varsa gösterilir. Yükleme yüzeyi YOK (web/masaüstüne mahsus). */}
      {bannerSrc ? <Image source={{ uri: bannerSrc }} style={styles.banner} /> : null}

      {/* §10.2 — ada dokun, alt panel açılsın. Chevron bunun tıklanabilir olduğunu söyler;
          A yarısındaki tekil davet ikonu kaldırıldı, aksiyonlar panele taşındı. */}
      <Pressable onPress={onOpenGuildMenu} style={styles.headerRow} accessibilityRole="button">
        <Text style={styles.header} numberOfLines={1}>
          {guildName}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
      </Pressable>

      {/* Sprint M1g §2.1 — ortam adının ALTINDA aksiyon şeridi: geniş arama alanı + davet + takvim.
          Discord'un yerleşimi (sahip ekran görüntüsü), içerik bizim sahip olduklarımız kadar.
          Takvim düğmesi M1j'de eklendi (M1g'de yeri ayrılmıştı, düğmesi bilinçli konmamıştı —
          arkasında özellik yokken dokununca hiçbir şey yapmayacaktı). Etkinlik listesi izne bağlı
          değil: herkes görür, yalnız oluşturma `MANAGE_EVENTS` ister.
          Arama gerçek bir alan değil, düğme: dokununca tam ekran arama açılır (mobilde dar şeritte
          klavye + sonuç listesi sığmaz). */}
      <View style={styles.actionStrip}>
        <Pressable
          onPress={onOpenSearch}
          style={styles.searchButton}
          accessibilityRole="button"
          accessibilityLabel={t('guildSearch.title')}
        >
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.searchLabel}>{t('common.search')}</Text>
        </Pressable>
        <Pressable
          onPress={onInvite}
          style={styles.stripIcon}
          accessibilityRole="button"
          accessibilityLabel={t('channel.invite')}
        >
          <Ionicons name="person-add-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={onOpenEvents}
          style={styles.stripIcon}
          accessibilityRole="button"
          accessibilityLabel={t('event.sidebarLabel')}
        >
          <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {state === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent500} />
        </View>
      )}

      {state === 'error' && (
        <View style={styles.center}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable onPress={retry} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && rows.length === 0 && (
        <View style={styles.center}>
          <Text style={styles.empty}>{t('channel.noChannels')}</Text>
        </View>
      )}

      {state === 'ready' && rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(item) =>
            item.kind === 'category' ? `cat-${item.category.id}` : item.channel.id
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            if (item.kind === 'category') {
              return (
                <CategorySection
                  name={item.category.name}
                  collapsed={!!collapsed[item.category.id]}
                  onToggle={() => toggleCategory(item.category.id)}
                  // Sprint M2a §4.5 — artık HER üyeye açık (panel "Okundu İşaretle" taşıyor);
                  // düzenleme/kanal oluşturma maddeleri panelin İÇİNDE `canManage`'e koşullu.
                  onLongPress={() => onEditCategory(item.category)}
                />
              );
            }
            const channel = item.channel;
            return (
              <ChannelRow
                channel={channel}
                selected={channel.id === selectedChannelId}
                onPress={() => onOpenChannel(channel)}
                // Sprint M2a §4.5 — artık HER üyeye açık, bkz. yukarı.
                onLongPress={() => onEditChannel(channel)}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgSidebar,
  },
  // Sahip revizesi 2026-07-31 — afiş sıkışık görünüyordu: yükseklik 88 → 132, ve sol üst köşeye
  // yarıçap (Discord'daki gibi; sağ üst köşe panelin kendi kenarı olduğu için düz kalır).
  banner: {
    width: '100%',
    height: 132,
    borderTopLeftRadius: theme.radius.lg,
  },
  // Ok, ortam adının HEMEN yanında (sahip revizesi): başlık `flex: 1` iken ok panelin en sağına
  // itiliyordu ve adla ilişkisiz görünüyordu. Artık ad kendi genişliğini alır, ok peşinden gelir.
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 10,
  },
  actionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 10,
  },
  // Arama GENİŞ, aksiyonlar dar: en sık yapılan iş en büyük dokunma hedefini alır.
  searchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  searchLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  stripIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgElevated,
  },
  header: {
    flexShrink: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.panelGap,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },
  // Sözleşme §8.1-A/1 — kanal satırı: 40dp dokunma hedefi + 2dp ritim boşluğu, ayırıcı çizgi YOK
  // (Discord da ritim+dolgu ile ayırır).
});
