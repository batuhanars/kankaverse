import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { StreamEventsService } from './stream-events.service';

describe('StreamEventsService (C36 §3)', () => {
  const provider = {
    key: 'kick',
    isEnabled: jest.fn(),
    verifyWebhook: jest.fn(),
  };
  const registry = { find: jest.fn() };
  const announcer = {
    onOnline: jest.fn().mockResolvedValue(undefined),
    onOffline: jest.fn().mockResolvedValue(undefined),
  };
  let service: StreamEventsService;

  beforeEach(() => {
    jest.resetAllMocks();
    provider.isEnabled.mockReturnValue(true);
    registry.find.mockReturnValue(provider);
    announcer.onOnline.mockResolvedValue(undefined);
    announcer.onOffline.mockResolvedValue(undefined);
    service = new StreamEventsService(registry as never, announcer as never);
  });

  const online = (id = 'm1') => ({
    type: 'online',
    messageId: id,
    externalId: '42',
    title: 'T',
  });

  it('geçersiz imza 401 ve hiçbir iş tetiklenmez', async () => {
    provider.verifyWebhook.mockRejectedValue(new UnauthorizedException());
    await expect(service.handle('kick', {}, Buffer.from('{}'))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(announcer.onOnline).not.toHaveBeenCalled();
  });

  it('ham gövde yoksa adaptör boş gövdeyle doğrular (imza zaten tutmaz)', async () => {
    provider.verifyWebhook.mockRejectedValue(new UnauthorizedException());
    await expect(service.handle('kick', {}, null)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(provider.verifyWebhook.mock.calls[0][1]).toEqual(Buffer.alloc(0));
  });

  it('bilinmeyen ya da bayrağı kapalı sağlayıcı 404', async () => {
    registry.find.mockReturnValue(null);
    await expect(service.handle('steam', {}, Buffer.alloc(0))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    registry.find.mockReturnValue(provider);
    provider.isEnabled.mockReturnValue(false);
    await expect(service.handle('kick', {}, Buffer.alloc(0))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(provider.verifyWebhook).not.toHaveBeenCalled();
  });

  it('online olay duyuruyu tetikler', async () => {
    provider.verifyWebhook.mockResolvedValue(online());
    await expect(service.handle('kick', {}, Buffer.from('x'))).resolves.toEqual({
      kind: 'accepted',
    });
    expect(announcer.onOnline).toHaveBeenCalledWith(provider, '42', 'T');
  });

  it('aynı mesaj kimliği ikinci kez işlenmez, farklı kimlik işlenir', async () => {
    provider.verifyWebhook.mockResolvedValue(online('m1'));
    await service.handle('kick', {}, Buffer.from('x'));
    await service.handle('kick', {}, Buffer.from('x'));
    expect(announcer.onOnline).toHaveBeenCalledTimes(1);
    provider.verifyWebhook.mockResolvedValue(online('m2'));
    await service.handle('kick', {}, Buffer.from('x'));
    expect(announcer.onOnline).toHaveBeenCalledTimes(2);
  });

  it('24 saat sonra aynı kimlik yeniden işlenir', async () => {
    provider.verifyWebhook.mockResolvedValue(online('m1'));
    const realNow = Date.now;
    await service.handle('kick', {}, Buffer.from('x'));
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    try {
      await service.handle('kick', {}, Buffer.from('x'));
    } finally {
      Date.now = realNow;
    }
    expect(announcer.onOnline).toHaveBeenCalledTimes(2);
  });

  it('offline yalnız bitiş işini çağırır', async () => {
    provider.verifyWebhook.mockResolvedValue({
      type: 'offline',
      messageId: 'o1',
      externalId: '42',
    });
    await service.handle('kick', {}, Buffer.from('x'));
    expect(announcer.onOffline).toHaveBeenCalledWith(provider, '42');
    expect(announcer.onOnline).not.toHaveBeenCalled();
  });

  it('Twitch challenge düz metin sonucu döner, tekilleştirmeye girmez', async () => {
    provider.verifyWebhook.mockResolvedValue({ type: 'challenge', challenge: 'abc' });
    await expect(service.handle('twitch', {}, Buffer.from('x'))).resolves.toEqual({
      kind: 'challenge',
      challenge: 'abc',
    });
  });

  it('duyuru işi hata verse bile yanıt hızlı 2xx döner', async () => {
    provider.verifyWebhook.mockResolvedValue(online());
    announcer.onOnline.mockRejectedValue(new Error('boom'));
    await expect(service.handle('kick', {}, Buffer.from('x'))).resolves.toEqual({
      kind: 'accepted',
    });
  });
});
