import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usersApi, type UserCardDto } from '@/api/users';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { useReportStore } from '@/stores/report';
import { extractErrorMessage } from '@/api/errors';
import { dmRouteParams } from '@/utils/dmRoute';
import { ConfirmDialog } from '../ConfirmDialog';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { ProfileActionStrip, type ProfileStripAction } from './ProfileActionStrip';
import { MORE_HIT, MORE_INSET, ProfileMoreMenu } from './ProfileMoreMenu';
import { ProfileSheetBody } from './ProfileSheetBody';
import { t } from '@/i18n';
import { theme } from '@/theme';

interface Props {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** Ortam bağlamı — verilirse sunucu rol rozetlerini doldurur (§3.2 "Roller"). */
  guildId?: string;
  onClose: () => void;
  /** Engelle/arkadaşlıktan-çıkar/engel-kaldır başarıyla bittiğinde çağırır — çağıran ekran
   *  `canMessage`/`selfBlocked` durumunu tazeler. */
  onChanged?: () => void;
  /** D95 — verilirse şeritte "Bahset" çizilir (yalnız yazma kutusu olan çok kişili sohbetten açılınca). */
  onMention?: () => void;
}

/**
 * 🔴 Aynı anda YALNIZ BİR modal görünür (sözleşme §3.3 "katman tuzağı", `DmMenuHost`/`DmMoreHost`
 * deseni): ⋯ paneli açılırken profil paneli kapanır, onay diyalogu açılırken ikisi de kapanır.
 * Üst üste binen karartılmış perde yok.
 */
type Layer = 'profile' | 'more' | 'confirmBlock' | 'confirmRemove';

/**
 * Sprint M3b §3 — **profil alt-paneli**. `ProfileCardModal`ın yerini alır: aynı veri, aynı
 * aksiyonlar, Discord'a hizalı yerleşim.
 *
 * Giriş noktaları (§3.1): mesaj yazarı (kanal ve DM) · kankalar listesi · DM detay Üyeler sekmesi ·
 * 1-1 DM detay başlığı. Dördünde de aynı bileşen, aynı davranış. Ortam üye listesi DEĞİŞMEDİ.
 *
 * **R3 yerleşimi (§3.2.1, sahip görsel karşılaştırması):**
 * - Panel **KAYAR**, sığdırmaz: ekranın ~%90'ı, içerik uzunsa kaydırılır, hiçbir bölüm kırpılmaz.
 *   (İlk uygulama her şeyi sığdırmaya çalışıyordu; ortak ortamlar listesi dipte kesiliyordu.)
 * - Afişin **sağ üstünde ⋯**; yıkıcı aksiyonlar orada.
 * - Kimlik kartında **ikon şeridi**: Mesaj · Kanka Ekle. Alttaki tam genişlikte kırmızı kutular gitti.
 *
 * 🔴 **Aksiyonlar bire bir korundu** — Mesaj · Kanka Ekle · Arkadaşlıktan Çıkar · Engelle ·
 * Engeli Kaldır. Yalnız YERLERİ değişti. Engellemenin kaybolması M1d-0 sprintini açtırmıştı.
 * Sesli/Görüntülü Arama YOK (M4) — şeritte yer var, düğme çizilmedi.
 *
 * 🔴 Mutasyonlar `useFriendsStore` üzerinden gider (M1d-0 dersi: doğrudan API çağrısı store'un
 * DM bayrak tazeleme yan etkisini atlıyordu).
 *
 * T&S (§3.4): minör statüsü sızmaz · ret metinleri jenerik · `selfBlocked` yalnız "ben engelledim" ·
 * kart yüklenemezse jenerik hata (varlık bilgisi verilmez).
 */
