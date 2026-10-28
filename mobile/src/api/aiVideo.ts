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
  quoteUsd: number;
  costUsd: number | null;
  errorCode: string | null;
  createdAt: string;
  /** Yalnız COMPLETED, presigned GET 15 dk. */
  videoUrl?: string;
  /** Yalnız COMPLETED, Content-Disposition: attachment. */
  downloadUrl?: string;
}

export interface AiVideoModelOption {
  key: string;
  label: string;
  durations: number[];
  resolutions: string[];
  /** Görselde boş liste = ölçü görselden alınır. */
  aspectRatios: { text: string[]; image: string[] };
  supportsImage: boolean;
  audio: 'none' | 'default' | 'always';
}

export interface AiVideoOptionsDto {
  models: AiVideoModelOption[];
  dailyCapUsd: number;
  todaySpentUsd: number;
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
  async estimate(sel: AiVideoSelection, withImage: boolean) {
    return (await http.post<{ quoteUsd: number }>('/ai-video/estimate', { ...sel, withImage })).data;
  },
  async create(sel: AiVideoSelection, prompt: string, inputKey?: string) {
    return (await http.post<AiVideoDto>('/ai-video', { ...sel, prompt, ...(inputKey ? { inputKey } : {}) })).data;
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
