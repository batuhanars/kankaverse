import { VoiceCallsController } from './voice-calls.controller';

describe('VoiceCallsController.reject', () => {
  const callSignal = { reject: jest.fn() };
  const ctrl = new VoiceCallsController(callSignal as any);

  beforeEach(() => jest.resetAllMocks());

  it('üye → CallSignalService.reject(channelId, userId) → { ok: true }', async () => {
    callSignal.reject.mockResolvedValue(true);
    expect(await ctrl.reject({ id: 'u1' }, 'dm-1')).toEqual({ ok: true });
    expect(callSignal.reject).toHaveBeenCalledWith('dm-1', 'u1');
  });

  it('üye değil / kanal yok → { ok: false } (hata fırlatmaz)', async () => {
    callSignal.reject.mockResolvedValue(false);
    expect(await ctrl.reject({ id: 'u1' }, 'dm-x')).toEqual({ ok: false });
  });
});
