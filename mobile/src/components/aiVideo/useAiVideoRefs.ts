import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { createVideoThumbnail } from 'react-native-compressor';
import { aiVideoApi, type AiVideoReferencesOption } from '@/api/aiVideo';
import { t } from '@/i18n';
import { audioDurationS, sizeOfFile, videoDurationS } from './aiVideoMedia';
import { denyAdd, kindOfMime, labelsOf, modeOf, normalizeMime, type AddDenial, type RefItem } from './aiVideoRefs';

interface Candidate {
  uri: string;
  mime: string | null | undefined;
  name: string | null | undefined;
  size?: number | null;
  durationMs?: number | null;
}

const DENIAL_KEY: Record<AddDenial, string> = {
  full: 'mobile.aiVideoRefs.errors.full',
  type: 'mobile.aiVideoRefs.errors.type',
  size: 'mobile.aiVideoRefs.errors.size',
  tooShort: 'mobile.aiVideoRefs.errors.tooShort',
  tooLong: 'mobile.aiVideoRefs.errors.tooLong',
  totalLong: 'mobile.aiVideoRefs.errors.totalLong',
  audioTotal: 'mobile.aiVideoRefs.errors.audioTotal',
};

let nextId = 0;

function limitParams(refs: AiVideoReferencesOption): Record<string, number> {
  return {
    video: refs.videoMaxS,
    total: refs.videoTotalMaxS,
    audio: refs.audioMaxS,
    audioTotal: refs.audioTotalMaxS,
    min: refs.minS,
  };
}

/**
 * Sprint C42 (eski `useAiVideoImage`in yerine): görsel + video + ses ekleri. Her ek seçilince hemen presign +
 * doğrudan depolamaya PUT edilir (presigned adrese Authorization başlığı GİTMEZ, ham depolama hatası basılmaz);
 * yükleme bitmeden "Oluştur" pasif. Tür/boyut/süre denetimi erken uyarıdır, otorite sunucu.
 * Sınırlar ve kabul edilen türler `references` (options) kaynağından gelir (`getRefs`, çağrı anında okunur), sabit liste tutulmaz.
 */
export function useAiVideoRefs(getRefs: () => AiVideoReferencesOption | null) {
  const [items, setItems] = useState<RefItem[]>([]);
  // Ön denetim hatası "Dosya ekle" düğmesinin altında gösterilir (formun dibinde kalınca mobilde görünmüyordu)
  const [addError, setAddError] = useState('');
  const itemsRef = useRef<RefItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  function commit(next: RefItem[]) {
    itemsRef.current = next;
    setItems(next);
  }

  function patch(id: string, change: Partial<RefItem>) {
    commit(itemsRef.current.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }

  async function upload(it: RefItem) {
    try {
      const { uploadUrl, inputKey } = await aiVideoApi.presignInput(it.contentType, it.size);
      const res = await FileSystem.uploadAsync(uploadUrl, it.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': it.contentType },
      });
      if (res.status < 200 || res.status >= 300) throw new Error('upload_failed');
      patch(it.id, { status: 'ready', key: inputKey });
    } catch {
      patch(it.id, { status: 'error', error: t('mobile.aiVideoRefs.uploadFailed') });
    }
  }

  async function describe(c: Candidate): Promise<Omit<RefItem, 'id' | 'status'> | null> {
    const contentType = normalizeMime(c.mime, c.name ?? c.uri);
    const kind = kindOfMime(contentType);
    if (!kind) return null;
    const size = await sizeOfFile(c.uri, c.size);
    const durationS =
      kind === 'video' ? await videoDurationS(c.uri, c.durationMs) : kind === 'audio' ? await audioDurationS(c.uri) : null;
    return { kind, uri: c.uri, contentType, size, durationS };
  }

  async function add(cands: Candidate[]) {
    const refs = getRefs();
    if (!refs || !cands.length) return;
    setAddError('');
    let message = '';
    for (const c of cands) {
      const d = await describe(c);
      const denial = d ? denyAdd(itemsRef.current, d, refs) : 'type';
      if (!d || denial) {
        message ||= t(DENIAL_KEY[denial ?? 'type'], limitParams(refs));
        continue;
      }
      const item: RefItem = { ...d, id: `ref${++nextId}`, status: 'uploading' };
      commit([...itemsRef.current, item]);
      if (d.kind === 'video') {
        createVideoThumbnail(d.uri)
          .then((f) => setThumbs((m) => ({ ...m, [item.id]: f.path })))
          .catch(() => {}); // ilk kare kolaylık: yoksa simge kalır
      }
      void upload(item);
    }
    if (message) setAddError(message);
  }

  /** Galeri: görsel + video birlikte (expo-image-picker). Seçim sınırı kalan görsel+video yuvası. */
  async function pickMedia() {
    const refs = getRefs();
    if (!refs) return;
    const used = itemsRef.current.filter((i) => i.kind !== 'audio').length;
    const slots = refs.max.image + refs.max.video - used;
    if (slots <= 0) return setAddError(t(DENIAL_KEY.full));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: refs.max.video > 0 ? ['images', 'videos'] : ['images'],
      allowsMultipleSelection: true,
      selectionLimit: slots,
    });
    if (result.canceled || !result.assets?.length) return;
    await add(
      result.assets.map((a) => ({
        uri: a.uri,
        mime: a.mimeType,
        name: a.fileName,
        size: a.fileSize,
        durationMs: a.duration,
      })),
    );
  }

  /** Ses: belge seçici (süre vermez; `audioDurationS` ölçmeyi dener). */
  async function pickAudio() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    await add(result.assets.map((a) => ({ uri: a.uri, mime: a.mimeType, name: a.name, size: a.size })));
  }

  /** Eki çıkarır; döndürülen `{kind, n}` çağıranın istemdeki etiketleri düzeltmesi içindir. */
  function remove(id: string): { kind: RefItem['kind']; n: number } | null {
    const cur = itemsRef.current;
    const idx = cur.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    setAddError('');
    const kind = cur[idx].kind;
    const n = cur.slice(0, idx + 1).filter((i) => i.kind === kind).length;
    commit(cur.filter((i) => i.id !== id));
    return { kind, n };
  }

  return {
    items,
    thumbs,
    addError,
    labels: labelsOf(items),
    mode: modeOf(items),
    uploading: items.some((i) => i.status === 'uploading'),
    failed: items.some((i) => i.status === 'error'),
    pickMedia,
    pickAudio,
    remove,
  };
}
