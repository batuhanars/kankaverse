import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AiVideoReferencesOption } from '@/api/aiVideo';
import { t } from '@/i18n';
import { theme } from '@/theme';
import { clock, type RefItem, type RefMode } from './aiVideoRefs';

interface Props {
  refs: AiVideoReferencesOption;
  items: RefItem[];
  labels: string[];
  thumbs: Record<string, string>;
  mode: RefMode;
  /** Ön denetim hatası (boyut, süre, tür, sayı): düğmenin hemen altında, kaydırmadan görünsün. */
  error: string;
  disabled: boolean;
  onPickMedia: () => void;
  onPickAudio: () => void;
  onRemove: (id: string) => void;
}

function Card({ item, label, thumb, onRemove }: { item: RefItem; label: string; thumb?: string; onRemove: () => void }) {
  const uri = item.kind === 'image' ? item.uri : thumb;
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, item.status === 'error' && styles.cardError]}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <Ionicons
            name={item.kind === 'audio' ? 'musical-notes' : 'videocam'}
            size={28}
            color={theme.colors.textSecondary}
          />
        )}
        {item.status === 'uploading' ? (
          <View style={styles.cover}>
            <ActivityIndicator color={theme.colors.textPrimary} />
          </View>
        ) : null}
        <Text style={styles.tag} numberOfLines={1}>
          {label}
        </Text>
        {item.durationS !== null && item.kind !== 'image' ? (
          <Text style={styles.time}>{clock(item.durationS)}</Text>
        ) : null}
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.aiVideoRefs.remove', { label })}
        >
          <Ionicons name="close" size={14} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      {item.status === 'error' ? <Text style={styles.cardErrorText}>{item.error}</Text> : null}
    </View>
  );
}

/** C42 §3.1/2/4/7: Dosya ekle, ek şeridi, sayaç, kip açıklaması ve kural notu. */
export function AiVideoAttachments({ refs, items, labels, thumbs, mode, error, disabled, onPickMedia, onPickAudio, onRemove }: Props) {
  const [menu, setMenu] = useState(false);
  const count = (k: RefItem['kind']) => items.filter((i) => i.kind === k).length;
  const mediaFull = count('image') >= refs.max.image && count('video') >= refs.max.video;
  const audioFull = count('audio') >= refs.max.audio;
  // Referans ucu olmayan modelde (Pika, Kling, Seedance) tek görsel: menü, sayaç ve video/ses dili gereksiz.
  const imageOnly = refs.max.video === 0 && refs.max.audio === 0;
  return (
    <View style={styles.group}>
      <Pressable
        onPress={() => (imageOnly ? onPickMedia() : setMenu((m) => !m))}
        disabled={disabled}
        style={[styles.ghost, disabled && styles.off]}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: menu }}
      >
        <Ionicons name="attach" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.ghostText}>
          {t(imageOnly ? 'mobile.aiVideoRefs.addImage' : 'mobile.aiVideoRefs.add')}
        </Text>
      </Pressable>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {menu && !imageOnly ? (
        <View style={styles.menu}>
          <Pressable
            onPress={() => {
              setMenu(false);
              onPickMedia();
            }}
            disabled={mediaFull}
            style={[styles.menuItem, mediaFull && styles.off]}
            accessibilityRole="button"
            accessibilityState={{ disabled: mediaFull }}
          >
            <Text style={styles.ghostText}>{t('mobile.aiVideoRefs.addMedia')}</Text>
            {mediaFull ? <Text style={styles.hint}>{t('mobile.aiVideoRefs.errors.full')}</Text> : null}
          </Pressable>
          <Pressable
            onPress={() => {
              setMenu(false);
              onPickAudio();
            }}
            disabled={audioFull}
            style={[styles.menuItem, audioFull && styles.off]}
            accessibilityRole="button"
            accessibilityState={{ disabled: audioFull }}
          >
            <Text style={styles.ghostText}>{t('mobile.aiVideoRefs.addAudio')}</Text>
            {audioFull ? <Text style={styles.hint}>{t('mobile.aiVideoRefs.errors.full')}</Text> : null}
          </Pressable>
        </View>
      ) : null}
      {items.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} keyboardShouldPersistTaps="handled">
            {items.map((it, i) => (
              <Card key={it.id} item={it} label={labels[i]} thumb={thumbs[it.id]} onRemove={() => onRemove(it.id)} />
            ))}
          </ScrollView>
          {imageOnly ? null : (
            <Text style={styles.hint}>
              {t('mobile.aiVideoRefs.counter', {
              image: count('image'),
              imageMax: refs.max.image,
              video: count('video'),
              videoMax: refs.max.video,
              audio: count('audio'),
              audioMax: refs.max.audio,
              })}
            </Text>
          )}
          <Text style={styles.note}>{t(mode === 'image' ? 'mobile.aiVideoRefs.modeImage' : 'mobile.aiVideoRefs.modeReference')}</Text>
          <Text style={styles.hint}>{t('mobile.aiVideoRefs.rule')}</Text>
        </>
      ) : (
        <Text style={styles.hint}>{t(imageOnly ? 'mobile.aiVideoRefs.hintImage' : 'mobile.aiVideoRefs.hint')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  ghost: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
  },
  ghostText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '600' },
  menu: { gap: 6 },
  menuItem: {
    minHeight: theme.layout.inputMinHeight,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgContent,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  off: { opacity: 0.5 },
  strip: { gap: 8, paddingVertical: 2 },
  cardWrap: { width: 88, gap: 2 },
  card: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardError: { borderWidth: 1, borderColor: theme.colors.danger },
  cardErrorText: { color: theme.colors.danger, fontSize: theme.fontSize.xs },
  thumb: { ...StyleSheet.absoluteFillObject },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bgOverlay },
  tag: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    maxWidth: 62,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgOverlay,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  time: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 5,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: theme.colors.bgOverlay,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xs,
  },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgOverlay,
  },
  error: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  hint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  note: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
});