export function ProfileSheet({ userId, username, avatarUrl, guildId, onClose, onChanged, onMention }: Props) {
  const router = useRouter();
  const bottomInset = useSheetInsets();

  const [card, setCard] = useState<UserCardDto | null>(null);
  const [loadError, setLoadError] = useState('');
  const [layer, setLayer] = useState<Layer>('profile');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    usersApi
      .getCard(userId, guildId)
      .then((c) => {
        if (!cancelled) setCard(c);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(extractErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, guildId]);

  async function doBlock() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().block(userId);
      onChanged?.();
      onClose();
    } catch (e) {
      // Hata profil paneline döner: onay diyalogunun hata yüzeyi yok, orada bırakılsa kullanıcı
      // neden olmadığını hiç göremezdi (`DmMoreHost`ta aynı karar).
      setLayer('profile');
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function doRemoveFriend() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().removeFriend(userId);
      onChanged?.();
      onClose();
    } catch (e) {
      setLayer('profile');
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function doSendRequest() {
    setBusy(true);
    setActionError('');
    try {
      await useFriendsStore.getState().sendRequestByUser(userId);
      setRequestSent(true);
    } catch {
      // Jenerik: sunucunun ret sebebi GÖSTERİLMEZ. USER_NOT_FOUND "yok / blok / minör / ortak alan
      // yok" ayrımını zaten silmiş durumda; istemci de tahmin etmez.
      setActionError(t('friends.addFailed'));
    } finally {
      setBusy(false);
    }
  }

  /** Engel kaldırma onaysız (web ile aynı) — ⋯ menüsünden profil paneline dönülür, panel açık kalır. */
  async function doUnblock() {
    setBusy(true);
    setActionError('');
    setLayer('profile');
    try {
      await useFriendsStore.getState().unblock(userId);
      onChanged?.();
      setCard((c) => (c ? { ...c, selfBlocked: false } : c));
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** "Mesaj" — kanal zaten varsa sunucu MEVCUT olanı döner (kopya açmaz, bkz. `dmApi.createChannel`).
   *  Kapı `canMessage` (sunucudaki `canDm`) — istemci burada kendi kararını vermiyor. */
  async function doMessage() {
    setBusy(true);
    setActionError('');
    try {
      const channel = await useDmStore.getState().createChannel(userId);
      onClose();
      router.push(dmRouteParams(channel));
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  const isSelf = card?.friendStatus === 'self';

  // Kanka Ekle: yalnız `none`. `pending_in` (karşı taraf istek atmış) için düğme yok — kabul akışı
  // istekler ekranında, burada ikinci bir kabul yüzeyi uydurulmaz. Engelliyken de gösterilmez;
  // ret zaten jenerik, sebep sızdırılmaz.
  const showAddFriend =
    !!card && !isSelf && !card.selfBlocked && card.friendStatus === 'none' && !requestSent;
  const showPending = !!card && !isSelf && (requestSent || card.friendStatus === 'pending_out');

  // Şerit içeriği: iki elemanlık bir dizi, her render'da yeniden kuruluyor (memo'ya değmez ve
  // memo bayat closure riski getirirdi). Boşsa `ProfileActionStrip` hiç çizmiyor.
  // 🔴 M4: Sesli Arama + Görüntülü Arama bu diziye iki eleman olarak eklenecek; şerit `flex: 1`
  // ile alanı öğe sayısına göre böldüğü için yerleşim yeniden tasarlanmayacak (§3.2.1 şartı).
  const stripActions: ProfileStripAction[] = [];
  if (card && !isSelf && card.canMessage) {
    stripActions.push({
      key: 'message',
      icon: 'chatbubble-outline',
      label: t('profile.message'),
      onPress: doMessage,
    });
  }
  if (onMention && card && !isSelf && !card.selfBlocked) {
    stripActions.push({
      key: 'mention',
      icon: 'at-outline',
      label: t('profile.mention'),
      onPress: () => {
        onClose();
        onMention();
      },
    });
  }
  if (showAddFriend) {
    stripActions.push({
      key: 'add',
      icon: 'person-add-outline',
      label: t('friends.add'),
      onPress: doSendRequest,
    });
  }

  // 🔴 **T&S kemeri (§3.3):** ⋯, üç yıkıcı aksiyondan HERHANGİ BİRİ mümkünse HER ZAMAN çizilir.
  // Koşullu gizleme / sığdırma / kaydırma ardına saklama yok — engelleme bu menüye girdiği için
  // menünün kapısı kaybolursa M1d-0 tekrar eder. Üçü ayrı ayrı yazıldı ki denetlenebilsin.
  const canRemoveFriend = !!card && !isSelf && card.friendStatus === 'friends';
  const canBlock = !!card && !isSelf && !card.selfBlocked;
  const canUnblock = !!card && !isSelf && card.selfBlocked;
  // E4 §4.1: şikâyet de aynı menüde (web kullanıcı kartı ⋯ menüsü karşılığı); kendi profilimde yok.
  const canReport = !!card && !isSelf;
  const showMore = canRemoveFriend || canBlock || canUnblock || canReport;

  // Onay diyalogu AYRI katman kalır (§3.3): açılırken profil paneli gizlenir. ⋯ menüsü ise artık
  // katman değil — panelin İÇİNDE çiziliyor, panel görünür kalıyor (R5).
  const confirming = layer === 'confirmBlock' || layer === 'confirmRemove';

  /**
   * 🔴 R5 — "en üstteki katmanı kapat". Menü açıkken hem Android geri tuşu hem panel DIŞINA
   * dokunuş yalnız menüyü kapatır, profil paneli açık kalır; menü kapalıyken ikisi de paneli
   * kapatır. Tek yerde: üç çağıran (geri tuşu · karartı · menünün kendi yakalayıcısı) aynı kararı
   * verir, biri unutulup davranış ayrışmaz.
   */
  function dismissTopLayer() {
    if (layer === 'more') setLayer('profile');
    else onClose();
  }

  return (
    <>
      <Modal
        transparent
        visible={!confirming}
        animationType="slide"
        // 🔴 R5 — Android geri tuşu dallanması: menü açıkken geri YALNIZ menüyü kapatır, profil
        // panelini değil. Tek `Modal` olduğu için sistem geri tuşu buraya düşüyor; dallanma
        // yapılmasaydı menü açıkken geri basmak paneli de kapatırdı.
        onRequestClose={dismissTopLayer}
      >
        <Pressable style={styles.backdrop} onPress={dismissTopLayer}>
          <Pressable
            style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
            onPress={() => {}}
          >
            <View style={styles.grabber} />

            {/* 🔴 Panel KAYAR (§3.2.1). Alt güvenli alan payı panelin `paddingBottom`unda
                (`sheetBottomPadding`) — üç tuşlu gezinme çubuğunda son bölüm tuşların arkasında
                kalmaz. Yükseklik `maxHeight: '90%'`: panel içerik kadar büyür, sınıra dayanınca
                `ScrollView` kaydırmayı devralır. Hiçbir listeye yükseklik sınırı verilmedi. */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollBody}
              showsVerticalScrollIndicator={false}
            >
              <ProfileSheetBody
                username={username}
                avatarUrl={avatarUrl}
                card={card}
                identityFooter={
                  <>
                    <ProfileActionStrip actions={stripActions} disabled={busy} />
                    {/* Gönderim sonrası düğme yerini bilgi metnine bırakır — sunucu durumu
                        değişti, sessizce kaybolması kullanıcıyı şüphede bırakırdı. */}
                    {showPending ? <Text style={styles.pendingText}>{t('friends.requestSent')}</Text> : null}
                    {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
                  </>
                }
              />

              {!card && !loadError && (
                <ActivityIndicator color={theme.colors.accent500} style={styles.spinner} />
              )}
              {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
            </ScrollView>

            {/* ⋯ — afişin sağ üstünde. `ScrollView`in KARDEŞİ, içinde değil: kaydırınca kaybolmaz
                (T&S kemeri "kaydırma ardına saklama yok"). Arka plan bloğu yok, okunabilirlik
                gölgeyle (R4). */}
            {showMore && (
              <Pressable
                onPress={() => setLayer('more')}
                accessibilityRole="button"
                accessibilityLabel={t('userCard.moreActions')}
                style={styles.more}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={22}
                  color={theme.colors.textPrimary}
                  style={styles.moreIcon}
                />
              </Pressable>
            )}

            {/* 🔴 R5 — ⋯ menüsü artık AYRI BİR MODAL DEĞİL, panelin içinde ankrajlı bir menü:
                profil paneli görünür kalıyor. Kardeşlerin sonuncusu olduğu için ⋯'nin ve içeriğin
                ÜSTÜNDE çiziliyor (RN'de sonraki kardeş üstte). Kendi şeffaf yakalayıcısını da
                çiziyor — dışarı dokunuş yalnız menüyü kapatır. */}
            {layer === 'more' && (
              <ProfileMoreMenu
                canRemoveFriend={canRemoveFriend}
                canBlock={canBlock}
                canUnblock={canUnblock}
                canReport={canReport}
                onReport={() => {
                  // Profil paneli kapanır, sonra şikâyet paneli açılır (tek modal; web kartı da kapatır).
                  onClose();
                  useReportStore.getState().openReport({ targetType: 'USER', targetId: userId });
                }}
                onClose={() => setLayer('profile')}
                onRemoveFriend={() => setLayer('confirmRemove')}
                onBlock={() => setLayer('confirmBlock')}
                onUnblock={doUnblock}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {confirming && (
        <ConfirmDialog
          message={layer === 'confirmBlock' ? t('friends.confirmBlock') : t('friends.confirmRemove')}
          confirmLabel={layer === 'confirmBlock' ? t('friends.block') : t('friends.remove')}
          loading={busy}
          onConfirm={layer === 'confirmBlock' ? doBlock : doRemoveFriend}
          // Vazgeçince profil paneline dönülür (⋯ menüsüne değil): kullanıcı bir adım geri değil,
          // başladığı yere döner.
          onCancel={() => setLayer('profile')}
        />
      )}
    </>
  );
}

// ⋯ ölçüleri `ProfileMoreMenu`den geliyor: menü bu düğmenin tam altına ankrajlı, ikisi ayrı yerde
// yazılsaydı ilk değişiklikte hizadan çıkarlardı.

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    // Discord gibi ekranın büyük kısmı; üstte kalan şerit "bu bir panel" sinyalini korur.
    maxHeight: '90%',
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    // Afiş panelin üst köşelerinden taşmasın (afiş tam genişlikte ve köşesiz çiziliyor).
    overflow: 'hidden',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 8,
    zIndex: 1,
  },
  // `flexShrink` — panel `maxHeight`e dayandığında `ScrollView` küçülüp kaydırmayı devralır.
  // Sabit yükseklik verilmedi: kısa profilde panel içerik kadar, uzunda %90'da durur.
  scroll: {
    flexShrink: 1,
  },
  scrollBody: {
    paddingBottom: theme.layout.panelGap,
  },
  // 🔴 R4 — konum. `sheet`in üst/sağ dolgusu YOK (yalnız `paddingBottom` var), yani Yoga'nın
  // "mutlak çocuk ebeveynin DOLGU kenarından ölçülür" kuralı burada offset'i olduğu gibi bırakıyor;
  // R3'te `DmDetailsHeader`da ⋯'yi ortaya kaydıran tuzak bu panelde geçerli değil (orada ebeveynin
  // yatay dolgusu vardı). Değerler yine de tek yerden: `MORE_INSET`.
  //
  // Kutu 44×44 (dokunma hedefi alt sınırı) ama GÖRÜNEN ikon 22 → kutunun her yanında 11dp görünmez
  // pay var. Bu yüzden ikonun gerçek kenar boşluğu `MORE_INSET + 11 = 35dp`: üstten tutamaç
  // şeridinin ve afiş kenarının epey altında, sağdan da rahat. Sahip "üste yapışık" dediği hâlde
  // offset 16 idi (ikon kenarı 27dp), daire zemin de kutuyu daha da büyük gösteriyordu.
  more: {
    position: 'absolute',
    top: MORE_INSET,
    right: MORE_INSET,
    width: MORE_HIT,
    height: MORE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 🔴 R4 — arka plan dairesi KALKTI (sahip kararı: "3 nokta dümdüz dursun"). Dairenin tek işlevi
  // okunabilirlikti: afiş kullanıcının yüklediği görsel, beyaz/açık olabilir ve neredeyse beyaz olan
  // ikon (`textPrimary` #F4F1ED) o zeminde kaybolur. Yerine **blok değil gölge**: koyu, hafif
  // yayılmış bir halo ikonun kenarını her zeminde ayırır, düz görünümü bozmaz.
  // `Ionicons` altta `Text` çizdiği için `textShadow*` doğrudan geçerli (RN Android/iOS ikisinde de).
  moreIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  spinner: {
    marginTop: theme.layout.panelGap,
  },
  pendingText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    paddingTop: 10,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    paddingTop: 8,
  },
});
