import http from './http';

// Sprint M1a contract §5.5 (🔴 T&S kapısı) — mesajdaki ek kaydı URL İÇERMEZ; gerçek indirme
// adresi bu uçtan alınır (erişim kontrolü + tarama kapısı sunucuda; api/src/modules/attachments/
// attachments.controller.ts `getDownloadUrl`).
export interface AttachmentUrlResult {
  url: string;
}

/** Sprint M3c §3 — `POST /attachments/presign` gövdesi (`PresignAttachmentDto` birebir). */
export interface PresignAttachmentPayload {
  filename: string;
  contentType: string;
  size: number;
  /** M6b — yalnız sesli mesajda, ms cinsinden tam sayı (1..300000). */
  durationMs?: number;
  /** M6b §7 — 64 baytlık dalga, base64 (88 karakter). */
  waveform?: string;
  /** M6c — yalnız videoda: base64 JPEG küçük resim + boyutlar. */
  thumbnail?: string;
  width?: number;
  height?: number;
}

/** Presign yanıtı (`attachments.service.ts` `presign` dönüşü birebir). */
export interface AttachmentPresignResult {
  attachmentId: string;
  uploadUrl: string;
  storageKey: string;
}

export const attachmentsApi = {
  async getUrl(id: string): Promise<AttachmentUrlResult> {
    const res = await http.get<AttachmentUrlResult>(`/attachments/${id}`);
    return res.data;
  },

  /**
   * Sprint M3c §3 adım 1 — yükleme izni + boş `Attachment` kaydı (PENDING, `messageId = null`).
   *
   * 🔴 Kapılar SUNUCUDA ve istemci hiçbirini yeniden hesaplamaz: `uploadsEnabled` (kapalıysa 403
   * `UPLOADS_DISABLED`), boyut (`FILE_TOO_LARGE`), tür allowlist'i (`UNSUPPORTED_TYPE`) ve
   * `VerifiedEmailGuard`. `UPLOADS_ENABLED=false` için istemciye bayrak TAŞINMAZ — 403'ün Türkçe
   * mesajı otoritedir (sözleşme §3, web'in bugünkü davranışıyla aynı).
   */
  async presign(payload: PresignAttachmentPayload): Promise<AttachmentPresignResult> {
    const res = await http.post<AttachmentPresignResult>('/attachments/presign', payload);
    return res.data;
  },
};
