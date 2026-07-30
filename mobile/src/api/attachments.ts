import http from './http';

// Sprint M1a contract §5.5 (🔴 T&S kapısı) — mesajdaki ek kaydı URL İÇERMEZ; gerçek indirme
// adresi bu uçtan alınır (erişim kontrolü + tarama kapısı sunucuda; api/src/modules/attachments/
// attachments.controller.ts `getDownloadUrl`). Yükleme (presign) bu sprintte kullanılmaz.
export interface AttachmentUrlResult {
  url: string;
}

export const attachmentsApi = {
  async getUrl(id: string): Promise<AttachmentUrlResult> {
    const res = await http.get<AttachmentUrlResult>(`/attachments/${id}`);
    return res.data;
  },
};
