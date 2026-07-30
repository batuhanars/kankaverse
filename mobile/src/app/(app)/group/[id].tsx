import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useDmStore } from '@/stores/dm';
import { useFriendsStore } from '@/stores/friends';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ProfileCardModal } from '@/components/ProfileCardModal';
import { extractErrorMessage } from '@/api/errors';
import type { DmParticipantDto } from '@/api/dm';
import { channelTitle } from '@/utils/channelTitle';
import { t } from '@/i18n';
import { theme } from '@/theme';

// Sözleşme §3.3 — Grup DM yönetimi: ad değiştir · üye ekle · üye çıkar · ayrıl · grubu sil.
// Yetki tablosu (§2, dosyadan doğrulandı — `dm.controller.ts`): ekle+ayrıl HER üye; çıkar/adlandır/sil
// YALNIZ `ownerId`. Yetkisiz işlem burada HİÇ RENDER EDİLMEZ (disabled değil — 403 yiyen buton yok).
// Grup verisi ayrı bir uçtan çekilmiyor — zaten `useDmStore` kanal listesinde var (DM ekranından
// buraya geçildiğinde liste doludur); sıfır ek REST çağrısı.
export default function GroupManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const channel = useDmStore((s) => s.channels.find((c) => c.id === id));
  const friends = useFriendsStore((s) => s.friends);
  const fetchFriends = useFriendsStore((s) => s.fetchAll);
  const addGroupMember = useDmStore((s) => s.addGroupMember);
  const removeGroupMember = useDmStore((s) => s.removeGroupMember);
  const leaveGroup = useDmStore((s) => s.leaveGroup);
  const deleteGroup = useDmStore((s) => s.deleteGroup);
  const renameGroup = useDmStore((s) => s.renameGroup);

  const [removeTarget, setRemoveTarget] = useState<DmParticipantDto | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // Sahip bulgusu 2026-07-30: grup üyesine dokunup profil kartını (engelle/kankalıktan çıkar) açmanın
  // yolu yoktu — 1-1 DM'de başlıktan açılıyor, grupta hiçbir yerden. Üye satırı artık kartı açıyor.
  const [profileTarget, setProfileTarget] = useState<DmParticipantDto | null>(null);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  if (!id || !channel || channel.type !== 'GROUP_DM') {
    // Kanal store'da yoksa (doğrudan derin linkle açılmış olabilir) — boş yüzey açmak yerine
    // yalnız başlık gösterilir; bu route her zaman DM ekranından, kanal zaten yüklüyken açılır.
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: t('group.noName') }} />
      </View>
    );
  }

  const isOwner = authUser?.id === channel.ownerId;
  const sortedMembers = [...channel.members].sort((a, b) => {
    if (a.id === channel.ownerId) return -1;
    if (b.id === channel.ownerId) return 1;
    return 0;
  });
  const addableFriends = friends.filter((f) => !channel.members.find((m) => m.id === f.user.id));

  async function onRemoveMember() {
    if (!removeTarget) return;
    setBusy(true);
    setActionError('');
    try {
      await removeGroupMember(channel!.id, removeTarget.id);
      setRemoveTarget(null);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAddMember(userId: string) {
    setBusy(true);
    setActionError('');
    try {
      await addGroupMember(channel!.id, userId);
      setShowAddMember(false);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    setBusy(true);
    setActionError('');
    try {
      await leaveGroup(channel!.id);
      router.replace('/home');
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function onDelete() {
    setBusy(true);
    setActionError('');
    try {
      await deleteGroup(channel!.id);
      router.replace('/home');
    } catch (e) {
      setActionError(extractErrorMessage(e));
      setBusy(false);
    }
  }

  async function onRename() {
    const name = renameValue.trim();
    if (!name) return;
    setBusy(true);
    setActionError('');
    try {
      await renameGroup(channel!.id, name);
      setShowRename(false);
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: channelTitle(channel) }} />

      <Text style={styles.sectionLabel}>{t('group.members')}</Text>
      <FlatList
        data={sortedMembers}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          // Kendi satırım kartı açmaz (kendimi engelleyemem/çıkaramam) — dokunulabilirlik de verilmez.
          <Pressable
            onPress={() => item.id !== authUser?.id && setProfileTarget(item)}
            disabled={item.id === authUser?.id}
            style={styles.memberRow}
          >
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.memberName} numberOfLines={1}>
              {item.username}
            </Text>
            {item.id === channel.ownerId ? (
              <Text style={styles.ownerBadge}>👑</Text>
            ) : isOwner ? (
              <Pressable
                onPress={() => setRemoveTarget(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('group.removeMember')}
              >
                <Text style={styles.removeIcon}>✕</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.actions}>
        <Pressable onPress={() => setShowAddMember(true)} style={styles.actionRow}>
          <Text style={styles.actionText}>+ {t('group.addMember')}</Text>
        </Pressable>
        {/* Yetki tablosu §2 — adlandır/sil YALNIZ ownerId; üye değilse bu satırlar HİÇ render edilmez. */}
        {isOwner && (
          <Pressable
            onPress={() => {
              setRenameValue(channel.name ?? '');
              setShowRename(true);
            }}
            style={styles.actionRow}
          >
            <Text style={styles.actionText}>{t('group.renameGroup')}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setConfirmLeave(true)} style={styles.actionRow}>
          <Text style={styles.actionTextDanger}>{t('group.leaveGroup')}</Text>
        </Pressable>
        {isOwner && (
          <Pressable onPress={() => setConfirmDelete(true)} style={styles.actionRow}>
            <Text style={styles.actionTextDanger}>{t('group.deleteGroup')}</Text>
          </Pressable>
        )}
      </View>

      {profileTarget && (
        <ProfileCardModal
          userId={profileTarget.id}
          username={profileTarget.username}
          avatarUrl={profileTarget.avatarUrl}
          onClose={() => setProfileTarget(null)}
          // Engelleme/kankalıktan çıkarma sonrası kanal listesi tazelenir (üye adı/durumu güncel kalsın).
          onChanged={() => useDmStore.getState().fetchAll()}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          message={t('group.removeMemberConfirm', { username: removeTarget.username })}
          confirmLabel={t('group.removeMemberAction')}
          loading={busy}
          onConfirm={onRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          message={t('group.leaveConfirm')}
          confirmLabel={t('group.leaveAction')}
          loading={busy}
          onConfirm={onLeave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={t('group.deleteConfirm')}
          confirmLabel={t('group.deleteAction')}
          loading={busy}
          onConfirm={onDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {showAddMember && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowAddMember(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShowAddMember(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t('group.addMemberTitle')}</Text>
              {addableFriends.length === 0 ? (
                <Text style={styles.empty}>{t('group.noFriends')}</Text>
              ) : (
                <FlatList
                  data={addableFriends}
                  keyExtractor={(f) => f.user.id}
                  renderItem={({ item }) => (
                    <Pressable disabled={busy} onPress={() => onAddMember(item.user.id)} style={styles.memberRow}>
                      {item.user.avatarUrl ? (
                        <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarFallbackText}>{item.user.username.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={styles.memberName} numberOfLines={1}>
                        {item.user.username}
                      </Text>
                    </Pressable>
                  )}
                />
              )}
              <Pressable onPress={() => setShowAddMember(false)} style={styles.sheetCloseButton}>
                <Text style={styles.sheetCloseText}>{t('common.close')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {showRename && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowRename(false)}>
          {/* Klavye (sözleşme §8.2/1 sınıfı, sahip turu 2026-07-30): alt-sayfa `flex-end` ile alta
              yapışık, klavye açılınca giriş + butonlar klavyenin ALTINDA kalıyordu. Android'de de
              `behavior="padding"` — edge-to-edge'de pencere küçülmüyor, sarmalayıcı olmadan hiçbir
              şey kaymaz. Üye ekleme sayfasında metin girişi yok, oraya gerekmiyor. */}
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            <Pressable style={styles.backdrop} onPress={() => setShowRename(false)}>
              <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>{t('group.renameTitle')}</Text>
              <TextInput
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder={t('group.renamePlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                maxLength={50}
                style={styles.renameInput}
                autoFocus
              />
              <View style={styles.renameActions}>
                <Pressable onPress={() => setShowRename(false)} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  disabled={busy || !renameValue.trim()}
                  onPress={onRename}
                  style={[styles.saveButton, (busy || !renameValue.trim()) && styles.disabled]}
                >
                  {busy ? (
                    <ActivityIndicator color={theme.colors.textPrimary} />
                  ) : (
                    <Text style={styles.saveText}>{t('group.renameAction')}</Text>
                  )}
                </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.bgContent,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 14,
    paddingBottom: 6,
  },
  list: {
    paddingHorizontal: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarFallback: {
    backgroundColor: theme.colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
  },
  ownerBadge: {
    fontSize: theme.fontSize.base,
  },
  removeIcon: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 6,
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingVertical: 6,
  },
  actionRow: {
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 12,
  },
  actionText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  actionTextDanger: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.base,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.bgOverlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgElevated,
    padding: theme.layout.panelGap,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    marginBottom: 10,
  },
  sheetCloseButton: {
    marginTop: 10,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  empty: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: 12,
  },
  renameInput: {
    minHeight: theme.layout.inputMinHeight,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgContent,
    color: theme.colors.textPrimary,
    paddingHorizontal: 14,
    fontSize: theme.fontSize.base,
    marginBottom: theme.layout.panelGap,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgSidebar,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  saveButton: {
    minHeight: theme.layout.controlSm,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  saveText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
