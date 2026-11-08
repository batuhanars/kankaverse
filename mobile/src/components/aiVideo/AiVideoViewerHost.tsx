import { useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { AiVideoSheet } from './AiVideoSheet';

/**
 * C49: bildirimden açılan yapay zeka video sayfası (view kipi). `(app)` düzeyinde TEK örnek;
 * `openId` store'dan gelir (bildirim listesi ve push yönlendirmesi `open(id)` çağırır).
 */
export function AiVideoViewerHost() {
  const openId = useAiVideoViewerStore((s) => s.openId);
  const close = useAiVideoViewerStore((s) => s.close);
  return <AiVideoSheet visible={openId !== null} mode="view" initialId={openId} onClose={close} />;
}
