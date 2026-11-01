import http from './http';

// Sprint C14d: yapay zeka video üretimi (yalnız açık listedeki hesap; sunucu otorite, diğerlerine 403).
// Tipler `web/src/api/aiVideo.ts` ile aynı; `http` zarfı açtığı için `res.data` doğrudan veridir.
export type AiVideoStatus = 'QUOTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AiVideoDto {
  id: string;
  status: AiVideoStatus;
  model: string;
  resolution: string;
  durationS: number;
  /** null = Otomatik. */
  aspectRatio: string | null;
  prompt: string;
  hasInput: boolean;
  /** C33: kullanıcıya görünen birim kredi (USD alanları arayüzde kullanılmaz). */
  quoteCredits: number;
  costCredits: number | null;
  errorCode: string | null;
  createdAt: string;
  /** Yalnız COMPLETED, presigned GET 15 dk. */
  videoUrl?: string;
  /** Yalnız COMPLETED, Content-Disposition: attachment. */
  downloadUrl?: string;
}

export type AiVideoRefKind = 'image' | 'video' | 'audio';

/** C42: çoklu referans sınırları ve kabul edilen türler (Pika/Kling için null). */
export interface AiVideoReferencesOption {
  max: Record<AiVideoRefKind, number>;
  videoTotalMaxS: number;
  videoMaxS: number;
  audioMaxS: number;
  aspectRatios: string[];
  inputTypes: Record<AiVideoRefKind, string[]>;
}

export interface AiVideoReferenceInput {
  kind: AiVideoRefKind;
  key: string;
}

/** Teklif kipi: tek görsel `image`, başka her ek bileşimi `reference` (C42 §0 kip kuralı). */
export type AiVideoEstimateMode = { mode: 'text' | 'image' } | { mode: 'reference'; kinds: AiVideoRefKind[] };

export interface AiVideoModelOption {
  key: string;
  label: string;
  durations: number[];
  resolutions: string[];
  /** Görselde boş liste = ölçü görselden alınır. */
  aspectRatios: { text: string[]; image: string[] };
  supportsImage: boolean;
  audio: 'none' | 'default' | 'always';
  references: AiVideoReferencesOption | null;
}

export interface AiVideoOptionsDto {
  models: AiVideoModelOption[];
  /** C39: yalnız kilitli kullanıcıya dolu. */
  /** C39: web/masaüstü kullanır; mobilde kullanılmaz (C40, Play kuralı). */
  accessInviteCode?: string | null;
  /** C40/C43: hak özeti (hak varsa; yoksa null). */
  grant?: { usedCredits: number; remainingCredits: number; budgetCredits: number; expiresAt: string | null } | null;
}

export interface AiVideoSelection {
  model: string;
  resolution: string;
  durationS: number;
  /** Yoksa Otomatik. */
  aspectRatio?: string;
}

export const aiVideoApi = {
  async presignInput(contentType: string, size: number) {
    const res = await http.post<{ uploadUrl: string; inputKey: string }>('/ai-video/input/presign', {
      contentType,
      size,
    });
    return res.data;
  },
  async options() {
    return (await http.get<AiVideoOptionsDto>('/ai-video/options')).data;
  },
  async estimate(sel: AiVideoSelection, kip: AiVideoEstimateMode) {
    // `withImage` DTO'da zorunlu: referans kipinde de gider (sunucu orada yok sayar), yoksa teklif 400 ile düşer.
    const extra = kip.mode === 'reference' ? { referenceKinds: kip.kinds } : {};
    const body = { ...sel, withImage: kip.mode === 'image', ...extra };
    return (await http.post<{ estimateCredits: number }>('/ai-video/estimate', body)).data;
  },
  /** Tek görsel: eski `inputKey` yolu. Diğer her ek bileşimi: `references` (ikisi birlikte gönderilmez). */
  async create(
    sel: AiVideoSelection,
    prompt: string,
    input: { inputKey?: string; references?: AiVideoReferenceInput[] } = {},
  ) {
    const body = {
      ...sel,
      prompt,
      ...(input.inputKey ? { inputKey: input.inputKey } : {}),
      ...(input.references?.length ? { references: input.references } : {}),
    };
    return (await http.post<AiVideoDto>('/ai-video', body)).data;
  },
  async createAttachment(id: string) {
    return (await http.post<{ attachmentId: string }>(`/ai-video/${id}/attachment`)).data;
  },
  async list() {
    return (await http.get<AiVideoDto[]>('/ai-video')).data;
  },
  async remove(id: string) {
    await http.delete(`/ai-video/${id}`);
  },
  async removeAll() {
    await http.delete('/ai-video');
  },
  async get(id: string) {
    return (await http.get<AiVideoDto>(`/ai-video/${id}`)).data;
  },
};
