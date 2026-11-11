import { create } from 'zustand';
import type { ReportTarget } from '@/utils/reportPayload';

/**
 * E4 §4.1 — şikâyet panelinin tek açıcısı. Giriş noktaları (mesaj menüsü, profil paneli, DM listesi, ortam menüsü)
 * kendi panelini KAPATIR, sonra `openReport` çağırır; panel `(app)/_layout.tsx`te bir kez mount edilir
 * (`AppToast` deseni). İç içe modal açılmaz (Android'de güvenilmez), dört yere ayrı ayrı panel gömülmez.
 */
interface ReportState {
  target: ReportTarget | null;
  openReport: (target: ReportTarget) => void;
  closeReport: () => void;
}

export const useReportStore = create<ReportState>((set) => ({
  target: null,
  openReport: (target) => set({ target }),
  closeReport: () => set({ target: null }),
}));
