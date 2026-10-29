import { RecentGamePurgeJob } from './recent-game-purge.job';

describe('RecentGamePurgeJob', () => {
  it('7 günden eski satırları siler', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const job = new RecentGamePurgeJob({ recentGame: { deleteMany } } as any);
    const before = Date.now();
    await job.run();
    const cutoff: Date = deleteMany.mock.calls[0][0].where.lastPlayedAt.lt;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(before - cutoff.getTime()).toBeGreaterThanOrEqual(sevenDays);
    expect(before - cutoff.getTime()).toBeLessThan(sevenDays + 5000);
  });
});
