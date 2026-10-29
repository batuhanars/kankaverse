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
  const controller = new MessagesController(service as any, gateway as any, audioNormalize as any);
  return { controller, service, gateway, audioNormalize };
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
