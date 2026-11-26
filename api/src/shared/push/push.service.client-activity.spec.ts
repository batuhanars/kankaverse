import { PushService } from './push.service';
import { ClientActivityService } from '../client-activity/client-activity.service';

// C76 §2.3 — aktif masaüstü/web varken mesaj türü push'ların atlanması.
const prismaMock = {
  pushToken: { findMany: jest.fn(), deleteMany: jest.fn() },
  session: { findMany: jest.fn() },
};
const configMock = {
  get: jest.fn((key: string) => (key === 'expoPushEnabled' ? true : undefined)),
};

function make(desktopActive: boolean) {
  const activity = new ClientActivityService({ emitToUser: jest.fn() } as any);
  if (desktopActive) activity.register('c1', 'u1', 'desktop');
  return new PushService(prismaMock as any, configMock as any, undefined, activity);
}

describe('PushService aktif cihaz süzgeci', () => {
  beforeEach(() => {
    prismaMock.pushToken.findMany.mockReset().mockResolvedValue([]);
    (global as any).fetch = jest.fn();
  });

  it('aktif masaüstünde DM ve MENTION push atlanır (token sorgusu bile yok)', async () => {
    const service = make(true);
    await service.sendToUsers(['u1'], { body: 'x', data: { type: 'DM_MESSAGE' } });
    await service.sendToUsers(['u1'], { body: 'x', data: { type: 'MENTION' } });
    expect(prismaMock.pushToken.findMany).not.toHaveBeenCalled();
  });

  it('aktif masaüstünde arama ve E2EE_TRANSFER push gider', async () => {
    const service = make(true);
    await service.sendToUsers(['u1'], { body: 'x', data: { type: 'incoming_call' } });
    await service.sendToUsers(['u1'], { body: 'x', data: { type: 'E2EE_TRANSFER' } });
    expect(prismaMock.pushToken.findMany).toHaveBeenCalledTimes(2);
  });

  it('masaüstü aktif değilse DM push gider', async () => {
    const service = make(false);
    await service.sendToUsers(['u1'], { body: 'x', data: { type: 'DM_MESSAGE' } });
    expect(prismaMock.pushToken.findMany).toHaveBeenCalledTimes(1);
  });
});
