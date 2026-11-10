import { canModerateGroupTarget, isGroupManager } from './group-roles';

describe('[R7] grup DM yetki hiyerarşisi', () => {
  it('kurucu üyeyi ve yöneticiyi yönetir, kendini (kurucuyu) değil', () => {
    expect(canModerateGroupTarget('owner', 'member')).toBe(true);
    expect(canModerateGroupTarget('owner', 'admin')).toBe(true);
    expect(canModerateGroupTarget('owner', 'owner')).toBe(false);
  });

  it('yönetici yalnız normal üyeyi yönetir', () => {
    expect(canModerateGroupTarget('admin', 'member')).toBe(true);
    expect(canModerateGroupTarget('admin', 'admin')).toBe(false);
    expect(canModerateGroupTarget('admin', 'owner')).toBe(false);
  });

  it('üye kimseyi yönetemez', () => {
    expect(canModerateGroupTarget('member', 'member')).toBe(false);
    expect(canModerateGroupTarget('member', 'admin')).toBe(false);
    expect(canModerateGroupTarget('member', 'owner')).toBe(false);
  });

  it('yeniden adlandırma kurucu ve yöneticide', () => {
    expect(isGroupManager('owner')).toBe(true);
    expect(isGroupManager('admin')).toBe(true);
    expect(isGroupManager('member')).toBe(false);
  });
});
