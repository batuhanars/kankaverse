import { useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { getVideoMetaData } from 'react-native-compressor';
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo';
import { t } from '@/i18n';
import type { PickedProfileMedia } from '@/utils/animatedMedia';
import { useGalleryDownload } from '../message/useSaveToGallery';
import { aiVideoFailText } from './aiVideoErrors';

/** Presigned adres 15 dk; 10 dk sonra satırı tazele (web ile aynı). */
const STALE_MS = 10 * 60 * 1000;

type UsedVideo = Extract<PickedProfileMedia, { kind: 'video' }>;

interface Options {
  mode: 'chat' | 'media';
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
  /** chat: oluşturulan bekleyen ekin kimliği; çağıran mevcut mesaj gönderme yoluna verir. */
  onSend: (attachmentId: string) => void;
  /** media: indirilen videonun yerel hâli; çağıran mevcut hareketli kesit akışına verir. */
  onUse: (media: UsedVideo) => void;
}

/** 16:9 varsayımı yalnız meta veri okunamazsa yedek (çözünürlük "720p" gibi yüksekliği söyler). */
function fallbackSize(resolution: string): { width: number; height: number } {
  const height = parseInt(resolution, 10) || 720;
  return { width: Math.round((height * 16) / 9), height };
}

async function downloadForClip(row: AiVideoDto): Promise<UsedVideo> {
  const dir = FileSystem.cacheDirectory;
  if (!dir || !row.videoUrl) throw new Error('no source');
  const dest = `${dir}kv-ai-use-${row.id}.mp4`;
  const res = await FileSystem.downloadAsync(row.videoUrl, dest);
  if (res.status < 200 || res.status >= 300) throw new Error(`download ${res.status}`);
  const info = await FileSystem.getInfoAsync(dest);
  const size = info.exists && 'size' in info ? info.size : 0;
  const meta = await getVideoMetaData(dest).catch(() => null);
  const fb = fallbackSize(row.resolution);
  return {
    kind: 'video',
    uri: dest,
    contentType: 'video/mp4',
    size,
    // Süre sunucudan bilinir; kesit paneli gerçek süreyi oynatıcıdan zaten günceller.
    durationMs: row.durationS * 1000,
    width: meta?.width || fb.width,
    height: meta?.height || fb.height,
  };
}

/**
 * Sprint C14d: önizlenen satırın eylemleri. Eylemden hemen önce önizleme 10 dk'dan eskiyse satır sunucudan
 * tazelenir (presigned adresler). Galeri: C15'in ortak indirme kancası (`useGalleryDownload`), izin reddi
 * mevcut davranışla ("Galeriye kaydetmek için izin gerekiyor").
 */
export function useAiVideoActions({ mode, setBusy, setError, onSend, onUse }: Options) {
  const [row, setRow] = useState<AiVideoDto | null>(null);
  const openedAt = useRef(0);
  const gallery = useGalleryDownload();

  function show(next: AiVideoDto | null) {
    setRow(next);
    openedAt.current = Date.now();
  }

  /** Tamamlanan satırı sunucudan çekip önizler (adresler taze); olmazsa eldeki satır yedek. */
  async function showFresh(base: AiVideoDto) {
    try {
      show(await aiVideoApi.get(base.id));
    } catch {
      show(base);
    }
  }

  async function currentRow(): Promise<AiVideoDto | null> {
    if (!row) return null;
    if (Date.now() - openedAt.current < STALE_MS) return row;
    try {
      const fresh = await aiVideoApi.get(row.id);
      show(fresh);
      return fresh;
    } catch {
      return row;
    }
  }

  const saveRow = (r: AiVideoDto) =>
    r.downloadUrl ? gallery.run(async () => r.downloadUrl!, `kv-ai-${r.id}.mp4`) : Promise.resolve(false);

  async function save() {
    const r = await currentRow();
    if (r) await saveRow(r);
  }

  async function primary() {
    const r = await currentRow();
    if (!r) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'media') {
        onUse(await downloadForClip(r));
        return;
      }
      const { attachmentId } = await aiVideoApi.createAttachment(r.id);
      await saveRow(r); // galeri kaydı gönderimi engellemez (izin reddi ya da hata olsa da ek gider)
      onSend(attachmentId);
    } catch (e) {
      setError(mode === 'media' ? t('aiVideo.errors.download') : aiVideoFailText(e));
    } finally {
      setBusy(false);
    }
  }

  return { row, show, showFresh, save, primary, savingGallery: gallery.saving };
}
