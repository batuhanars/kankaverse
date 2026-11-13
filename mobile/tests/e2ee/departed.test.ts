import { describe, expect, it } from 'vitest';
import { isDepartedGroup } from '../../src/e2ee/departed';

const left = { leftAt: '2026-11-13T10:00:00.000Z', reason: 'LEFT' };

describe('isDepartedGroup (eski grupta E2EE ağa çıkmaz kapısı)', () => {
  it('departed dolu grup: true', () => {
    expect(isDepartedGroup([{ id: 'g1', type: 'GROUP_DM', departed: left }], 'g1')).toBe(true);
  });
  it('aktif grup (null/yok): false', () => {
    expect(isDepartedGroup([{ id: 'g1', type: 'GROUP_DM', departed: null }], 'g1')).toBe(false);
    expect(isDepartedGroup([{ id: 'g1', type: 'GROUP_DM' }], 'g1')).toBe(false);
  });
  it('1-1 DM ve bilinmeyen kanal: false', () => {
    expect(isDepartedGroup([{ id: 'd1', type: 'DM', departed: left }], 'd1')).toBe(false);
    expect(isDepartedGroup([], 'x')).toBe(false);
  });
});
