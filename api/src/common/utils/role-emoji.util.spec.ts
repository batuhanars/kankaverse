import { loadRoleEmojis, pickRoleEmoji } from './role-emoji.util';
import type { PrismaService } from '../../prisma/prisma.service';

describe('pickRoleEmoji', () => {
  it('emojisi olan en yüksek pozisyonlu rolün emojisini seçer', () => {
    expect(
      pickRoleEmoji([
        { position: 5, unicodeEmoji: null },
        { position: 3, unicodeEmoji: '🛡️' },
        { position: 1, unicodeEmoji: '⭐' },
      ]),
    ).toBe('🛡️');
  });

  it('emoji yoksa veya liste boşsa null', () => {
    expect(pickRoleEmoji([{ position: 2, unicodeEmoji: null }])).toBeNull();
    expect(pickRoleEmoji([])).toBeNull();
    expect(pickRoleEmoji(undefined)).toBeNull();
  });
});

describe('loadRoleEmojis', () => {
  it('kullanıcı başına en yüksek pozisyonlu emojiyi tek sorguda döndürür', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { member: { userId: 'u1' }, role: { position: 1, unicodeEmoji: '⭐' } },
      { member: { userId: 'u1' }, role: { position: 4, unicodeEmoji: '🛡️' } },
      { member: { userId: 'u2' }, role: { position: 2, unicodeEmoji: '🎮' } },
    ]);
    const prisma = { guildMemberRole: { findMany } } as unknown as PrismaService;
    const map = await loadRoleEmojis(prisma, 'g1', ['u1', 'u2', 'u3']);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(map.get('u1')).toBe('🛡️');
    expect(map.get('u2')).toBe('🎮');
    expect(map.has('u3')).toBe(false);
  });

  it('boş kullanıcı listesinde sorgu atmaz', async () => {
    const findMany = jest.fn();
    const prisma = { guildMemberRole: { findMany } } as unknown as PrismaService;
    expect((await loadRoleEmojis(prisma, 'g1', [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
