import http from './axios'

// Sprint C14b §2.2: yapay zeka video üretimi (yalnız açık listedeki hesap; diğerlerine jenerik 403).
export type AiVideoStatus = 'QUOTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'

export interface AiVideoDto {
  id: string
  status: AiVideoStatus
  model: string
  resolution: string
  durationS: number
  prompt: string
  hasInput: boolean
  quoteUsd: number
  costUsd: number | null
  errorCode: string | null
  createdAt: string
  videoUrl?: string // yalnız COMPLETED, presigned GET 15 dk
  downloadUrl?: string // yalnız COMPLETED, Content-Disposition: attachment
}

export interface AiVideoModelOption {
  key: string
  label: string
  durations: number[]
  resolutions: string[]
  supportsImage: boolean
  audio: 'none' | 'default' | 'always'
}

export interface AiVideoOptionsDto {
  models: AiVideoModelOption[]
  dailyCapUsd: number
  todaySpentUsd: number
}

export interface AiVideoSelection {
  model: string
  resolution: string
  durationS: number
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
  estimate(sel: AiVideoSelection, withImage: boolean) {
    return http.post<{ quoteUsd: number }>('/ai-video/estimate', { ...sel, withImage })
  },
  create(sel: AiVideoSelection, prompt: string, inputKey?: string) {
    return http.post<AiVideoDto>('/ai-video', { ...sel, prompt, ...(inputKey && { inputKey }) })
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
