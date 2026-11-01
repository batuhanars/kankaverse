import { parseLastReaction, visibleLastReaction } from './last-reaction.util';

const base = {
  actorId: 'a',
  actorUsername: 'ali',
  emoji: '👍',
  messageId: 'm',
  at: '2026-11-01T10:00:00.000Z',
};
const none = () => false;

describe('last-reaction.util (C46 §4b)', () => {
  it('bozuk veri null döner', () => {
    expect(parseLastReaction(null)).toBeNull();
    expect(parseLastReaction('x')).toBeNull();
    expect(parseLastReaction([])).toBeNull();
    expect(parseLastReaction({ ...base, at: 'nope' })).toBeNull();
    expect(parseLastReaction({ ...base, emoji: 5 })).toBeNull();
    expect(parseLastReaction({ actorId: 'a' })).toBeNull();
    expect(parseLastReaction(base)).toEqual(base);
  });

  it('dört koşul: okunmamış, son mesajdan yeni, engelsiz', () => {
    const t = (s: string) => new Date(`2026-11-01T${s}.000Z`);
    const run = (over: object = {}) =>
      visibleLastReaction({
        raw: base,
        lastReadAt: t('09:00:00'),
        lastMessageAt: t('09:30:00'),
        blockedEitherWay: none,
        ...over,
      });
    expect(run()).toEqual(base);
    expect(run({ lastReadAt: null, lastMessageAt: null })).toEqual(base);
    expect(run({ lastReadAt: t('10:00:00') })).toBeNull(); // at <= lastReadAt
    expect(run({ lastReadAt: t('10:01:00') })).toBeNull();
    expect(run({ lastMessageAt: t('10:00:00') })).toBeNull(); // at <= son mesaj
    expect(run({ lastMessageAt: t('10:05:00') })).toBeNull();
    expect(run({ blockedEitherWay: (id: string) => id === 'a' })).toBeNull();
    expect(run({ raw: { junk: true } })).toBeNull();
  });
});
