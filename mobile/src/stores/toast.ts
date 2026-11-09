import { create } from 'zustand';

/**
 * Uygulama içi toast. Android'in kendi toast'ı dokunulamadığı için (eylem düğmesi koyulamıyor) aynı
 * görünümde kendi yüzeyimiz: altta ortalı, tek seferde tek toast; yenisi eskisinin yerine geçer.
 * Bileşen: `components/AppToast.tsx`, `(app)/_layout.tsx` içinde bir kez mount edilir.
 */
export interface ToastAction {
  label: string;
  run: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  action?: ToastAction;
  durationMs: number;
}

/** Android `ToastAndroid.LONG` ile aynı süre. */
const DEFAULT_MS = 3500;
/** Düğme varsa basmaya vakit kalsın. */
const WITH_ACTION_MS = 6000;

interface ToastState {
  current: ToastItem | null;
  show: (message: string, action?: ToastAction) => void;
  hide: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, action) =>
    set({
      current: { id: ++counter, message, action, durationMs: action ? WITH_ACTION_MS : DEFAULT_MS },
    }),
  hide: (id) => set((s) => (s.current?.id === id ? { current: null } : s)),
}));

/** Bileşen dışından (soket dinleyicisi, effect temizliği) çağrı kolaylığı. */
export const showToast = (message: string, action?: ToastAction) =>
  useToastStore.getState().show(message, action);
