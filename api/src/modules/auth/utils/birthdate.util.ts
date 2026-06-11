import { UnprocessableEntityException } from '@nestjs/common';

export const MIN_AGE = 13;
export const MAX_AGE = 120;

/** Doğum tarihinden bugüne tam yaş (T&S yaş kapısı). Saf fonksiyon — 2B yaş-günü job'ı da kullanır. */
export function calculateAge(birthDate: Date): number {
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

export function calculateIsMinor(birthDate: Date): boolean {
  return calculateAge(birthDate) < 18;
}

/**
 * Kayıt doğum tarihini doğrular (otorite backend, brief §8 / contract §12).
 * Geçersiz/gelecek/aşırı yaş → INVALID_BIRTHDATE; 13 altı → UNDERAGE.
 */
export function validateBirthDate(raw: string): Date {
  const birthDate = new Date(raw);
  if (isNaN(birthDate.getTime())) {
    throw new UnprocessableEntityException({ message: 'Geçersiz doğum tarihi.', error: 'INVALID_BIRTHDATE' });
  }
  if (birthDate >= new Date()) {
    throw new UnprocessableEntityException({ message: 'Doğum tarihi geçmişte olmalıdır.', error: 'INVALID_BIRTHDATE' });
  }
  const age = calculateAge(birthDate);
  if (age > MAX_AGE) {
    throw new UnprocessableEntityException({ message: 'Geçersiz doğum tarihi.', error: 'INVALID_BIRTHDATE' });
  }
  if (age < MIN_AGE) {
    throw new UnprocessableEntityException({ message: 'Kayıt için en az 13 yaşında olmalısın.', error: 'UNDERAGE' });
  }
  return birthDate;
}
