import { ClientActivityService, parseClientKind } from './client-activity.service';

function make() {
  const realtime = { emitToUser: jest.fn() };
  const service = new ClientActivityService(realtime as any);
  return { service, realtime };
}

describe('ClientActivityService', () => {
  it('parseClientKind: tanınmayan değer unknown', () => {
    expect(parseClientKind('web')).toBe('web');
    expect(parseClientKind('desktop')).toBe('desktop');
    expect(parseClientKind('mobile')).toBe('mobile');
    expect(parseClientKind(undefined)).toBe('unknown');
    expect(parseClientKind('ios')).toBe('unknown');
  });

  it('bağlanınca aktif; setActive(false) ve kopunca masaüstü aktif değil', () => {
    const { service } = make();
    service.register('c1', 'u1', 'desktop');
    expect(service.isDesktopActive('u1')).toBe(true);
    service.setActive('c1', false);
    expect(service.isDesktopActive('u1')).toBe(false);
    service.setActive('c1', true);
    service.unregister('c1');
    expect(service.isDesktopActive('u1')).toBe(false);
  });

  it('unknown bağlantı hiçbir sorguya katılmaz', () => {
    const { service } = make();
    service.register('c1', 'u1', 'unknown');
    expect(service.isDesktopActive('u1')).toBe(false);
    expect(service.isMobileForeground('u1')).toBe(false);
  });

  it('web pencerelerinden biri aktifse masaüstü aktif sayılır', () => {
    const { service } = make();
    service.register('c1', 'u1', 'web');
    service.register('c2', 'u1', 'desktop');
    service.setActive('c1', false);
    expect(service.isDesktopActive('u1')).toBe(true);
  });

  it('mobil ön plan geçişi client:mobile_foreground yayar (yalnız değişimde)', () => {
    const { service, realtime } = make();
    service.register('m1', 'u1', 'mobile');
    expect(realtime.emitToUser).toHaveBeenLastCalledWith('u1', 'client:mobile_foreground', {
      active: true,
    });
    service.setActive('m1', true); // değişmedi
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    service.setActive('m1', false);
    expect(realtime.emitToUser).toHaveBeenLastCalledWith('u1', 'client:mobile_foreground', {
      active: false,
    });
    service.setActive('m1', true);
    service.unregister('m1');
    expect(realtime.emitToUser).toHaveBeenLastCalledWith('u1', 'client:mobile_foreground', {
      active: false,
    });
  });

  it('web bağlantısı mobil ön plan olayı yaymaz', () => {
    const { service, realtime } = make();
    service.register('w1', 'u1', 'web');
    service.setActive('w1', false);
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });

  describe('filterPushRecipients', () => {
    const suppressed = [
      'DM_MESSAGE',
      'CHANNEL_MESSAGE',
      'MENTION',
      'REACTION',
      'MESSAGE_REQUEST',
      'FRIEND_REQUEST',
      'FRIEND_ACCEPT',
      'GUILD_INVITE',
      'EVENT_CREATED',
      'AI_VIDEO_READY',
      'AI_VIDEO_FAILED',
    ];

    it.each(suppressed)('aktif masaüstünde %s atlanır, boştakine gider', (type) => {
      const { service } = make();
      service.register('c1', 'active', 'desktop');
      service.register('c2', 'idle', 'web');
      service.setActive('c2', false);
      expect(service.filterPushRecipients(['active', 'idle', 'nobody'], type)).toEqual([
        'idle',
        'nobody',
      ]);
    });

    it.each(['incoming_call', 'E2EE_TRANSFER'])('%s asla atlanmaz', (type) => {
      const { service } = make();
      service.register('c1', 'active', 'desktop');
      expect(service.filterPushRecipients(['active'], type)).toEqual(['active']);
    });

    it('sınıflandırılmamış tür bastırılmaz', () => {
      const { service } = make();
      service.register('c1', 'active', 'desktop');
      expect(service.filterPushRecipients(['active'], 'YENI_TUR')).toEqual(['active']);
    });

    it('unknown bağlantı bastırmaz', () => {
      const { service } = make();
      service.register('c1', 'u1', 'unknown');
      expect(service.filterPushRecipients(['u1'], 'DM_MESSAGE')).toEqual(['u1']);
    });
  });
});
