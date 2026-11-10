import { requireOptionalNativeModule, NativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// Play uygulama içi güncelleme köprüsü. `picture-in-picture` deseniyle aynı: yalnız Android derlenir,
// modül yoksa (iOS/web, eski kurulum) her çağrı "güncelleme yok"a düşer.

export type UpdateStatus =
  'downloading' | 'downloaded' | 'installing' | 'installed' | 'failed' | 'canceled' | 'unknown';

export interface UpdateStatusEvent {
  status: UpdateStatus;
  bytesDownloaded: number;
  totalBytes: number;
}

export interface UpdateCheckResult {
  available: boolean;
  downloaded: boolean;
  versionCode: number;
}

type InAppUpdateEvents = {
  onStatus(event: UpdateStatusEvent): void;
};

declare class NativeInAppUpdateModule extends NativeModule<InAppUpdateEvents> {
  check(): Promise<UpdateCheckResult | null>;
  start(): Promise<boolean>;
  complete(): Promise<void>;
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeInAppUpdateModule>('InAppUpdate') : null;

/** Play'e sorar. Play dışı kurulumda/ağ hatasında null (sessiz: güncelleme yok sayılır). */
export async function checkForUpdate(): Promise<UpdateCheckResult | null> {
  if (!native) return null;
  try {
    return await native.check();
  } catch {
    return null;
  }
}

/** Play'in onay penceresini açar; indirme arka planda sürer. Pencere açılmadıysa false. */
export async function startUpdate(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.start();
  } catch {
    return false;
  }
}

/** İndirilen sürümü kurar (uygulama yeniden başlar). */
export function completeUpdate(): Promise<void> {
  return native?.complete() ?? Promise.resolve();
}

export function addUpdateStatusListener(listener: (event: UpdateStatusEvent) => void): {
  remove: () => void;
} {
  if (!native) return { remove: () => {} };
  return native.addListener('onStatus', listener);
}
