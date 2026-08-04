import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  title: string;
  /**
   * 🔴 R2 §B — grup DM'de avatar/simge **hiç çizilmez** (sahip turu: kanal detayı gibi başlık-only).
   * 1-1 DM'de KALIR: profil paneline giden dokunma hedefi o (R1 §A) — kaldırılırsa engellemeye
   * giden yol yeniden kapanır.
   */
  showAvatar: boolean;
  avatarUrl: string | null;
  muted: boolean;
  /** 🔴 R2 §A — native header kalktı; ⋯ artık SABİT üst bloğun sağ üstünde (bkz. dosya başı notu). */
  onMore: () => void;
  /**
   * 🔴 M3b R1 §A — **yalnız 1-1 DM'de** dolu: avatar/ad dokunuşu profil alt-panelini açar.
   * Verilmezse (grup DM) kimlik bloğu dokunulamaz kalır; grupta profile giden yol zaten Üyeler
   * sekmesi, ikinci kapı gereksiz.
   */
  onPressIdentity?: () => void;
  /**
   * 🔴 M3b R1 §B — **yalnız grup DM'de** dolu. 1-1 DM'de mesaj arama sahip kararıyla KALDIRILDI
   * (2026-08-01, TASK.md 1428: "1-1'de karşında tek kişi var, konuşma doğrusal") — sohbet
   * ekranındaki `searchable={!isDm}` ile aynı kural, detay ekranı onu delmiyor.
   * Verilmezse düğme HİÇ render edilmez (devre dışı gösterilmez).
   */
  onSearch?: () => void;
  onMute: () => void;
}

/**
 * Sprint M3b §2.2 — DM detay ekranının başlık bölgesi: büyük daire avatar + ad + iki yuvarlak
 * aksiyon (Ara · Sustur).
 *
 * `ChannelDetailsHeader` BURADA yeniden kullanılmadı, kopyalanmadı da: o bileşen `ChannelSummaryDto`
 * alıyor, yaş rozeti çiziyor ve `canManage`e bağlı Ayarlar düğmesi taşıyor — üçü de DM'de yok, ikisi
 * de kavramsal olarak yok. Sözleşme §2.1: "ortak olan sekme gövdesi, ortak olmayan kabuk". Paylaşılan
 * tek şey ölçü/görsel dil (daire + alt etiket), o da tasarım sisteminden geliyor.
 *
 * 🔴 Adın altında **ikinci satır (kullanıcı adı) YOK** — Discord'da ad + username iki ayrı alan,
 * bizde `username` tek kimlik; aynı metni iki kere yazmak olurdu.
 * 🔴 **Sesli/Görüntülü Arama düğmesi YOK** → M4. Yer tutucu da konmadı.
 *
 * 🔴 **R1 §A — 1-1 DM'de kimlik bloğu profil panelini açar.** Sözleşmenin ilk hâli profile giden
 * tek yolu "mesaj yazarı" yapmıştı; karşı taraf hiç yazmadıysa **ya da sohbeti temizlediysen (G4)**
 * yazar satırı olmuyor ve **engelleme erişilemez hale geliyordu** — `DmMenuSheet`te engelleme yok,
 * yani başka kapı da kalmıyordu. M1d-0'ın aynı hatası; bu satır o deliği kapatıyor.
 *
 * 🔴 **R2 §A — native header kalktı** (sahip turu: içi boş şerit kötü duruyordu). İki sonucu var ve
 * ikisi de burada karşılanıyor:
 * 1. **⋯ buraya taşındı.** Bu blok SABİT (kayan sekme içeriğinin dışında, `dm-details.tsx`te
 *    `ScrollView`/`FlatList`in kardeşi) → içerik kayarken ⋯ altında kaybolmaz, üstüne de binmez.
 *    Mutlak konumlu ama **bu bloğun kendi kutusunun içinde**; kutu, kimliğin sağına 44dp yer
 *    bırakacak şekilde dolgulu, yani uzun adla çakışmaz.
 * 2. **Ad artık ekranın adı.** Native başlık gidince ekran okuyucuya isimsiz kalırdı → başlık
 *    `accessibilityRole="header"` ile işaretlendi.
 *
 * Geri oku BİLİNÇLİ olarak konmadı: Android'de sistem geri tuşu (üç tuşlu ve jest) evrensel; bu
 * ekran yalnız uygulama içinden açılıyor (push buraya yönlendirmiyor), yığının kökü olamıyor.
 * Yüzen bir geri düğmesi uydurma olurdu.
 */
