import http from './axios'

// Sprint C14b §2.2: yapay zeka video üretimi (yalnız açık listedeki hesap; diğerlerine jenerik 403).
export type AiVideoStatus = 'QUOTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface AiVideoDto {
  id: string
  status: AiVideoStatus
  model: string
  resolution: string
  durationS: number
  aspectRatio: string | null // null = Otomatik
  prompt: string
  hasInput: boolean
  quoteCredits: number // C33: kullanıcıya görünen birim kredi (USD alanları arayüzde kullanılmaz)
  costCredits: number | null
  errorCode: string | null
  createdAt: string
  videoUrl?: string // yalnız COMPLETED, presigned GET 15 dk
  downloadUrl?: string // yalnız COMPLETED, Content-Disposition: attachment
}

// C42: referans (görsel + video + ses) kipi; Pika/Kling için model öğesinde `references: null`
export type AiVideoRefKind = 'image' | 'video' | 'audio'

export interface AiVideoReferencesOption {
  max: Record<AiVideoRefKind, number>
  videoTotalMaxS: number
  videoMaxS: number
  audioMaxS: number
  /** 2026-11-22: seslerin toplam süresi. */
  audioTotalMaxS: number
  /** 2026-11-22: video/ses için en kısa süre (0 = sınır yok). */
  minS: number
  /** 2026-11-22: referans kipinin süreleri (null = modelin süreleri; Veo [8]). */
  durations: number[] | null
  aspectRatios: string[]
  inputTypes: Record<AiVideoRefKind, string[]>
}

export interface AiVideoReferenceInput {
  kind: AiVideoRefKind
  key: string
}

export interface AiVideoModelOption {
  key: string
  label: string
  durations: number[]
  resolutions: string[]
  aspectRatios: { text: string[]; image: string[] } // görselde boş = ölçü görselden alınır
  supportsImage: boolean
  audio: 'none' | 'default' | 'always'
  references: AiVideoReferencesOption | null
}

// C40: admin hakkı özeti (kalan/bütçe kredi + isteğe bağlı bitiş)
export interface AiVideoGrantInfo {
  usedCredits: number
  remainingCredits: number
  budgetCredits: number
  expiresAt: string | null
}

export interface AiVideoOptionsDto {
  models: AiVideoModelOption[]
  accessInviteCode?: string | null // C39: yalnız kilitli kullanıcıya dolu
  grant?: AiVideoGrantInfo | null // C40/C43: hak varsa (env listesinde olsa da); hak yoksa null
}

export interface AiVideoSelection {
  model: string
  resolution: string
  durationS: number
  aspectRatio?: string // yoksa Otomatik
}

export const aiVideoApi = {
  presignInput(contentType: string, size: number) {
    return http.post<{ uploadUrl: string; inputKey: string }>('/ai-video/input/presign', {
      contentType,
      size,
    })
  },
  options() {
    return http.get<AiVideoOptionsDto>('/ai-video/options')
  },
  /** `referenceKinds` verilirse kip referanstır ve `withImage` yok sayılır (C42). */
  estimate(sel: AiVideoSelection, withImage: boolean, referenceKinds?: AiVideoRefKind[]) {
    return http.post<{ estimateCredits: number }>('/ai-video/estimate', {
      ...sel,
      withImage,
      ...(referenceKinds && { referenceKinds }),
    })
  },
  /** Tek görsel → `inputKey` (eski yol); aksi halde `references`. İkisi birlikte gönderilmez. */
  create(
    sel: AiVideoSelection,
    prompt: string,
    input: { inputKey?: string; references?: AiVideoReferenceInput[] } = {},
  ) {
    return http.post<AiVideoDto>('/ai-video', {
      ...sel,
      prompt,
      ...(input.inputKey && { inputKey: input.inputKey }),
      ...(input.references && { references: input.references }),
    })
  },
  createAttachment(id: string) {
    return http.post<{ attachmentId: string }>(`/ai-video/${id}/attachment`)
  },
  list() {
    return http.get<AiVideoDto[]>('/ai-video')
  },
  remove(id: string) {
    return http.delete(`/ai-video/${id}`)
  },
  removeAll() {
    return http.delete<{ deleted: number }>('/ai-video')
  },
  get(id: string) {
    return http.get<AiVideoDto>(`/ai-video/${id}`)
  },
}
