import { CallSignalService } from './call-signal.service';

const prismaMock = { channel: { findUnique: jest.fn() }, channelMember: { findMany: jest.fn() } };
const realtimeMock = { emitToUser: jest.fn() };
const pushMock = { sendCallEnd: jest.fn() };

const CH = 'dm-1';
const CALLER = 'caller';
const CALLEE = 'callee';

function make() {
  return new CallSignalService(prismaMock as any, realtimeMock as any, pushMock as any);
}

describe('CallSignalService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    pushMock.sendCallEnd.mockResolvedValue(undefined);
    prismaMock.channel.findUnique.mockResolvedValue({ type: 'DM' });
    prismaMock.channelMember.findMany.mockResolvedValue([{ userId: CALLER }, { userId: CALLEE }]);
  });

  describe('otherDmMember (R7 kapısı)', () => {
    it('üye çağıran → karşı taraf', async () => {
      expect(await make().otherDmMember(CH, CALLEE)).toBe(CALLER);
    });
    it('üye olmayan çağıran → null', async () => {
      expect(await make().otherDmMember(CH, 'yabanci')).toBeNull();
    });
    it('grup DM → null (arama yalnız 1-1 DM, sahte relay yok)', async () => {
      prismaMock.channel.findUnique.mockResolvedValue({ type: 'GROUP_DM' });
      expect(await make().otherDmMember(CH, CALLEE)).toBeNull();
      expect(prismaMock.channelMember.findMany).not.toHaveBeenCalled();
    });
    it('kanal yok → null', async () => {
      prismaMock.channel.findUnique.mockResolvedValue(null);
      expect(await make().otherDmMember(CH, CALLEE)).toBeNull();
    });
    it('üye listesi boş → null', async () => {
      prismaMock.channelMember.findMany.mockResolvedValue([]);
      expect(await make().otherDmMember(CH, CALLEE)).toBeNull();
    });
  });

  it('reject: üye → arayana call_rejected + callee kendi cihazlarına call_end', async () => {
    expect(await make().reject(CH, CALLEE)).toBe(true);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(CALLER, 'voice.call_rejected', {
      channelId: CH,
    });
    expect(pushMock.sendCallEnd).toHaveBeenCalledWith(CALLEE, CH);
  });

  it('reject: üye değil → false, olay ve push yok', async () => {
    expect(await make().reject(CH, 'yabanci')).toBe(false);
    expect(realtimeMock.emitToUser).not.toHaveBeenCalled();
    expect(pushMock.sendCallEnd).not.toHaveBeenCalled();
  });

  it('accept: arayana call_accepted + callee kendi cihazlarına call_end', async () => {
    expect(await make().accept(CH, CALLEE)).toBe(true);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(CALLER, 'voice.call_accepted', {
      channelId: CH,
    });
    expect(pushMock.sendCallEnd).toHaveBeenCalledWith(CALLEE, CH);
  });

  it('cancel: callee call_canceled alır + callee tokenlarına call_end', async () => {
    expect(await make().cancel(CH, CALLER)).toBe(true);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(CALLEE, 'voice.call_canceled', {
      channelId: CH,
    });
    expect(pushMock.sendCallEnd).toHaveBeenCalledWith(CALLEE, CH);
  });

  it('accept/cancel: üye değil → olay ve push yok', async () => {
    expect(await make().accept(CH, 'yabanci')).toBe(false);
    expect(await make().cancel(CH, 'yabanci')).toBe(false);
    expect(realtimeMock.emitToUser).not.toHaveBeenCalled();
    expect(pushMock.sendCallEnd).not.toHaveBeenCalled();
  });

  it('accept/reject: eylemi yapanin kendi soketlerine de voice.call_canceled gider', async () => {
    await make().accept(CH, CALLEE);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(CALLEE, 'voice.call_canceled', {
      channelId: CH,
    });
    realtimeMock.emitToUser.mockClear();
    await make().reject(CH, CALLEE);
    expect(realtimeMock.emitToUser).toHaveBeenCalledWith(CALLEE, 'voice.call_canceled', {
      channelId: CH,
    });
    expect(realtimeMock.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('cancel: eylemi yapana ek olay yok (yalnizca callee)', async () => {
    await make().cancel(CH, CALLER);
    expect(realtimeMock.emitToUser).toHaveBeenCalledTimes(1);
  });
});
