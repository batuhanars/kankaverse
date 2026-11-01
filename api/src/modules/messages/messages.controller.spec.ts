import { Logger } from '@nestjs/common';
import { MessagesController } from './messages.controller';

// C29 — gönderim sonrası bildirimler cevabı bloklamaz; hata cevabı bozmaz, loglanır.

const MESSAGE = { id: 'msg-1', channelId: 'ch-1', content: 'selam', nonce: 'n-1' };

function makeController() {
  const service = { create: jest.fn().mockResolvedValue(MESSAGE) };
  const gateway = {
    broadcastMessage: jest.fn(),
    notifyDmActivity: jest.fn().mockResolvedValue(undefined),
    notifyChannelActivity: jest.fn().mockResolvedValue(undefined),
    notifyMentions: jest.fn().mockResolvedValue(undefined),
  };
  const audioNormalize = { enqueueFromMessage: jest.fn() };
  const reactionNotifier = {
    notifyAdded: jest.fn().mockResolvedValue(undefined),
    notifyRemoved: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new MessagesController(
    service as any,
    gateway as any,
    audioNormalize as any,
    reactionNotifier as any,
  );
  return { controller, service, gateway, audioNormalize, reactionNotifier };
}

describe('MessagesController.sendMessage — C29', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errorSpy.mockRestore());

  it('nonce taşıyan mesajı döner, broadcast senkron çağrılır', async () => {
    const { controller, gateway } = makeController();

    const result = await controller.sendMessage({ id: 'u1' }, 'ch-1', {
      content: 'selam',
      nonce: 'n-1',
    });

    expect(result).toBe(MESSAGE);
    expect(gateway.broadcastMessage).toHaveBeenCalledWith('ch-1', MESSAGE);
  });

  it('üç bildirim de sırayla çağrılır (davranış değişmedi)', async () => {
    const { controller, gateway } = makeController();
    const order: string[] = [];
    gateway.notifyDmActivity.mockImplementation(() => {
      order.push('dm');
      return Promise.resolve();
    });
    gateway.notifyChannelActivity.mockImplementation(() => {
      order.push('channel');
      return Promise.resolve();
    });
    gateway.notifyMentions.mockImplementation(() => {
      order.push('mentions');
      return Promise.resolve();
    });

    await controller.sendMessage({ id: 'u1' }, 'ch-1', { content: 'selam' });
    await new Promise((r) => setImmediate(r));

    expect(order).toEqual(['dm', 'channel', 'mentions']);
  });

  it('cevap bildirimleri beklemez (bildirim asılı kalsa bile döner)', async () => {
    const { controller, gateway } = makeController();
    gateway.notifyDmActivity.mockReturnValue(new Promise(() => undefined));

    const result = await controller.sendMessage({ id: 'u1' }, 'ch-1', { content: 'selam' });

    expect(result).toBe(MESSAGE);
  });

  it('C32: mesaj döndükten sonra ses eşitleme sıraya alınır', async () => {
    const { controller, audioNormalize } = makeController();

    const result = await controller.sendMessage({ id: 'u1' }, 'ch-1', { content: 'selam' });

    expect(result).toBe(MESSAGE);
    expect(audioNormalize.enqueueFromMessage).toHaveBeenCalledWith(MESSAGE);
  });

  it('bildirim hatası cevabı bozmaz ve loglanır', async () => {
    const { controller, gateway } = makeController();
    gateway.notifyChannelActivity.mockRejectedValue(new Error('boom'));

    const result = await controller.sendMessage({ id: 'u1' }, 'ch-1', { content: 'selam' });
    await new Promise((r) => setImmediate(r));

    expect(result).toBe(MESSAGE);
    expect(errorSpy).toHaveBeenCalled();
  });
});

// C46 — tepki yayını ve bildirim kararı

