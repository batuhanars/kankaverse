import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTotalPing } from '@/stores/unread';
import { badgeLabel } from '@/utils/badgeLabel';
import { theme } from '@/theme';

/**
 * Sprint M2a §4.4 — sohbet ekranlarının (kanal · DM · grup DM) geri oku + toplam ping rozeti.
 * `channel/[id].tsx` ve `dm/[id].tsx`'te native geri ok GİZLENİR (`headerBackVisible: false`) ve
 * bu bileşen `headerLeft` olarak geçilir. Dokunuş davranışı DEĞİŞMEZ (yine geri gider); yalnız
 * görsel — sağ altta §4.3 ile AYNI toplam ping sayısı (`useTotalPing`).
 *
 * 🔴 Etkinlik formu (`event-form.tsx`) BİLİNÇLİ HARİÇ — o ekranın geri oku sihirbaz adımları
 * arasında gezinir (kendi `headerLeft`'i var), rozet taşımaz (sahip talebi, sözleşme §4.4).
 * 🔴 `group/[id].tsx` de HARİÇ — o ekran grup DM'nin sohbeti değil, YÖNETİM ekranı (üye listesi/ayrıl/
 * sil); asıl grup sohbeti `dm/[id].tsx`'te (`kind=group` param'ıyla) açılıyor, rozet oraya eklendi.
 */
export function ChatBackButton() {
  const router = useRouter();
  const totalPing = useTotalPing();

  return (
    // hitSlop büyütülmüş dokunma hedefini korur — kutunun kendisi KÜÇÜLDÜ (bkz. styles.wrap notu),
    // hitSlop görünmez olduğu için bu, sahip talebindeki "dokunma hedefini büyütmesi gerekmiyor,
    // sadece görsel" ile çelişmez (görsel kutu küçüldü, dokunma alanı aynı kaldı/büyüdü).
    <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" style={styles.wrap}>
      <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
      {totalPing > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel(totalPing)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Sahip cihaz testi bulgusu (M2a onayından sonra) — iki düzeltme:
  //
  // (1) Rozet kırpılıyordu: eski kutu 28×28'di ama ikon yalnız 22px, yani kutunun 3px'lik boş
  //     kenarı vardı; rozet o kenarın da DIŞINA (`right:-2, bottom:-2`) taşıyordu. Native başlık
  //     (native-stack → gerçek iOS/Android header chrome) `headerLeft` içeriğini kendi ölçtüğü
  //     kutuya kırpma eğiliminde — dıştaki 2px'lik taşma kırpılıyordu. Kutu artık İKONUN KENDİ
  //     ölçüsünde (22×22) ve rozet `right:0/bottom:0` ile bu kutunun TAMAMEN İÇİNDE — hiçbir piksel
  //     dışarı taşmıyor, kırpılacak bir şey kalmadı.
  // (2) Geri oku başlığa yapışıktı: react-native-screens native-stack'te `headerLeftContainerStyle`
  //     gibi bir seçenek YOK (paketin `native-stack/types.tsx`'i doğrulandı) — bu yüzden boşluk
  //     `headerLeft` bileşeninin KENDİ ölçülen genişliğine eklenir. `marginRight` (fixed width'e
  //     rağmen) kutunun dışına, ebeveynin ayırdığı alana ekleniyor; native header sonraki içeriği
  //     (başlık) bu genişletilmiş alana göre yerleştiriyor.
  wrap: {
    width: 22,
    height: 22,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: theme.colors.textPrimary,
    fontSize: 8,
    fontWeight: '700',
  },
});
