import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChannelSummaryDto } from '@/api/channels';
import type { GuildMemberDto } from '@/api/guilds';
import type { GuildSearchParams } from '@/api/messages';
import { sheetBottomPadding, useSheetInsets } from '../home/sheetInsets';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Sprint M1g §2.3 — ortam içi arama filtre paneli.
 *
 * Dört filtre de bağlı: **kanal** (`in`), **tür** (`has`), **gönderen** (`from`) ve **bahsedilen**
 * (`mentions`). Son ikisi üye listesi gerektiriyordu; `GET /guilds/:id/members` zaten vardı.
 *
 * `from` ile `mentions` **aynı üye listesini** kullanıyor ama ayrı seçimler: "şu kişinin yazdığı"
 * ile "şu kişiden bahseden" farklı sorular ve sunucu ikisini ayrı parametre olarak alıyor.
 *
 * Seçim ANINDA uygulanmaz, "Uygula" ile uygulanır: her dokunuşta arama tetiklemek panel açıkken
 * arkada sonuç değiştirir, kullanıcı ne olduğunu göremez.
 */
interface Props {
  channels: ChannelSummaryDto[];
  members: GuildMemberDto[];
  value: GuildSearchParams;
  onApply: (next: GuildSearchParams) => void;
  onClose: () => void;
}

export function SearchFilterSheet({ channels, members, value, onApply, onClose }: Props) {
  const bottomInset = useSheetInsets();
  const [draft, setDraft] = useState<GuildSearchParams>(value);

  function toggleChannel(id: string) {
    setDraft((d) => ({ ...d, in: d.in === id ? undefined : id }));
  }
  function toggleHas(kind: 'link' | 'file') {
    setDraft((d) => ({ ...d, has: d.has === kind ? undefined : kind }));
  }
  /** Aynı üyeye tekrar dokunmak seçimi kaldırır — ayrı bir "temizle" düğmesi gerekmiyor. */
  function toggleMember(field: 'from' | 'mentions', userId: string) {
    setDraft((d) => ({ ...d, [field]: d[field] === userId ? undefined : userId }));
  }

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: sheetBottomPadding(bottomInset) }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>{t('guildSearch.filters')}</Text>
            <Pressable onPress={() => onApply(draft)} hitSlop={10}>
              <Text style={styles.apply}>{t('common.apply')}</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.label}>{t('guildSearch.cat.has')}</Text>
            <View style={styles.row}>
              <Choice
                label={t('guildSearch.has.link')}
                icon="link-outline"
                active={draft.has === 'link'}
                onPress={() => toggleHas('link')}
              />
              <Choice
                label={t('guildSearch.has.file')}
                icon="document-outline"
                active={draft.has === 'file'}
                onPress={() => toggleHas('file')}
              />
            </View>

            <Text style={styles.label}>{t('guildSearch.fromLabel')}</Text>
            <MemberPicker
              members={members}
              selected={draft.from}
              onToggle={(id) => toggleMember('from', id)}
            />

            <Text style={styles.label}>{t('guildSearch.mentionsLabel')}</Text>
            <MemberPicker
              members={members}
              selected={draft.mentions}
              onToggle={(id) => toggleMember('mentions', id)}
            />

            <Text style={styles.label}>{t('guildSearch.cat.in')}</Text>
            {channels.length === 0 ? (
              <Text style={styles.empty}>{t('guildSearch.noChannels')}</Text>
            ) : (
              channels.map((c) => (
                <Pressable key={c.id} onPress={() => toggleChannel(c.id)} style={styles.channelRow}>
                  <Ionicons name="pricetag-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.channelName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {draft.in === c.id ? (
                    <Ionicons name="checkmark" size={18} color={theme.colors.accent500} />
                  ) : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Yatay kaydırmalı üye şeridi. Ortam üyesi çok olabilir; dikey liste panelin tamamını yerdi ve
 * kanal filtresi görünmez olurdu. Üye yoksa (liste gelmediyse) satır HİÇ çizilmez — boş bir
 * şerit "üye yok" gibi yanlış okunur.
 */
function MemberPicker({
  members,
  selected,
  onToggle,
}: {
  members: GuildMemberDto[];
  selected?: string;
  onToggle: (userId: string) => void;
}) {
  if (members.length === 0) {
    return <Text style={styles.empty}>{t('guildSearch.noMembers')}</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {members.map((m) => {
        const active = selected === m.userId;
        return (
          <Pressable
            key={m.userId}
            onPress={() => onToggle(m.userId)}
            style={[styles.choice, active && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]} numberOfLines={1}>
              {m.username}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Choice({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Ionicons
        name={icon}
        size={16}
        color={active ? theme.colors.accent500 : theme.colors.textSecondary}
      />
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    backgroundColor: theme.colors.bgSidebar,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.panelGap,
    paddingTop: 8,
  },
  title: { color: theme.colors.textPrimary, fontSize: theme.fontSize.lg, fontWeight: '700' },
  apply: { color: theme.colors.accent500, fontSize: theme.fontSize.base, fontWeight: '700' },
  scroll: { marginTop: 8 },
  content: { paddingHorizontal: theme.layout.panelGap, paddingBottom: 12, gap: 8 },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    marginTop: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  choiceActive: { backgroundColor: theme.colors.accentSubtle },
  choiceText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '600' },
  choiceTextActive: { color: theme.colors.accent500 },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  channelName: { flex: 1, color: theme.colors.textPrimary, fontSize: theme.fontSize.sm },
  empty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
});
