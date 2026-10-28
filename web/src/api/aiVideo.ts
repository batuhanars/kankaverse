import http from './axios'

// Sprint C14 §2.3 — yapay zeka video üretimi (yalnız açık listedeki hesap; diğerlerine jenerik 403).
export type AiVideoStatus = 'QUOTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface AiVideoDto {
  id: string
  status: AiVideoStatus
  prompt: string
  hasInput: boolean
  quoteUsd: number
  costUsd: number | null
  errorCode: string | null
  createdAt: string
  videoUrl?: string // yalnız COMPLETED, presigned GET 15 dk
}

export interface AiVideoQuoteDto {
  generationId: string
  quoteUsd: number
  todaySpentUsd: number
  dailyCapUsd: number
}

export const aiVideoApi = {
  presignInput(contentType: string, size: number) {
    return http.post<{ uploadUrl: string; inputKey: string }>('/ai-video/input/presign', {
      contentType,
      size,
    })
  },
  quote(prompt: string, inputKey?: string) {
    return http.post<AiVideoQuoteDto>('/ai-video/quote', { prompt, ...(inputKey && { inputKey }) })
  },
  submit(id: string) {
    return http.post<AiVideoDto>(`/ai-video/${id}/submit`)
  },
  list() {
    return http.get<AiVideoDto[]>('/ai-video')
  },
  get(id: string) {
    return http.get<AiVideoDto>(`/ai-video/${id}`)
  },
}
