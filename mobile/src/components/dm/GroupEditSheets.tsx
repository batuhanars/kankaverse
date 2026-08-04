import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendDto } from '@/api/friends';
import { FriendPickerList } from '../FriendPickerList';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M3b §2.4 — grup DM'in ⋯ menüsünden açılan iki alt akışın **sunumu**: Üye Ekle seçicisi ve
 * Yeniden Adlandır kutusu. Akışın kendisi (istek, hata, kapanma) `DmMoreHost`ta — projedeki
 * Host/Sheet ayrımının aynısı (`DmMenuHost`/`DmMenuSheet`).
 *
 * İkisi tek dosyada: aynı yüzeyin iki hâli, aynı stilleri paylaşıyorlar ve yalnız `DmMoreHost`
 * kullanıyor (`MessageStates.tsx` ile aynı desen). Ayrı dosyalara bölmek stil bloğunu ikizlerdi.
 */

interface AddMemberProps {
  friends: FriendDto[];
  busyFriendId: string | null;
  errorMessage: string;
  onSelect: (userId: string) => void;
  onClose: () => void;
}

export function AddMemberSheet({ friends, busyFriendId, errorMessage, onSelect, onClose }: AddMemberProps) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{t('group.addMemberTitle')}</Text>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {/* Kanka seçici `FriendPickerList` (tekli mod) ile — Yeni Mesaj/Yeni Grup ekranlarıyla
              AYNI liste görünümü, Türkçe sıralama ve harf başlıkları dahil. Eski grup yönetim
              ekranının kendi düz listesi taşınmadı; taşısaydım üçüncü bir kopya olurdu.
              Arama kutusu yok (eklenebilir kanka listesi kısa; eskiden de yoktu) → `query` boş. */}
          <FriendPickerList
            friends={friends}
            query=""
            selection={{
              mode: 'single',
              busyId: busyFriendId,
              onSelect: (friend) => onSelect(friend.user.id),
            }}
            emptyComponent={<Text style={styles.empty}>{t('group.noFriends')}</Text>}
          />
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface RenameProps {
  value: string;
  onChangeValue: (next: string) => void;
  busy: boolean;
  errorMessage: string;
  onSubmit: () => void;
  onClose: () => void;
}

export function RenameGroupSheet({
  value,
  onChangeValue,
  busy,
  errorMessage,
  onSubmit,
  onClose,
}: RenameProps) {
  const disabled = busy || !value.trim();

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      {/* Klavye: alt-sayfa `flex-end` ile alta yapışık, sarmalayıcı olmadan giriş + butonlar
          klavyenin ALTINDA kalıyor (M1d dersi, eski grup yönetim ekranından taşındı). Android'de de
          `behavior="padding"` — edge-to-edge'de pencere küçülmüyor. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{t('group.renameTitle')}</Text>
            <TextInput
              value={value}
              onChangeText={onChangeValue}
              placeholder={t('group.renamePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              maxLength={50}
              style={styles.renameInput}
              autoFocus
            />
            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <View style={styles.renameActions}>
              <Pressable onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                disabled={disabled}
                onPress={onSubmit}
                style={[styles.saveButton, disabled && styles.disabled]}
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
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  closeButton: {
    marginTop: 10,
    minHeight: theme.layout.controlSm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
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
  error: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingBottom: 8,
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
  disabled: { opacity: 0.5 },
  saveText: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
});
