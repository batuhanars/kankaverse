import { randomInt } from 'crypto';

/** Rastgele 4 haneli zero-padded etiket ("0000".."9999"). Arkadaş lookup'ı username+tag çiftiyle yapılır. */
export function generateFriendTag(): string {
  return randomInt(0, 10000).toString().padStart(4, '0');
}
