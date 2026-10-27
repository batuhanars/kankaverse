import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  channelNameError,
  graphemeLength,
  isSingleEmoji,
  isValidChannelName,
  normalizeChannelName,
  sanitizeChannelName,
} from './channel-name.util';
import { CreateChannelDto } from '../../modules/channels/dto/create-channel.dto';
import { CreateCategoryDto } from '../../modules/categories/dto/create-category.dto';
import { CreateRoleDto } from '../../modules/roles/dto/create-role.dto';
import { UpdateRoleDto } from '../../modules/roles/dto/update-role.dto';

const FAMILY = '👨‍👩‍👧‍👦';
const WAVE_TONE = '👋🏽';
const FLAG_TR = '🇹🇷';

describe('normalizeChannelName', () => {
  it.each([
    ['Oyun Odası', 'oyun-odası'],
    ['ISPARTA', 'ısparta'],
    ['İstanbul Sohbet', 'istanbul-sohbet'],
    ['📢 duyurular', '📢-duyurular'],
    ['a   b', 'a-b'],
    ['a---b', 'a-b'],
    ['  -genel- ', 'genel'],
    ['Genel  --  Sohbet', 'genel-sohbet'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeChannelName(input)).toBe(expected);
  });
});

describe('graphemeLength / isSingleEmoji', () => {
  it('ZWJ, ten rengi ve bayrak 1 grapheme sayılır', () => {
    expect(graphemeLength(FAMILY)).toBe(1);
    expect(graphemeLength(WAVE_TONE)).toBe(1);
    expect(graphemeLength(FLAG_TR)).toBe(1);
    expect(graphemeLength('❤️')).toBe(1);
  });

  it('tek emojiyi kabul eder, metni ve çoklu emojiyi reddeder', () => {
    for (const e of [FAMILY, WAVE_TONE, FLAG_TR, '🛡️', '😀']) expect(isSingleEmoji(e)).toBe(true);
    for (const e of ['', 'a', '😀😀', '😀a', '1', ' ']) expect(isSingleEmoji(e)).toBe(false);
  });
});

describe('isValidChannelName', () => {
  it('geçerli adlar', () => {
    for (const n of ['oyun-odası', '📢-duyurular', `${FAMILY}-aile`, `${FLAG_TR}-tr`, 'ab', '🎮-1'])
      expect(isValidChannelName(n)).toBe(true);
  });

  it('geçersizler', () => {
    expect(channelNameError('📢')).toMatch(/en az 2/);
    expect(channelNameError('📢📢')).toMatch(/harf veya rakam/);
    expect(channelNameError('a')).toMatch(/en az 2/);
    expect(channelNameError('a'.repeat(51))).toMatch(/en fazla 50/);
    expect(channelNameError('Abc')).toMatch(/yalnızca/);
    expect(channelNameError('a_b')).toMatch(/yalnızca/);
    expect(channelNameError('a b')).toMatch(/yalnızca/);
  });

  it('50 grapheme sınırı emojiyi tek sayar', () => {
    expect(isValidChannelName('a' + FAMILY.repeat(49))).toBe(true);
    expect(isValidChannelName('a' + FAMILY.repeat(50))).toBe(false);
  });
});

describe('sanitizeChannelName (Discord içe aktarma)', () => {
  it('izinsiz karakterleri tireye çevirir, geçerli ad üretir', () => {
    expect(sanitizeChannelName('Genel_Sohbet!')).toBe('genel-sohbet');
    expect(sanitizeChannelName('🔥・haberler')).toBe('🔥-haberler');
    expect(sanitizeChannelName('!!')).toBe('kanal');
  });
});

describe('DTO doğrulaması', () => {
  it('kanal adı normalleştirilir ve geçerli sayılır', async () => {
    const dto = plainToInstance(CreateChannelDto, { name: 'Oyun Odası' });
    expect(dto.name).toBe('oyun-odası');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('yalnız emoji kanal adı reddedilir', async () => {
    const dto = plainToInstance(CreateChannelDto, { name: '🎮🎮' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('kategori adı boşluk korur, emoji 1 grapheme', async () => {
    const ok = plainToInstance(CreateCategoryDto, { name: ` 🎮 Oyunlar ${FAMILY} ` });
    expect(ok.name).toBe(`🎮 Oyunlar ${FAMILY}`);
    expect(await validate(ok)).toHaveLength(0);
    const long = plainToInstance(CreateCategoryDto, { name: FAMILY.repeat(50) });
    expect(await validate(long)).toHaveLength(0);
    const tooLong = plainToInstance(CreateCategoryDto, { name: FAMILY.repeat(51) });
    expect(await validate(tooLong)).not.toHaveLength(0);
  });

  it('rol emojisi: tek emoji, null ve boş (kaldır) kabul; metin ve çoklu ret', async () => {
    const ok = plainToInstance(CreateRoleDto, { name: 'Mod', unicodeEmoji: FAMILY });
    expect(await validate(ok)).toHaveLength(0);
    const cleared = plainToInstance(UpdateRoleDto, { unicodeEmoji: '' });
    expect(cleared.unicodeEmoji).toBeNull();
    expect(await validate(cleared)).toHaveLength(0);
    const nulled = plainToInstance(UpdateRoleDto, { unicodeEmoji: null });
    expect(await validate(nulled)).toHaveLength(0);
    for (const bad of ['a', '😀😀', '😀a']) {
      const dto = plainToInstance(CreateRoleDto, { name: 'Mod', unicodeEmoji: bad });
      expect(await validate(dto)).not.toHaveLength(0);
    }
  });
});