export function DmDetailsHeader({
  title,
  showAvatar,
  avatarUrl,
  muted,
  onMore,
  onPressIdentity,
  onSearch,
  onMute,
}: Props) {
  return (
    <View style={styles.header}>
      {/* Kimlik bloğu tek dokunma hedefi (avatar + ad birlikte) — grup DM'de `onPressIdentity`
          verilmez, `disabled` ile dokunulamaz kalır. */}
      <Pressable
        onPress={onPressIdentity}
        disabled={!onPressIdentity}
        accessibilityRole={onPressIdentity ? 'button' : undefined}
        accessibilityLabel={onPressIdentity ? t('member.actions.profile') : undefined}
        style={styles.identity}
      >
        {showAvatar &&
          (avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{title.charAt(0).toUpperCase()}</Text>
            </View>
          ))}

        {/* Ekranın adı: native başlık kalktığı için ekran okuyucunun tek kaynağı bu satır. */}
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </Pressable>

      <Pressable
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={t('userCard.moreActions')}
        style={styles.more}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <View style={styles.actionRow}>
        {/* Ara YALNIZ grup DM'de (R1 §B). 1-1'de `onSearch` hiç verilmiyor → düğme render edilmez. */}
        {onSearch && (
          <Pressable style={styles.action} onPress={onSearch}>
            <View style={styles.actionCircle}>
              <Ionicons name="search" size={20} color={theme.colors.textPrimary} />
            </View>
            <Text style={styles.actionLabel}>{t('common.search')}</Text>
          </Pressable>
        )}

        <Pressable style={styles.action} onPress={onMute}>
          <View style={styles.actionCircle}>
            <Ionicons
              name={muted ? 'volume-high-outline' : 'volume-mute-outline'}
              size={20}
              color={theme.colors.textPrimary}
            />
          </View>
          <Text style={styles.actionLabel}>
            {muted ? t('mobile.notif.unmute') : t('mobile.channelDetails.muteAction')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const AVATAR = 80;
/** ⋯ dokunma hedefi — Android alt sınırı 44dp. */
const MORE_HIT = 44;

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  identity: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 10,
  },
  // ⋯ sabit bloğun sağ üstünde. Kutu 44×44 (Android dokunma hedefi alt sınırı) — `hitSlop` ile
  // küçültülmedi, native header'daki hitSlop'lu hâlinden daha rahat.
  //
  // 🔴 `top/right: 0` — Yoga'da mutlak konumlu çocuk ebeveynin **dolgu kenarından** ölçülür, yani
  // kutu zaten `panelGap` içeride başlıyor; buraya ayrıca boşluk EKLENMEZ (eklenirse ⋯ ekranın
  // ortasına doğru kayar).
  more: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: MORE_HIT,
    height: MORE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 30,
    fontWeight: '700',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    textAlign: 'center',
    // Uzun ad ⋯'nin altına GİRMESİN: metin iki yandan ⋯ kutusunun genişliği kadar içeride biter,
    // yani sağ sınırı tam ⋯ kutusunun başladığı yer. Ortalama bozulmaz (iki yana eşit dolgu).
    paddingHorizontal: MORE_HIT,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 4,
  },
  action: { alignItems: 'center', gap: 6 },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
});
