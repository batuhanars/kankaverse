import { ForbiddenException } from '@nestjs/common';

/** OWNER veya ADMIN rolü gerektirir, aksi hâlde 403 FORBIDDEN */
export function requireAdminRole(role: string) {
  if (role !== 'OWNER' && role !== 'ADMIN') {
    throw new ForbiddenException({ message: 'Bu işlem için yetkiniz yok.', error: 'FORBIDDEN' });
  }
}
