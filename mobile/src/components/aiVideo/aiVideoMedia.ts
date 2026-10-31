import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer } from 'expo-audio';
import { getVideoMetaData } from 'react-native-compressor';

const AUDIO_PROBE_MS = 3000;

export async function sizeOfFile(uri: string, known?: number | null): Promise<number> {
  if (known) return known;
  const info = await FileSystem.getInfoAsync(uri).catch(() => null);
  return info && info.exists && 'size' in info ? info.size : 0;
}

/** Video süresi (sn): picker'ın `duration`ı ms'dir; yoksa dosyadan okunur. null = ölçülemedi. */
export async function videoDurationS(uri: string, pickerMs?: number | null): Promise<number | null> {
  if (pickerMs && pickerMs > 0) return pickerMs / 1000;
  const meta = await getVideoMetaData(uri).catch(() => null);
  return meta && meta.duration > 0 ? meta.duration : null;
}

/**
 * Ses süresi (sn). expo-document-picker süre vermez; geçici bir oynatıcı yükleyip durumunu bekleriz.
 * 3 sn içinde yüklenmezse null (ön denetim atlanır, sunucu denetler).
 */
export function audioDurationS(uri: string): Promise<number | null> {
  return new Promise((resolve) => {
    let done = false;
    const player = createAudioPlayer(uri);
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub.remove();
      player.remove();
      resolve(value);
    };
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.isLoaded && s.duration > 0) finish(s.duration);
    });
    const timer = setTimeout(() => finish(null), AUDIO_PROBE_MS);
  });
}
