import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationsStore } from '@/stores/notifications';
import { useTotalPing } from '@/stores/unread';
import { badgeLabel } from '@/utils/badgeLabel';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sprint M1a contract §2 — alt tab çubuğu (3): Ana Sayfa · Bildirimler · Sen. Her ekran kendi
// başlığını/gezinmesini yönetir (headerShown false) — rail+sidebar'ın kendi başlığı yok, mesaj
// isteği/dm/kanal ekranları (app)/_layout.tsx'in Stack'inde AYRI TAM EKRAN açılır (contract §2).
export default function TabsLayout() {
  const refreshUnreadCount = useNotificationsStore((s) => s.refreshUnreadCount);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  // Sprint M2a §4.3 — Ana Sayfa sekmesi rozeti: toplam ping (Σ ortam bahsetmeleri + okunmamış
  // DM/grup DM adedi). Bildirimler sekmesinin rozeti (`unreadCount`, yukarıda) AYRI bir sayı
  // (mention + kanka isteği + davet, `GET /notifications/unread-count`'tan) — bilinçli olarak
  // birleştirilmedi (§4.3 son satır).
  const totalPing = useTotalPing();

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent500,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.bgSidebar, borderTopColor: theme.colors.borderSubtle },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('mobile.tabs.home'),
          tabBarBadge: totalPing > 0 ? badgeLabel(totalPing) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notification.title'),
          tabBarBadge: unreadCount > 0 ? badgeLabel(unreadCount) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'notifications' : 'notifications-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t('mobile.tabs.me'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
