import { View, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { PinnedMessagesList } from '@/components/guild/PinnedMessagesList';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1h — **Sabitlenen Mesajlar** (kanal başına).
 *
 * DM · grup DM · ortam kanalı — üçü de aynı uca bağlı (`GET /channels/:id/pins`), bu yüzden tek
 * ekran üçüne birden hizmet ediyor; kanal türüne göre ayrı ekran yok.
 *
 * Sprint M2c — liste gövdesi `PinnedMessagesList`e çıkarıldı (contract §4.3: kanal detay ekranının
 * "Sabitlemeler" sekmesi AYNI bileşeni kullanıyor). Bu dosyada yalnız rota kabuğu kaldı: başlık +
 * `origin`a göre doğru ekrana dönen navigasyon kararı.
 */
export default function PinsScreen() {
  const router = useRouter();
  /**
   * `origin` — sabitlenene dokununca hangi rotaya dönüleceği. DM mesajını kanal rotasında açmak
   * boş ekran demek olurdu; kanal türünü sunucudan yeniden sormaktansa çağıran ekran söylüyor.
   */
  const params = useLocalSearchParams<{ channelId: string; name?: string; origin?: 'dm' }>();
  const channelId = params.channelId;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: t('message.pinnedMessages') }} />

      <PinnedMessagesList
        channelId={channelId}
        onOpenMessage={(item) =>
          router.push(
            params.origin === 'dm'
              ? {
                  pathname: '/dm/[id]',
                  params: { id: item.channelId, title: params.name ?? '', jumpTo: item.id },
                }
              : {
                  pathname: '/channel/[id]',
                  params: { id: item.channelId, name: params.name ?? '', jumpTo: item.id },
                },
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bgContent },
});
