import { StreamInfo } from './providers/stream-provider';
import { isRiskyStream } from './stream-risk.util';

const base: StreamInfo = {
  title: 't',
  categoryId: '1',
  categoryName: 'Valorant',
  mature: false,
  labels: [],
  channelSlug: 'x',
};

describe('isRiskyStream (C36 §5.3)', () => {
  it('sıradan oyun riskli değil', () => {
    expect(isRiskyStream('kick', base)).toBe(false);
    expect(isRiskyStream('twitch', base)).toBe(false);
  });

  it('okunamadı (null) → riskli (fail-closed)', () => {
    expect(isRiskyStream('kick', null)).toBe(true);
    expect(isRiskyStream('twitch', null)).toBe(true);
  });

  it.each(['Slots & Casino', 'Poker', 'Sports Betting', 'Rulet', 'Kumar', 'Blackjack'])(
    'kumar kategorisi %s riskli',
    (name) => {
      expect(isRiskyStream('kick', { ...base, categoryName: name })).toBe(true);
      expect(isRiskyStream('twitch', { ...base, categoryName: name })).toBe(true);
    },
  );

  it('yapılandırmadaki ek kategori kimliği riskli', () => {
    expect(isRiskyStream('kick', { ...base, categoryId: '777' }, ['777'])).toBe(true);
    expect(isRiskyStream('kick', { ...base, categoryId: '778' }, ['777'])).toBe(false);
  });

  it('platform yetişkin işareti riskli', () => {
    expect(isRiskyStream('kick', { ...base, mature: true })).toBe(true);
    expect(isRiskyStream('twitch', { ...base, mature: true })).toBe(true);
  });

  it.each([
    'Gambling',
    'MatureGame',
    'SexualThemes',
    'DrugsIntoxication',
    'ViolentGraphic',
    'ProfanityVulgarity',
  ])('Twitch etiketi %s riskli', (label) => {
    expect(isRiskyStream('twitch', { ...base, labels: [label] })).toBe(true);
  });

  it('siyaset etiketi riskli sayılmaz; Kick etiketleri Twitch etiketi kuralına tabi değil', () => {
    expect(isRiskyStream('twitch', { ...base, labels: ['DebatedSocialIssuesAndPolitics'] })).toBe(
      false,
    );
    expect(isRiskyStream('kick', { ...base, labels: ['Gambling'] })).toBe(false);
  });
});
