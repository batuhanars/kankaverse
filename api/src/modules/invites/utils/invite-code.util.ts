import { generateShortCode } from '../../../common/utils/short-code.util';

/** Tahmin edilemez 8 karakterlik URL-safe base32 davet kodu üretir. */
export function generateInviteCode(): string {
  return generateShortCode(8);
}
