import { useEffect, useRef, type RefObject } from 'react';
import { findNodeHandle, type TextInput } from 'react-native';
import { addImagePasteListener, attachImagePaste } from '../../../modules/rich-paste';
import { buildDraftAttachment } from './attachmentDraft';
import { MAX_ATTACHMENTS_PER_MESSAGE, type DraftAttachment } from '@/utils/attachmentUpload';
import { showToast } from '@/stores/toast';
import { t } from '@/i18n';

/**
 * C80 Rev.1 — klavyenin panosundan (Gboard "Pano", ekran görüntüsü önerisi) görsel yapıştırma. Native modül
 * (`modules/rich-paste`) kutunun görsel kabul ettiğini klavyeye bildirir; gelen görsel `+` panelindeki ve
 * galerideki eklerle AYNI huniden geçip taslak şeridine düşer (gönderilmez, kullanıcı açıklama yazabilir).
 *
 * Kutu kayıt/kapalı kipte yeniden monte olabiliyor: native görünümün kimliği her çizimde okunur, değişince
 * dinleyici yeniden bağlanır.
 */
export function useImagePaste(
  inputRef: RefObject<TextInput | null>,
  existingCount: number,
  onDraft: (drafts: DraftAttachment[]) => void,
) {
  const tag = useRef<number | null>(null);
  const latest = useRef({ existingCount, onDraft });
  latest.current = { existingCount, onDraft };

  useEffect(() => {
    const next = inputRef.current ? findNodeHandle(inputRef.current) : null;
    if (next && next !== tag.current) {
      tag.current = next;
      void attachImagePaste(next);
    }
  });

  useEffect(
    () =>
      addImagePasteListener((e) => {
        if (e.viewTag !== tag.current) return;
        if (latest.current.existingCount >= MAX_ATTACHMENTS_PER_MESSAGE) {
          showToast(t('mobile.attach.limit', { count: MAX_ATTACHMENTS_PER_MESSAGE }));
          return;
        }
        const ext = e.mimeType.split('/')[1] ?? 'png';
        void buildDraftAttachment({ uri: e.uri, filename: `pano-${Date.now()}.${ext}`, contentType: e.mimeType }).then(
          (r) => {
            if (r.ok) latest.current.onDraft([r.draft]);
            else showToast(t(r.errorKey));
          },
        );
      }),
    [],
  );
}
