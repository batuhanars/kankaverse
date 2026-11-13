import { useEffect, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { AiVideoSheet } from '../aiVideo/AiVideoSheet';
import type { DraftAttachment } from '@/utils/attachmentUpload';
import { MessageComposer } from './MessageComposer';
import { AttachmentSheet } from './AttachmentSheet';
import { EmojiGifSheet } from './EmojiGifSheet';
import { useEmojiInsert } from './useEmojiInsert';
import { useVoiceRecorder } from './useVoiceRecorder';
import type { useMessageComposer } from './useMessageComposer';
import type { MentionCandidate, useMentionCompose } from './useMentionCompose';

/**
 * Sprint M3c — giriş şeridinin YERLEŞİMİ: kutu + ek paneli + emoji seçici bir arada.
 *
 * `MessageActionHost` ile aynı desen ve aynı sebep: `MessageScreen` zaten 400 satırın üzerinde ve
 * bir panelin iç akışı ekranın işi değil. Kutu üç yeni yüzey kazandı (`+`, emoji, taslak şeridi) —
 * hepsini ekrana bağlasaydık ekran bir daha okunmazdı.
 *
 * Metin değişimi TEK bir yerden akar (`handleChangeText`): bahsetme kancası, "yazıyor" yayını ve
 * emojinin imleç kontrolü aynı olaya bağlı; üçünü ayrı ayrı bağlamak birinin unutulmasıydı.
 */
interface Props {
  composer: ReturnType<typeof useMessageComposer>;
  mention: ReturnType<typeof useMentionCompose>;
  placeholder: string;
  disabledNotice?: string | null;
  disabledAction?: { label: string; onPress: () => void };
  typingLabel: string | null;
  bottomInset: number;
  /** M6b — kayıt, sohbet değişince iptal edilsin diye kanal kimliğini bilir. */
  channelId: string;
  /** D95 — profil panelinden "Bahset": her istek yeni nesne (aynı kişi tekrar seçilebilsin). */
  mentionRequest?: { candidate: MentionCandidate } | null;
}

export function ComposerHost({
  composer,
  mention,
  placeholder,
  disabledNotice,
  disabledAction,
  typingLabel,
  bottomInset,
  channelId,
  mentionRequest,
}: Props) {
  const [attachOpen, setAttachOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  // C14d/C33 — kapı yalnız arayüz; sunucu otorite. İzinli ya da pasif tanıtım (aiVideoPreview); ikisi de yoksa giriş hiç görünmez.
  const aiVideoAllowed = useAuthStore(
    (s) => s.user?.aiVideoAllowed === true || s.user?.aiVideoPreview === true,
  );
  // `handleChangeText` fonksiyon bildirimi olduğu için burada kullanılabilir (hoisting); tersi
  // sırada yazılamazdı, çünkü o da `emoji`ye ihtiyaç duyuyor.
  const emoji = useEmojiInsert(composer.input, handleChangeText);
  const recorder = useVoiceRecorder(channelId);
  const inputRef = useRef<TextInput>(null);

  // D95 — Bahset: `@ad ` metnin sonuna eklenir (otomatik tamamlamayla aynı kayıt), kutu odaklanır,
  // imleç sonda. Metin önce yazılır, imleç SONRA kurulur (useEmojiInsert sıra notu).
  useEffect(() => {
    if (!mentionRequest) return;
    const next = mention.append(mentionRequest.candidate, composer.input);
    composer.onChangeInput(next.text);
    emoji.placeCaret(next.cursor);
    inputRef.current?.focus();
    // yalnız yeni istekte çalışır; composer/mention her render değişir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionRequest]);

  // M6b — biten kayıt mevcut ek hattıyla gider (içerik boş, tek ek); kısa kayıt `null` → sessizce atılır.
  async function sendVoice() {
    const draft = await recorder.finish();
    if (draft) void composer.onSend([draft]);
  }

  // C14d — "Kaydet ve gönder": ek zaten sunucuda üretildi (`uploadedId`), yükleme atlanır; açık yanıt ve
  // yazılı metin mevcut gönderim yoluyla (`onSend`) birlikte gider, hata olursa şeritte kalır.
  function sendAiVideo(attachmentId: string) {
    setAiOpen(false);
    const draft: DraftAttachment = {
      key: `ai-${attachmentId}`,
      uri: '',
      filename: 'yapay-zeka-video.mp4',
      contentType: 'video/mp4',
      size: 0,
      isVideo: true,
      uploadedId: attachmentId,
    };
    void composer.onSend([draft]);
  }

  function handleChangeText(text: string) {
    // Emojinin tek-render'lık imleç kontrolü bırakılır — kullanıcı klavyeden yazarken imleci
    // kontrol etmeye devam etmek Android IME'siyle kavga ediyor (bkz. `useEmojiInsert`).
    emoji.clearSelection();
    composer.onChangeInput(text);
    mention.onChangeText(text);
  }

  return (
    <>
      <MessageComposer
        value={composer.input}
        onChangeText={handleChangeText}
        onSend={() => composer.onSend()}
        sending={composer.sending}
        sendError={composer.sendError}
        uploadLabel={composer.uploadLabel}
        placeholder={placeholder}
        disabledNotice={disabledNotice}
        disabledAction={disabledAction}
        typingLabel={typingLabel}
        bottomInset={bottomInset}
        replyToAuthor={composer.replyTo?.author.username}
        replyToSnippet={composer.replyTo?.content}
        replyToAttachment={composer.replyTo?.attachments?.[0] ?? null}
        onCancelMode={composer.cancelMode}
        mentionSuggestions={mention.visible ? mention.suggestions : undefined}
        onMentionSelect={(candidate) => {
          const next = mention.select(candidate, composer.input);
          if (next) composer.onChangeInput(next.text);
        }}
        onSelectionChange={(start, end) => {
          mention.onSelectionChange(start);
          emoji.onSelectionChange(start, end);
        }}
        selection={emoji.selection}
        inputRef={inputRef}
        attachments={composer.attachments}
        onRemoveAttachment={composer.removeAttachment}
        onOpenAttach={() => setAttachOpen(true)}
        onOpenEmoji={() => emoji.setOpen(true)}
        onOpenAiVideo={aiVideoAllowed ? () => setAiOpen(true) : undefined}
        voice={{
          phase: recorder.phase,
          elapsedMs: recorder.elapsedMs,
          levels: recorder.levels,
          disabled: recorder.disabled,
          notice: recorder.notice,
          openSettings: recorder.openSettings,
          onStart: () => void recorder.start(),
          onCancel: () => void recorder.cancel(),
          onSend: () => void sendVoice(),
        }}
      />

      {/* Panel yalnız açıkken monte edilir: kapalıyken de dursaydı galeri izni ekran açılır açılmaz
          sorulurdu (izin, kullanıcı ek göndermek İSTEDİĞİNDE istenir). */}
      {attachOpen && (
        <AttachmentSheet
          visible
          onClose={() => setAttachOpen(false)}
          existingCount={composer.attachments.length}
          existingVideoCount={composer.attachments.filter((a) => a.isVideo).length}
          onConfirm={(drafts) => {
            setAttachOpen(false);
            // M6c §3.3.b — gönderilmez, şeride düşer: kullanıcı açıklama yazıp kendisi gönderir.
            composer.addAttachments(drafts);
          }}
        />
      )}

      {aiVideoAllowed && (
        <AiVideoSheet visible={aiOpen} mode="chat" onClose={() => setAiOpen(false)} onSend={sendAiVideo} />
      )}

      {/* C23 — emoji düğmesi Emoji | GIF alt sayfası açar. Emoji sekmesi eski seçiciyle aynı
          paket/tema; bir emoji seçilince sayfa KAPANIR (sahip isteği, C23). Tepki seçici değişmedi. */}
      <EmojiGifSheet
        visible={emoji.open}
        onClose={() => emoji.setOpen(false)}
        onEmojiSelected={emoji.insert}
        showGif
        existingCount={composer.attachments.length}
        onGifDraft={(draft) => {
          emoji.setOpen(false);
          composer.addAttachments([draft]);
        }}
      />
    </>
  );
}
