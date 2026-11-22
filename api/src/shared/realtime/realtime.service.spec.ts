import { Server } from 'socket.io';
import { RealtimeService } from './realtime.service';

/**
 * E2 §2.4 🔴 — gruptan çıkarılan kullanıcının soketleri kanal odasından çıkarılır. Gerçek Socket.IO
 * Server + bellek içi adaptör kullanılır; yalnız ağ soketi yerine `leave`i adaptöre yazan sahte soket konur.
 */
describe('RealtimeService.removeUserFromRoom', () => {
  function setup() {
    const io = new Server();
    const nsp = io.of('/');
    const addSocket = (id: string, rooms: string[]) => {
      nsp.adapter.addAll(id, new Set([id, ...rooms]));
      const socket = {
        id,
        leave: jest.fn((room: string) => nsp.adapter.del(id, room)),
      };
      nsp.sockets.set(id, socket as never);
      return socket;
    };
    const service = new RealtimeService();
    service.setServer(io);
    return { nsp, addSocket, service };
  }

  it('kullanıcının TÜM soketleri yalnız o kanal odasından çıkar; başkaları ve diğer odalar etkilenmez', () => {
    const { nsp, addSocket, service } = setup();
    const a1 = addSocket('a1', ['user:u1', 'room:c1', 'room:c2']);
    const a2 = addSocket('a2', ['user:u1', 'room:c1']);
    const b1 = addSocket('b1', ['user:u2', 'room:c1']);

    service.removeUserFromRoom('u1', 'c1');

    expect(a1.leave).toHaveBeenCalledWith('room:c1');
    expect(a2.leave).toHaveBeenCalledWith('room:c1');
    expect(b1.leave).not.toHaveBeenCalled();
    expect([...(nsp.adapter.rooms.get('room:c1') ?? [])]).toEqual(['b1']);
    expect([...(nsp.adapter.rooms.get('room:c2') ?? [])]).toEqual(['a1']);
  });

  it('D102 (E8): ses presence odasından (voice:<kanal>) da çıkar; başka kanalın presence odası kalır', () => {
    const { nsp, addSocket, service } = setup();
    addSocket('a1', ['user:u1', 'room:c1', 'voice:c1', 'voice:c2']);
    addSocket('b1', ['user:u2', 'voice:c1']);

    service.removeUserFromRoom('u1', 'c1');

    expect([...(nsp.adapter.rooms.get('voice:c1') ?? [])]).toEqual(['b1']);
    expect([...(nsp.adapter.rooms.get('voice:c2') ?? [])]).toEqual(['a1']);
  });

  it('sunucu henüz bağlanmadıysa (setServer yok) sessizce geçer', () => {
    expect(() => new RealtimeService().removeUserFromRoom('u1', 'c1')).not.toThrow();
  });
});
