import { MessagesGateway } from './messages.gateway';
import { ClientActivityService } from '../../../shared/client-activity/client-activity.service';

function setup() {
  const realtime = { emitToUser: jest.fn() };
  const activity = new ClientActivityService(realtime as any);
  const deps: unknown[] = Array(13).fill({});
  const gateway = new MessagesGateway(...(deps as [any]), activity as any);
  return { gateway, activity };
}

describe('MessagesGateway client:activity', () => {
  it('boolean olmayan yük reddedilir, boolean durumu günceller', () => {
    const { gateway, activity } = setup();
    activity.register('s1', 'u1', 'desktop');
    const socket = { id: 's1', data: { userId: 'u1' } } as any;
    expect(gateway.handleClientActivity(socket, { active: 'yes' })).toEqual({ ok: false });
    expect(activity.isDesktopActive('u1')).toBe(false); // Rev.1: bağlanınca aktif değil
    expect(gateway.handleClientActivity(socket, { active: true })).toEqual({ ok: true });
    expect(activity.isDesktopActive('u1')).toBe(true);
    expect(gateway.handleClientActivity(socket, { active: false })).toEqual({ ok: true });
    expect(activity.isDesktopActive('u1')).toBe(false);
  });

  it('kimliksiz soket reddedilir', () => {
    const { gateway } = setup();
    expect(gateway.handleClientActivity({ id: 's', data: {} } as any, { active: true })).toEqual({
      ok: false,
    });
  });
});
