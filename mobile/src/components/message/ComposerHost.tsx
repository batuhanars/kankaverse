import { useState } from 'react';
import EmojiPicker, { tr as emojiTr } from 'rn-emoji-keyboard';
import { MessageComposer } from './MessageComposer';
import { AttachmentSheet } from './AttachmentSheet';
import { emojiPickerTheme } from './emojiPickerTheme';
import { useEmojiInsert } from './useEmojiInsert';
import type { useMessageComposer } from './useMessageComposer';
import type { useMentionCompose } from './useMentionCompose';

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
  typingLabel: string | null;
  bottomInset: number;
}

export function ComposerHost({
  composer,
  mention,
  placeholder,
  disabledNotice,
  typingLabel,
  bottomInset,
}: Props) {
  const [attachOpen, setAttachOpen] = useState(false);
  // `handleChangeText` fonksiyon bildirimi olduğu için burada kullanılabilir (hoisting); tersi
  // sırada yazılamazdı, çünkü o da `emoji`ye ihtiyaç duyuyor.
  const emoji = useEmojiInsert(composer.input, handleChangeText);

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
        typingLabel={typingLabel}
        bottomInset={bottomInset}
        replyToAuthor={composer.replyTo?.author.username}
        replyToSnippet={composer.replyTo?.content}
        editing={!!composer.editing}
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
        attachments={composer.attachments}
        onRemoveAttachment={composer.removeAttachment}
        onOpenAttach={() => setAttachOpen(true)}
        onOpenEmoji={() => emoji.setOpen(true)}
      />

      {/* Panel yalnız açıkken monte edilir: kapalıyken de dursaydı galeri izni ekran açılır açılmaz
          sorulurdu (izin, kullanıcı ek göndermek İSTEDİĞİNDE istenir). */}
      {attachOpen && (
        <AttachmentSheet
          visible
          onClose={() => setAttachOpen(false)}
          existingCount={composer.attachments.length}
          onConfirm={(drafts) => {
            setAttachOpen(false);
            void composer.onSend(drafts);
          }}
        />
      )}

      {/* Sprint M3c §4 — kutunun emoji seçicisi. Tepki seçicisiyle AYNI paket ve AYNI tema;
          Discord'un GIF/Çıkartma sekmeleri bizde yok, sekme çubuğu da çizilmiyor.
          Seçici açık kalır (`closeOnSelect` yok): arka arkaya emoji eklemek Discord'daki gibi. */}
      <EmojiPicker
        open={emoji.open}
        onClose={() => emoji.setOpen(false)}
        onEmojiSelected={(e) => emoji.insert(e.emoji)}
        translation={emojiTr}
        enableSearchBar
        categoryPosition="top"
        theme={emojiPickerTheme}
      />
    </>
  );
}
