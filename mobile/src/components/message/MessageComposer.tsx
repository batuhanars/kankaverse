import type { Ref } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AiVideoSparkles } from '../aiVideo/AiVideoSparkles';
import { MentionSuggestionList } from './MentionSuggestionList';
import type { MentionCandidate } from './useMentionCompose';
import { VoiceRecorderBar } from './VoiceRecorderBar';
import type { VoicePhase } from './useVoiceRecorder';
import type { DraftAttachment } from '@/utils/attachmentUpload';
import type { ReplyAttachmentDto } from '@/api/messages';
import { attachmentIcon, replyBody, useAttachmentThumb } from './replyPreview';
import { t } from '@/i18n';
import { theme } from '@/theme';

/**
 * Kutunun içindeki emoji ikonunun yuvası. **Tek sayı, iki yerde**: `TextInput`in sağ dolgusu ve
 * düğmenin genişliği. Ayrışırlarsa ya metin ikonun altına girer ya da dokunma hedefi küçülür —
 * 44dp seçilmesi tesadüf değil, dokunma hedefi alt sınırı (`layout.inputMinHeight`) ile aynı.
 */
const EMOJI_SLOT = theme.layout.inputMinHeight;

/**
 * Mesaj giriş şeridi — "yazıyor" etiketi + giriş kutusu + Gönder, ya da engelli/izinsiz durumda
 * sebep şeridi.
 *
 * `MessageScreen`den ayrıldı (M1d-C §2.1): o dosya 561 satıra çıkmıştı ve sprintte üzerine mesaj
 * paneli + tepki + yanıt gelecek. **Saf taşıma, davranış değişmedi** — yeni özellik eklenmeden önce
 * bölmek, sonra bölmeye çalışmaktan ucuz.
 *
 * 🔴 `bottomInset` (sistem gezinme çubuğu payı) burada UYGULANIR ama HESAPLANMAZ: hesabı ekranın
 * kendisi yapar (klavye açıkken pay verilmez, bkz. `MessageScreen`). Bileşen "ne kadar" sorusunun
 * cevabını dışarıdan alır, yoksa aynı hesap iki yerde ayrışırdı.
 */
interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string;
  placeholder: string;
  /** Doluysa giriş kutusu yerine sebep şeridi gösterilir (T&S: sessizce gizleme yok, sebep yazılır). */
  disabledNotice?: string | null;
  /** "X yazıyor…" — null ise şerit hiç render edilmez. */
  typingLabel: string | null;
  bottomInset: number;
  /** Yanıtlanan mesajın yazarı — doluysa alıntı şeridi görünür. */
  replyToAuthor?: string | null;
  /** Yanıtlanan mesajın metni (kısaltılmış gösterilir). */
  replyToSnippet?: string | null;
  /** Yanıtlanan mesajın ilk eki: şeritte türe göre etiket + sağda küçük önizleme (WhatsApp gibi). */
  replyToAttachment?: ReplyAttachmentDto | null;
  /** Modu iptal et (× düğmesi). */
  onCancelMode?: () => void;
  /**
   * Sprint M2d — bahsetme önerileri. Boş dizi → liste hiç render edilmez (kaynak yoksa,
   * örn. `guildId`siz açılan kanal ekranında, yüzey de olmaz: yarım liste yanlış vaat).
   */
  mentionSuggestions?: MentionCandidate[];
  onMentionSelect?: (candidate: MentionCandidate) => void;
  /**
   * `TextInput` imleç takibi — bahsetme kancası sorguyu `start`'tan, emoji ekleme aralığın
   * ikisinden okur (RN'de selection bedava değil, tek olaydan iki tüketici beslenir).
   */
  onSelectionChange?: (start: number, end: number) => void;
  /**
   * Sprint M3c §4 — emoji eklendikten sonra imleci emojinin ARKASINA taşımak için TEK render
   * boyunca kontrol edilen seçim. Kalıcı kontrol Android IME'siyle kavga ediyor (bkz.
   * `useEmojiInsert`).
   */
  selection?: { start: number; end: number } | null;
  /** D95 — "Bahset" kısayolu kutuyu odaklayabilsin diye `TextInput` referansı. */
  inputRef?: Ref<TextInput>;
  /** Sprint M3c §1 — `+` düğmesi. Verilmezse düğme çizilmez (yüzeyi olmayan ekranlar için). */
  onOpenAttach?: () => void;
  /** Sprint M3c §4 — emoji seçiciyi aç. Verilmezse düğme çizilmez. */
  onOpenEmoji?: () => void;
  /** C14d — yapay zeka video (yalnız açık listedeki hesapta verilir; verilmezse düğme çizilmez). */
  onOpenAiVideo?: () => void;
  /** Gönderilmeyi bekleyen ekler — kutunun üstünde şerit olarak görünür. */
  attachments?: DraftAttachment[];
  onRemoveAttachment?: (key: string) => void;
  /** "Yükleniyor… 2/5" — boşsa şerit çizilmez. */
  uploadLabel?: string;
  /**
   * Sprint M6b §3 — sesli mesaj. Verilmezse mikrofon düğmesi hiç çizilmez. Mikrofon, kutu boşken ve
   * ek yokken gönder düğmesinin YERİNDE durur; kayıt sürerken kutu `VoiceRecorderBar`a döner.
   */
  voice?: {
    phase: VoicePhase;
    elapsedMs: number;
    levels: number[];
    /** Aramadayken true: düğme soluk, dokununca açıklama çıkar (gizlenmez). */
    disabled: boolean;
    /** Kısa açıklama (izin yok / aramada); boşsa çizilmez. */
    notice: string;
    openSettings: (() => void) | null;
    onStart: () => void;
    onCancel: () => void;
    onSend: () => void;
  };
}

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  sending,
  sendError,
  placeholder,
  disabledNotice,
  typingLabel,
  bottomInset,
  replyToAuthor,
  replyToSnippet,
  replyToAttachment,
  onCancelMode,
  mentionSuggestions,
  onMentionSelect,
  onSelectionChange,
  selection,
  inputRef,
  onOpenAttach,
  onOpenEmoji,
  onOpenAiVideo,
  attachments,
  onRemoveAttachment,
  uploadLabel,
  voice,
}: Props) {
  // Sunucu ile aynı kural: en az bir ek varsa boş metinle de gönderilebilir (`EMPTY_MESSAGE`).
  const canSend = (!!value.trim() || !!attachments?.length) && !sending;
  const modeActive = !!replyToAuthor;
  const replyThumb = useAttachmentThumb(replyToAttachment);
  const replyText = replyBody(replyToSnippet ?? '', replyToAttachment);
  const showAttach = !!onOpenAttach;
  const recording = !!voice && voice.phase !== 'idle';
  // Mikrofon gönder düğmesinin yerinde: kutu boş, ek yok, gönderim sürmüyor.
  const showMic = !!voice && !canSend && !sending;

  return (
    <>
      {/* Mod şeridi — kutunun ÜSTÜNDE, çünkü "neye yazıyorum" bilgisi yazmadan önce görülmeli.
          Web'de `message.editHint` "Enter kaydet · Esc iptal" diyor; mobilde Esc yok, o metin
          KULLANILMADI — görünür × düğmesi var (olmayan tuşu tarif etmek yanlış yönlendirir). */}
      {modeActive && (
        <View style={styles.modeRow}>
          <View style={styles.modeTextWrap}>
            <Text style={styles.modeLabel} numberOfLines={1}>
              {t('reply.to', { author: replyToAuthor ?? '' })}
            </Text>
            {replyText ? (
              <Text style={styles.modeSnippet} numberOfLines={1}>
                {replyToAttachment ? (
                  <>
                    <Ionicons name={attachmentIcon(replyToAttachment)} size={12} color={theme.colors.textMuted} />{' '}
                  </>
                ) : null}
                {replyText}
              </Text>
            ) : null}
          </View>
          {replyThumb ? <Image source={{ uri: replyThumb }} style={styles.modeThumb} resizeMode="cover" /> : null}
          <Pressable
            onPress={onCancelMode}
            // 20px ikon + her yandan 12 = 44dp. Önceden 10'du → 40dp, sınırın altındaydı.
            // Çipin ×'inde de aynı kusur vardı (R3'te düzeltildi); bu düğme o turun kapsamında değildi.
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('reply.cancel')}
          >
            <Ionicons name="close" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      )}

      {/* M2d — öneri listesi giriş şeridinin HEMEN ÜSTÜNDE; "yazıyor" şeridini yerinden
          oynatmaması için onun da üstünde durur (sözleşme §4.2). */}
      {!!mentionSuggestions?.length && onMentionSelect && (
        <MentionSuggestionList suggestions={mentionSuggestions} onSelect={onMentionSelect} />
      )}

      {typingLabel && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>{typingLabel}</Text>
        </View>
      )}

      {disabledNotice ? (
        <View style={[styles.disabledBar, { paddingBottom: theme.layout.panelGap + bottomInset }]}>
          <Text style={styles.disabledText}>{disabledNotice}</Text>
        </View>
      ) : (
        <View style={[styles.inputBar, { paddingBottom: theme.layout.panelGap + bottomInset }]}>
          {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
          {uploadLabel ? <Text style={styles.uploadLabel}>{uploadLabel}</Text> : null}
          {voice?.notice ? (
            <View style={styles.noticeRow}>
              <Text style={styles.noticeText}>{voice.notice}</Text>
              {voice.openSettings ? (
                <Pressable onPress={voice.openSettings} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.noticeLink}>{t('mobile.voice.openSettings')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* Sprint M3c §3 — gönderilmeyi bekleyen ekler. M6c §3.3.b'den beri panelden onaylanan
              ekler de burada açıklama bekler. Gönderim hatasında şerit AYAKTA KALIR (seçim korunur),
              kullanıcı aynı seçimle tekrar deneyebilir. */}
          {!!attachments?.length && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.draftRow}>
              {attachments.map((draft) => (
                <View key={draft.key} style={styles.draftChip}>
                  {draft.contentType.startsWith('image/') ? (
                    <Image source={{ uri: draft.uri }} style={styles.draftThumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.draftThumb}>
                      {/* `Image` video dosyasını çizemiyor; küçük resim gönderim anında üretiliyor. */}
                      <Ionicons
                        name={draft.isVideo ? 'videocam-outline' : 'document-outline'}
                        size={20}
                        color={theme.colors.textSecondary}
                      />
                    </View>
                  )}
                  <Text style={styles.draftName} numberOfLines={1}>
                    {draft.filename}
                  </Text>
                  {/* 🔴 Gönderim sürerken kaldırma KAPALI. `onSend` yerel bir taslak kopyası
                      tutuyor; yükleme sürerken bir çip silinip sonra gönderim patlarsa, kurtarma
                      yolu o kopyayı geri yazıp silineni diriltirdi. Yarışı kaynağında kesmek,
                      kurtarma yoluna birleştirme mantığı eklemekten daha güvenli — hata anında
                      çalışması gereken tek yol o. Dokunma hedefi (44dp) korunuyor, yalnız soluyor. */}
                  <Pressable
                    onPress={() => onRemoveAttachment?.(draft.key)}
                    disabled={sending}
                    hitSlop={13}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: sending }}
                    accessibilityLabel={t('attachment.remove')}
                    style={sending && styles.draftRemoveBusy}
                  >
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}

          {recording && voice ? (
            <VoiceRecorderBar
              phase={voice.phase}
              elapsedMs={voice.elapsedMs}
              levels={voice.levels}
              sending={sending}
              onCancel={voice.onCancel}
              onSend={voice.onSend}
            />
          ) : (
          <View style={styles.inputRow}>
            {showAttach && (
              <Pressable
                onPress={onOpenAttach}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.attach.open')}
                style={styles.iconButton}
              >
                <Ionicons name="add" size={24} color={theme.colors.textSecondary} />
              </Pressable>
            )}
            {/* Emoji ikonu kutunun İÇİNDE, sağa yaslı (M3c R1 — Discord yerleşimi). Sarmalayıcı
                gerekli: mutlak konumlanan düğme `TextInput`in kendi kutusuna göre değil, onunla
                aynı sınırlara sahip bir kapsayıcıya göre yerleşsin. */}
            <View style={styles.inputWrap}>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, onOpenAiVideo && onOpenEmoji && { paddingRight: EMOJI_SLOT * 2 }]}
                multiline
                selection={selection ?? undefined}
                onSelectionChange={(e) =>
                  onSelectionChange?.(e.nativeEvent.selection.start, e.nativeEvent.selection.end)
                }
              />
              {onOpenAiVideo && (
                <Pressable
                  onPress={onOpenAiVideo}
                  accessibilityRole="button"
                  accessibilityLabel={t('aiVideo.button')}
                  style={[styles.emojiButton, onOpenEmoji && { right: EMOJI_SLOT }]}
                >
                  <AiVideoSparkles size={22} color={theme.colors.accent500} />
                </Pressable>
              )}
              {onOpenEmoji && (
                <Pressable
                  onPress={onOpenEmoji}
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.emoji.open')}
                  style={styles.emojiButton}
                >
                  <Ionicons name="happy-outline" size={22} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </View>

            {/* 🔴 Gönder YALNIZ `canSend` iken çizilir (devre dışı hâli gösterilmez) — kutu o alanı
                geri alıyor. Koşul metne değil `canSend`e bağlı: ek seçip hiç yazmayan kullanıcı da
                gönderebilmeli (sunucunun `EMPTY_MESSAGE` kuralıyla aynı). Metin kalktığı için
                ekran okuyucunun tek kaynağı `accessibilityLabel`.

                `|| sending` gönderim SÜRERKEN yuvayı tutar. `canSend` gönderim boyunca false olduğu
                için düğme aksi hâlde kaybolur, kutu genişler, metin yeniden sarılır ve gönderim
                bitince hepsi geri sıçrardı — kullanıcının basmasıyla sonucu arasında iki kez
                oynayan bir yerleşim. `canSend` mantığına dokunulmadı, yalnız yuva korunuyor. */}
            {(canSend || sending) && (
              <Pressable
                onPress={() => onSend()}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={t('message.send')}
                style={[styles.circleSlot, !canSend && styles.iconButtonBusy]}
              >
                <View style={styles.circle}>
                  <Ionicons name="send" size={18} color={theme.colors.textPrimary} />
                </View>
              </Pressable>
            )}

            {/* M6b §3 — mikrofon gönder düğmesinin yerinde (WhatsApp deseni). Aramadayken GİZLENMEZ,
                soluk durur ve dokununca sebebini söyler (T&S kuralı: sessizce gizleme yok). */}
            {showMic && voice && (
              <Pressable
                onPress={voice.onStart}
                accessibilityRole="button"
                accessibilityState={{ disabled: voice.disabled }}
                accessibilityLabel={t('mobile.voice.record')}
                style={[styles.circleSlot, voice.disabled && styles.iconButtonBusy]}
              >
                <View style={styles.circle}>
                  <Ionicons name="mic" size={20} color={theme.colors.textPrimary} />
                </View>
              </Pressable>
            )}
          </View>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.layout.panelGap,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.bgElevated,
  },
  modeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modeLabel: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  modeThumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
  },
  modeSnippet: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 1,
  },
  typingRow: {
    paddingHorizontal: theme.layout.panelGap,
    paddingBottom: 4,
  },
  typingText: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontStyle: 'italic',
  },
  inputBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  sendError: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
  },
  uploadLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginBottom: 6,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  noticeText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 1,
  },
  noticeLink: {
    color: theme.colors.accent500,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  draftRow: {
    gap: 8,
    paddingBottom: 8,
  },
  draftChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 200,
    paddingRight: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bgElevated,
    overflow: 'hidden',
  },
  draftThumb: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bgSidebar,
  },
  draftName: {
    flexShrink: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
  },
  draftRemoveBusy: {
    opacity: 0.4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  // Dokunma hedefi 44dp (sözleşme §1) — ikon 24px olsa da basılabilir alan küçülmez.
  iconButton: {
    width: theme.layout.inputMinHeight,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    // 44dp yuva, 24px ikonu ortaladığı için solda 10px boşluk bırakıyor; `inputBar`ın 16px
    // dolgusuyla toplanınca ikon kenardan 26px içeride duruyor ve yazı alanını gereksiz
    // daraltıyordu (sahip geri bildirimi 2026-08-11). Negatif pay yalnız GÖRSEL konumu sola
    // çekiyor, dokunma hedefi 44dp kalıyor.
    marginLeft: -8,
  },
  // Sağdaki Kor daire yuvası. `iconButton`ın negatif sol payı SOL kenardaki "+" için; burada
  // kullanılınca daire mesaj kutusuna yapışıyordu (sahip cihaz turu 2026-10-02).
  circleSlot: {
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  // §7.4 — gönder ve mikrofon AYNI yuvada, aynı görünümde: 40px Kor daire, beyaz ikon.
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Gönderim sürerken: yuva duruyor ama düğme basılamaz olduğu belli oluyor. */
  iconButtonBusy: {
    opacity: 0.4,
  },
  inputWrap: {
    flex: 1,
    minWidth: 0,
  },
  input: {
    minHeight: theme.layout.inputMinHeight,
    maxHeight: 120,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.bgSidebar,
    color: theme.colors.textPrimary,
    paddingLeft: 14,
    // 🔴 Metin emoji ikonunun ALTINA girmesin: ikon yuvası kadar sağ dolgu. (`DmDetailsHeader`'daki
    // `⋯` ile aynı sınıf hata — mutlak konumlu ikon metnin akışını kendiliğinden itmez.)
    paddingRight: EMOJI_SLOT,
    paddingVertical: 10,
    fontSize: theme.fontSize.base,
  },
  // Dokunma hedefi 44dp; kutu çok satıra büyüyünce ikon SON satırın hizasında kalır (alta yaslı),
  // ortada asılı kalmaz.
  emojiButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: EMOJI_SLOT,
    height: theme.layout.inputMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    padding: theme.layout.panelGap,
  },
  disabledText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
});
