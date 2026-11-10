import { HttpException, HttpStatus } from '@nestjs/common';

/** Standart base64 (padding'li) → bayt. Geçersiz biçim DTO katmanında (`IsBase64`) yakalanır. */
export function fromB64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, 'base64')); // Prisma Bytes: ArrayBuffer tabanlı Uint8Array ister
}

export function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

/** Türkçe mesaj + makine kodu ile envelope'lenecek hata (GlobalExceptionFilter okur). */
export function e2eeError(status: HttpStatus, message: string, error: string): HttpException {
  return new HttpException({ message, error }, status);
}

export const E2EE_ERRORS = {
  disabled: () =>
    e2eeError(HttpStatus.NOT_FOUND, 'Uçtan uca şifreleme bu hesap için kapalı.', 'E2EE_DISABLED'),
  deviceRequired: () =>
    e2eeError(
      HttpStatus.FORBIDDEN,
      'Bu işlem için bu oturumda etkin bir şifreleme cihazı gerekir.',
      'E2EE_DEVICE_REQUIRED',
    ),
  notEligible: () =>
    e2eeError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Bu sohbet uçtan uca şifrelenemez.',
      'E2EE_NOT_ELIGIBLE',
    ),
  required: () =>
    e2eeError(
      HttpStatus.CONFLICT,
      'Bu sohbet uçtan uca şifreli; mesaj şifreli gönderilmeli.',
      'E2EE_REQUIRED',
    ),
  notEncrypted: () =>
    e2eeError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Bu sohbet şifreli değil; şifreli mesaj gönderilemez.',
      'E2EE_NOT_ENCRYPTED',
    ),
  invalidPayload: (message: string) =>
    e2eeError(HttpStatus.BAD_REQUEST, message, 'E2EE_INVALID_PAYLOAD'),
};
