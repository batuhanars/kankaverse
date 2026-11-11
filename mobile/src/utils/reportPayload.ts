import type { CreateReportPayload, ReportEvidenceItem, ReportReason, ReportTargetType } from '@/api/reports';

/**
 * E4 §4.1 — şikâyet yükünün kurulumu (web `ReportModal.vue` `gatherEvidence` + `submit` karşılığı).
 * Platformdan bağımsız saf mantık: native modül import edilmez ki cihazsız sınanabilsin.
 */

/** Ekrandaki listeden kanıt için gereken alanlar (`MessageDto`nun alt kümesi). */
export interface EvidenceCandidate {
  id: string;
  createdAt: string;
  encrypted?: boolean;
  localStatus?: 'sending' | 'failed';
}

export interface ReportTarget {
  targetType: ReportTargetType;
  targetId: string;
  /** Yalnız MESSAGE: mesajın kanalı. Şifreli DM'de kanıt için ekrandaki listeye bakılır. */
  channelId?: string;
}

/** Kendi mesajın şikâyet edilmez (web kuralı); gönderilmemiş (yerel) mesajın sunucuda kaydı da yok. */
export function canReportMessage(authorId: string, myId: string | undefined, localStatus?: string): boolean {
  return !!myId && authorId !== myId && !localStatus;
}

/**
 * Şifreli DM'deki mesajın şikâyetinde hedef + ondan önceki en çok 5 çözülmüş mesaj (E4 §4). `messages` ESKİDEN
 * YENİYE sıralıdır (mesaj deposunun sırası). Şifresiz mesajda kanıt YOK (sunucu kendisi okur). Toplanamazsa ya da
 * motor boş dönerse `undefined`: kanıt hatası şikâyeti ENGELLEMEZ, şikâyet yalnız referansla gider.
 */
export async function gatherEvidence(
  target: ReportTarget,
  messages: EvidenceCandidate[],
  collect: (channelId: string, targetId: string, older: EvidenceCandidate[]) => Promise<ReportEvidenceItem[]>,
  logError: (e: unknown) => void,
): Promise<ReportEvidenceItem[] | undefined> {
  if (target.targetType !== 'MESSAGE' || !target.channelId) return undefined;
  const idx = messages.findIndex((m) => m.id === target.targetId);
  if (idx === -1 || !messages[idx].encrypted) return undefined;
  try {
    const older = messages.slice(0, idx).filter((m) => !m.localStatus);
    const items = await collect(target.channelId, target.targetId, older);
    return items.length ? items : undefined;
  } catch (e) {
    logError(e);
    return undefined;
  }
}

export function buildReportPayload(
  target: ReportTarget,
  reason: ReportReason,
  description: string,
  evidence: ReportEvidenceItem[] | undefined,
): CreateReportPayload {
  return {
    targetType: target.targetType,
    targetId: target.targetId,
    reason,
    description: description.trim() || undefined,
    evidence,
  };
}
