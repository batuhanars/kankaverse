import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';
import { toUserDto } from '../../auth/utils/user-dto.util';
import { DEFAULT_QUICK_REACTIONS } from '../../../common/quick-reactions';

const ok = async (quickReactions: unknown) =>
  (await validate(plainToInstance(UpdateProfileDto, { quickReactions }))).length === 0;

describe('UpdateProfileDto.quickReactions (C24)', () => {
  const five = ['👍', '❤️', '🔥', '👨‍👩‍👧', '🇹🇷'];

  it('tam 5 benzersiz emoji (ZWJ ve bayrak dahil) kabul', async () => {
    expect(await ok(five)).toBe(true);
  });
  it('boş dizi (varsayılana dön) kabul', async () => {
    expect(await ok([])).toBe(true);
  });
  it('alan verilmezse geçerli', async () => {
    expect((await validate(plainToInstance(UpdateProfileDto, {}))).length).toBe(0);
  });
  it('4 ve 6 eleman reddedilir', async () => {
    expect(await ok(five.slice(0, 4))).toBe(false);
    expect(await ok([...five, '😀'])).toBe(false);
  });
  it('tekrar reddedilir', async () => {
    expect(await ok(['👍', '👍', '🔥', '😀', '😢'])).toBe(false);
  });
  it('emoji olmayan / harf / rakam / boş / çoklu grafem reddedilir', async () => {
    for (const bad of ['a', '1', '', ' ', '👍👍', 'x👍', '1️⃣']) {
      expect(await ok(['😀', '🔥', '😢', '😮', bad])).toBe(false);
    }
  });
  it('32 karakterden uzun reddedilir', async () => {
    expect(await ok(['😀', '🔥', '😢', '😮', '👍‍'.repeat(20)])).toBe(false);
  });
  it('dizi olmayan reddedilir', async () => {
    expect(await ok('👍')).toBe(false);
  });
});

describe('toUserDto.quickReactions (C24)', () => {
  const base = { createdAt: new Date(), emailVerifiedAt: null } as never;
  it('kayıt yoksa varsayılan beşli', () => {
    expect(
      toUserDto({ ...(base as object), quickReactions: [] } as never, false).quickReactions,
    ).toEqual(DEFAULT_QUICK_REACTIONS);
  });
  it('kayıtlıysa kayıtlı liste', () => {
    const saved = ['🔥', '😀', '😢', '😮', '👍'];
    expect(
      toUserDto({ ...(base as object), quickReactions: saved } as never, false).quickReactions,
    ).toEqual(saved);
  });
});
