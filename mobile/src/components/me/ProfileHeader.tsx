import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { UserCardDto } from '@/api/users';
import { bannerColors } from '@/utils/bannerColor';
import { animatedOrStatic, useReduceMotion } from '@/utils/animatedMedia';
import { ImageViewer } from '../ImageViewer';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * "Sen" sekmesinin profil başlığı (M1d-C §3.1): afiş · avatar · kullanıcı adı · biyografi ·
 * üyelik tarihi.
 *
 * Veri `GET /users/:id/card`'dan **kendi id'mle** gelir — sunucuda ayrı bir "benim profilim" ucu
 * yok, uydurulmadı (kendi id'mde `friendStatus: 'self'` dönüyor).
 *
 * 🔴 Afiş: görsel varsa o, yoksa `bannerColor`, o da yoksa nötr zemin. **Boş bir afiş kutusu
 * "yükle" davetiyesi gibi durmasın diye** yükleme girişi buraya KONMADI; düzenleme ekranında.
 *
 * KONMAYANLAR (Discord'da var, bizde yok): durum/"Durum Ekle" (sistem desteklemiyor) · rozetler ·
 * sunucu profilleri sekmesi.
 */
interface Props {
  username: string;
  avatarUrl: string | null;
  card: UserCardDto | null;
  /**
   * Sprint M3b §3.2 — avatarın afişten ayrılmasını sağlayan halkanın rengi. Avatar afişin üstüne
   * bindiği için bu halka ARKA PLANLA aynı olmak zorunda; varsayılan "Sen" sekmesinin zemini
   * (`bgContent`). Profil alt-paneli farklı bir yüzeyde (`bgSidebar`) duruyor → bileşen fork
   * EDİLMEDİ, tek prop genişletildi (§2.1 deseni: "farklı davranıyorsa prop'u genişlet").
   */
  surfaceColor?: string;
  /**
   * Sprint M3b R3 §3.2.1 — biyografi + üyelik tarihi bu bileşende mi çizilsin. "Sen" sekmesinde
   * EVET (varsayılan, davranış değişmedi). Profil alt-panelinde HAYIR: orada ikisi de **başlıklı
   * bölüm** olarak (HAKKIMDA / Üyelik tarihi) kayan gövdede çiziliyor ve aralarına ikon şeridi
   * giriyor. Bileşen fork edilmedi; afiş+avatar bindirmesinin iki cihaz kusuru düzeltmesi tek
   * yerde kalsın diye tek bayrakla ayrıldı.
   */
  showDetails?: boolean;
  /** C39 §3: avatara dokununca tam ekran görüntüleyici açılır (avatar yoksa dokunulmaz). İndir düğmesi yok. */
  enlargeAvatar?: boolean;
}

/** Kök CLAUDE.md — TR tarih biçimi "25 Ekim 2023". */
function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ProfileHeader({ username, avatarUrl, card, surfaceColor, showDetails = true, enlargeAvatar = false }: Props) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  // 🔴 `bannerColor` bir CSS rengi DEĞİL, preset anahtarı ('blue', 'cream'…). Önce düz
  // `backgroundColor` olarak veriliyordu; 'blue' gibi bazı anahtarlar CSS renk adına denk geldiği
  // için kısmen çalışıyor, 'cream'/'dark' gibi olanlar hiç çalışmıyordu. Artık web'le aynı
  // gradient eşlemesinden geçiyor.
  const [from, to] = bannerColors(card?.bannerColor);
  // C13: hareketli adres varsa o (kart DTO'sundan), "animasyonları azalt" açıksa statik.
  const reduceMotion = useReduceMotion();
  const bannerSrc = animatedOrStatic(card?.bannerUrl, card?.bannerAnimatedUrl, reduceMotion);
  const avatarSrc = animatedOrStatic(avatarUrl, card?.avatarAnimatedUrl, reduceMotion);

  return (
    <View>
      {/* 🔴 Avatar afişin üstüne binerken NEGATİF KENAR BOŞLUĞU kullanılmıyor (sahip bulgusu
          2026-08-01): negatif boşlukla avatarın üst kısmı ebeveyninin DIŞINA taşıyordu ve Android
          taşan bölgeyi kırpıp altındaki afişi gösteriyordu — avatarın içinden afiş görünüyordu.
          Doğru çözüm bindirmeyi taşma olmadan kurmak: kapsayıcı afiş + taşma payı kadar YÜKSEK,
          avatar onun İÇİNDE mutlak konumlu. Böylece hiçbir şey ebeveyn sınırını aşmıyor. */}
      <View style={styles.header}>
        {bannerSrc ? (
          <Image source={{ uri: bannerSrc }} style={styles.banner} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner} />
        )}

        {avatarSrc ? (
          <Pressable
            onPress={() => setAvatarOpen(true)}
            disabled={!enlargeAvatar}
            accessibilityRole={enlargeAvatar ? 'button' : undefined}
            accessibilityLabel={enlargeAvatar ? t('profile.enlargeAvatar') : undefined}
            style={styles.avatarSlot}
          >
            <Image source={{ uri: avatarSrc }} style={[styles.avatarImage, !!surfaceColor && { borderColor: surfaceColor }]} />
          </Pressable>
        ) : (
          // 🔴 Yedek avatar İKİ KATMAN (sahip bulgusu 2026-08-01): `accentSubtle` bir token ama
          // YARI SAYDAM (`rgba(255,107,61,0.12)`). Tek katman kullanılınca arkasındaki afiş
          // avatarın içinden görünüyordu — üst yarıda afiş, alt yarıda sayfa zemini.
          // Uygulamanın başka yerlerinde fark edilmiyor çünkü orada arka plan zaten düz koyu.
          // Çözüm rengi elle karıştırmak DEĞİL (uydurma renk token dışıdır): altta opak zemin,
          // üstünde aynı saydam vurgu → başka yerlerdeki görünümün aynısı, ama afişi geçirmiyor.
          <View style={[styles.avatar, styles.avatarFallback, !!surfaceColor && { borderColor: surfaceColor }]}>
            <View style={styles.avatarTint} />
            <Text style={styles.avatarFallbackText}>{username.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>

      {enlargeAvatar ? (
        <ImageViewer visible={avatarOpen} url={avatarSrc} onClose={() => setAvatarOpen(false)} />
      ) : null}

      <View style={styles.body}>
        <Text style={styles.username}>{username}</Text>

        {showDetails && card?.bio ? <Text style={styles.bio}>{card.bio}</Text> : null}

        {showDetails && card?.memberSince ? (
          <Text style={styles.memberSince}>
            {/* `settings.banner.previewMemberSince` web'de zaten "Üyelik tarihi: {date}" — yeni
                anahtar açılmadı. (`profile.memberSince` yalnız etiket, tarih taşımıyor.) */}
            {t('settings.banner.previewMemberSince', { date: formatMemberSince(card.memberSince) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const BANNER_H = 120;
const AVATAR = 76;
/** Avatarın afişin üstüne binen kısmı. Kapsayıcı yüksekliği bu paya göre hesaplanır. */
const OVERLAP = 36;

const styles = StyleSheet.create({
  header: {
    // Afiş + avatarın afişin ALTINDA kalan kısmı → avatar kapsayıcıyı asla aşmaz.
    height: BANNER_H + (AVATAR - OVERLAP),
  },
  banner: {
    height: BANNER_H,
    width: '100%',
  },
  body: {
    paddingHorizontal: theme.layout.panelGap * 1.5,
    paddingTop: 8,
  },
  avatar: {
    position: 'absolute',
    left: theme.layout.panelGap * 1.5,
    top: BANNER_H - OVERLAP,
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: theme.colors.bgContent,
  },
  // Dokunma alanı + konum; görsel dairenin kendisi (kenarlık/yuvarlak) avatarImage'da.
  avatarSlot: {
    position: 'absolute',
    left: theme.layout.panelGap * 1.5,
    top: BANNER_H - OVERLAP,
    width: AVATAR,
    height: AVATAR,
  },
  avatarImage: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 4,
    borderColor: theme.colors.bgContent,
  },
  avatarFallback: {
    // Opak taban — arkasındaki afişi geçirmesin.
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.accentSubtle,
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: 28,
    fontWeight: '700',
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  bio: {
    color: theme.colors.textBody,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    marginTop: 6,
  },
  memberSince: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 8,
  },
});
