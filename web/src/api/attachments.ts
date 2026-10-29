// Sprint 5 §4 — Attachment API
// Presign → istemci S3'e ham PUT → mesaja attachmentIds ile iliştirilir.
// GET /attachments/:id kısa ömürlü presigned URL döndürür (envelope içinde).

import axios from 'axios'
import http from './axios'

export interface PresignPayload {
  filename: string
  contentType: string
  size: number
  durationMs?: number // M6b — yalnız audio/* (1..300000)
  waveform?: string // M6b §7 — base64, 64 bayt, yalnız audio/*
  // M6c — yalnız video/*
  thumbnail?: string // base64 JPEG (data: öneksiz, ≤ 40000)
  width?: number
  height?: number
}

export interface PresignResult {
  attachmentId: string
  uploadUrl: string
  storageKey: string
}

export interface AttachmentUrlResult {
  url: string
}

// Presigned PUT URL al ve Attachment kaydını oluştur (envelope içinde, auth ile)
export function presign(payload: PresignPayload) {
  return http.post<PresignResult>('/attachments/presign', payload)
}

// Kısa ömürlü presigned GET URL al (envelope içinde, auth ile)
export function getUrl(id: string) {
  return http.get<AttachmentUrlResult>(`/attachments/${id}`)
}

// C15: download=true → imzalı adres Content-Disposition: attachment taşır (erişim/tarama kapısı aynı)
export function getDownloadUrl(id: string, opts: { download: boolean } = { download: true }) {
  return http.get<AttachmentUrlResult>(`/attachments/${id}`, {
    params: opts.download ? { download: 1 } : undefined,
  })
}

// Ham PUT — presigned URL'e doğrudan S3'e yükle.
// Global axios instance KULLANILMAZ: envelope interceptor yok, Authorization header yok.
// transformRequest: [(d) => d] — axios'un body'yi dönüştürmesini engeller (ham binary).
export function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return axios
    .put(uploadUrl, file, {
      headers: { 'Content-Type': file.type },
      transformRequest: [(d: unknown) => d],
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
    })
    .then(() => undefined)
}

// C30: mesaj ekini iletmek için kopyala → yeni bekleyen ek (mesaj göndermez; istemci attachmentIds ile gönderir)
export function forward(id: string) {
  return http.post<{ attachmentId: string }>(`/attachments/${id}/forward`)
}

export const attachmentsApi = { presign, getUrl, getDownloadUrl, uploadToS3, forward }