describe('MessagesController.addReaction — C46', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => errorSpy.mockRestore());

  function setup(change: { removed: string | null; added: string | null }) {
    const ctx = makeController();
    (ctx.service as any).addReaction = jest.fn().mockResolvedValue(change);
    (ctx.gateway as any).broadcastReaction = jest.fn();
    return ctx;
  }

  it('değişiklik yoksa yayın da bildirim de yok', async () => {
    const { controller, gateway, reactionNotifier } = setup({ removed: null, added: null });

    await controller.addReaction({ id: 'u1' }, 'ch-1', 'msg-1', { emoji: '👍' });

    expect((gateway as any).broadcastReaction).not.toHaveBeenCalled();
    expect(reactionNotifier.notifyAdded).not.toHaveBeenCalled();
  });

  it('yeni tepki → yalnız reaction.added + bildirim tetiği', async () => {
    const { controller, gateway, reactionNotifier } = setup({ removed: null, added: '👍' });

    await controller.addReaction({ id: 'u1' }, 'ch-1', 'msg-1', { emoji: '👍' });

    const calls = (gateway as any).broadcastReaction.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      'ch-1',
      'reaction.added',
      { messageId: 'msg-1', channelId: 'ch-1', emoji: '👍', userId: 'u1' },
    ]);
    expect(reactionNotifier.notifyAdded).toHaveBeenCalledWith('u1', 'ch-1', 'msg-1', '👍');
  });

  it('değiştirme → önce reaction.removed (eski) sonra reaction.added (yeni)', async () => {
    const { controller, gateway, reactionNotifier } = setup({ removed: '❤️', added: '👍' });

    await controller.addReaction({ id: 'u1' }, 'ch-1', 'msg-1', { emoji: '👍' });

    const calls = (gateway as any).broadcastReaction.mock.calls;
    expect(calls.map((c: unknown[]) => [c[1], (c[2] as { emoji: string }).emoji])).toEqual([
      ['reaction.removed', '❤️'],
      ['reaction.added', '👍'],
    ]);
    expect(reactionNotifier.notifyAdded).toHaveBeenCalledWith('u1', 'ch-1', 'msg-1', '👍');
  });

  it('bildirim hatası tepki isteğini düşürmez, loglanır', async () => {
    const { controller, reactionNotifier } = setup({ removed: null, added: '👍' });
    reactionNotifier.notifyAdded.mockRejectedValue(new Error('boom'));

    await expect(
      controller.addReaction({ id: 'u1' }, 'ch-1', 'msg-1', { emoji: '👍' }),
    ).resolves.toBeNull();
    await new Promise((r) => setImmediate(r));

    expect(errorSpy).toHaveBeenCalled();
  });

  it('bildirim asılı kalsa bile istek döner', async () => {
    const { controller, reactionNotifier } = setup({ removed: null, added: '👍' });
    reactionNotifier.notifyAdded.mockReturnValue(new Promise(() => undefined));

    await expect(
      controller.addReaction({ id: 'u1' }, 'ch-1', 'msg-1', { emoji: '👍' }),
    ).resolves.toBeNull();
  });
});

describe('MessagesController.removeReaction — C46 §4b', () => {
  function setup(changed: boolean) {
    const ctx = makeController();
    (ctx.service as any).removeReaction = jest.fn().mockResolvedValue(changed);
    (ctx.gateway as any).broadcastReaction = jest.fn();
    return ctx;
  }

  it('gerçekten silince temizleme tetiklenir', async () => {
    const { controller, reactionNotifier } = setup(true);
    await controller.removeReaction({ id: 'u1' }, 'ch-1', 'msg-1', '👍');
    expect(reactionNotifier.notifyRemoved).toHaveBeenCalledWith('u1', 'ch-1', 'msg-1', '👍');
  });

  it('değişiklik yoksa tetiklenmez', async () => {
    const { controller, reactionNotifier } = setup(false);
    await controller.removeReaction({ id: 'u1' }, 'ch-1', 'msg-1', '👍');
    expect(reactionNotifier.notifyRemoved).not.toHaveBeenCalled();
  });

  it('temizleme hatası isteği düşürmez', async () => {
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { controller, reactionNotifier } = setup(true);
    reactionNotifier.notifyRemoved.mockRejectedValue(new Error('boom'));
    await expect(
      controller.removeReaction({ id: 'u1' }, 'ch-1', 'msg-1', '👍'),
    ).resolves.toBeNull();
    await new Promise((r) => setImmediate(r));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
