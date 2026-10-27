import { toUserDto } from './user-dto.util';

const USER = {
  id: 'u1',
  username: 'kanka',
  email: 'k@example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  emailVerifiedAt: null,
} as any;

describe('toUserDto animatedAllowed (C22)', () => {
  it('kapı açıkken true döner', () => {
    expect(toUserDto(USER, true).animatedAllowed).toBe(true);
  });

  it('kapı kapalıyken false döner', () => {
    expect(toUserDto(USER, false).animatedAllowed).toBe(false);
  });
});
