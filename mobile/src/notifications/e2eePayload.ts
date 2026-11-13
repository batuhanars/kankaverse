/** E3: push verisindeki şifreli yük ayrıştırması (saf, platformdan bağımsız: birim test edilir). */

/** C66: üye değişikliği commit'leri (epoch artan, en çok 2); epoch = commit'in uygulandığı epoch, commit base64. */
export type PushCommit = { epoch: number; commit: string };
export type PushE2ee = {
  ciphertext: string;
  senderDeviceId: string;
  createdAt: string;
  frankingTag?: string;
  commits?: PushCommit[];
};

const MAX_PUSH_COMMITS = 2;

/** Geçersiz biçim (dizi değil, 2'den fazla, tipi yanlış öğe) yok sayılır: önizleme commit'siz yola düşer. */
function parseCommits(raw: unknown): PushCommit[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PUSH_COMMITS) return undefined;
  const out: PushCommit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined;
    const { epoch, commit } = item as Record<string, unknown>;
    if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch < 0) return undefined;
    if (typeof commit !== 'string' || !commit) return undefined;
    out.push({ epoch, commit });
  }
  return out;
}

/** Android'de nesne `dataString` JSON'u içinde nesne olarak gelir; string gelirse de çözülür. */
export function parseE2eePayload(raw: unknown): PushE2ee | null {
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== 'object') return null;
  const { ciphertext, senderDeviceId, createdAt } = v as Record<string, unknown>;
  if (typeof ciphertext !== 'string' || !ciphertext) return null;
  if (typeof senderDeviceId !== 'string' || !senderDeviceId) return null;
  if (typeof createdAt !== 'string' || !createdAt) return null;
  const { frankingTag } = v as Record<string, unknown>;
  const commits = parseCommits((v as Record<string, unknown>).commits);
  return {
    ciphertext,
    senderDeviceId,
    createdAt,
    ...(typeof frankingTag === 'string' && frankingTag ? { frankingTag } : {}),
    ...(commits ? { commits } : {}),
  };
}
