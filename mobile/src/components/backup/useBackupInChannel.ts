import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { shouldPromptSetup, useE2eeBackupStore } from '@/stores/e2eeBackup';

/**
 * Açık şifreli DM'in yedek bağları (E5a §4.4): (1) ilk şifreli DM açılışında BİR KEZ kurulum sorusu,
 * (2) geri yükleme bitince sohbetin mesajlarını yeniden yükler (yeniden hidrate). Şifresiz kanalda no-op.
 */
export function useBackupInChannel(encrypted: boolean, reload: () => void) {
  const router = useRouter();
  const backupState = useE2eeBackupStore((s) => s.state);
  const restoreTick = useE2eeBackupStore((s) => s.restoreTick);

  // Yedek durumu motor açılışında asenkron gelir; ikisi de izlenir, bayrak tek seferliktir.
  useEffect(() => {
    if (!encrypted || !backupState) return;
    let cancelled = false;
    void shouldPromptSetup().then((ask) => {
      if (ask && !cancelled) router.push({ pathname: '/backup-password', params: { mode: 'setup', prompt: '1' } });
    });
    return () => {
      cancelled = true;
    };
  }, [encrypted, backupState, router]);

  const seen = useRef(restoreTick);
  useEffect(() => {
    if (restoreTick === seen.current) return;
    seen.current = restoreTick;
    reload();
  }, [restoreTick, reload]);
}
