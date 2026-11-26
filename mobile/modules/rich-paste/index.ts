import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/** C80 Rev.1 — klavye panosundan görsel yapıştırma (yalnız Android). Modül yoksa (eski kabuk) no-op. */
export type PastedImage = { viewTag: number; uri: string; mimeType: string };

declare class NativeRichPasteModule extends NativeModule<{ onImage: (e: PastedImage) => void }> {
  attach(viewTag: number): Promise<boolean>;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeRichPasteModule>('RichPaste') : null;

/** Mesaj kutusunun native görünümü görsel kabul etsin (idempotent: tekrar çağrı dinleyiciyi yeniler). */
export function attachImagePaste(viewTag: number): Promise<boolean> {
  return native?.attach(viewTag).catch(() => false) ?? Promise.resolve(false);
}

export function addImagePasteListener(listener: (e: PastedImage) => void): () => void {
  const sub = native?.addListener('onImage', listener);
  return () => sub?.remove();
}
