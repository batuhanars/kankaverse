import { E2eeMessageService } from './e2ee-message.service';
import { toB64 } from './e2ee.util';

const CALLER = { id: 'u1', tokenFamily: 'fam-1' };
const CT = toB64(new Uint8Array([1, 2, 3]));

function setup() {
  const prisma = { e2eeGroup: { findUnique: jest.fn() } };
  const devices = { requireActiveDevice: jest.fn().mockResolvedValue({ id: 'dev-1' }) };
  return {
    prisma,
    devices,
    svc: new E2eeMessageService(prisma as never, devices as never),
  };
}

describe('E2eeMessageService.planSend (§2.5)', () => {
  it('şifresiz kanal + düz içerik → şifresiz plan, cihaz sorgulanmaz', async () => {
    const { prisma, devices, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    await expect(svc.planSend(CALLER, 'ch', { content: 'selam' })).resolves.toEqual({
      encrypted: false,
    });
    expect(devices.requireActiveDevice).not.toHaveBeenCalled();
  });

  it('şifresiz kanala ciphertext → 422 E2EE_NOT_ENCRYPTED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    await expect(svc.planSend(CALLER, 'ch', { ciphertext: CT })).rejects.toMatchObject({
      status: 422,
      response: { error: 'E2EE_NOT_ENCRYPTED' },
    });
  });

  it('şifreli kanala düz mesaj → 409 E2EE_REQUIRED (geri düşme yok)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    await expect(svc.planSend(CALLER, 'ch', { content: 'düz' })).rejects.toMatchObject({
      status: 409,
      response: { error: 'E2EE_REQUIRED' },
    });
  });

  it('şifreli kanalda ciphertext + content birlikte ya da ciphertext yok → 409 E2EE_REQUIRED', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    await expect(
      svc.planSend(CALLER, 'ch', { content: 'x', ciphertext: CT }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(svc.planSend(CALLER, 'ch', {})).rejects.toMatchObject({ status: 409 });
  });

  it('şifreli kanal + ciphertext → plan: senderDeviceId çağıranın zincir cihazı', async () => {
    const { prisma, devices, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    const plan = await svc.planSend(CALLER, 'ch', { ciphertext: CT });
    expect(devices.requireActiveDevice).toHaveBeenCalledWith(CALLER);
    expect(plan).toMatchObject({ encrypted: true, senderDeviceId: 'dev-1' });
    expect(Array.from((plan as { ciphertext: Uint8Array }).ciphertext)).toEqual([1, 2, 3]);
  });

  it('iptal/yok cihaz → 403 E2EE_DEVICE_REQUIRED (cihaz kapısından)', async () => {
    const { prisma, devices, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    devices.requireActiveDevice.mockRejectedValue(
      Object.assign(new Error('x'), { status: 403, response: { error: 'E2EE_DEVICE_REQUIRED' } }),
    );
    await expect(svc.planSend(CALLER, 'ch', { ciphertext: CT })).rejects.toMatchObject({
      status: 403,
    });
  });

  it('çağıran zinciri hiç yoksa (tokenFamily gelmedi) şifreli kanalda 403', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    await expect(svc.planSend(undefined, 'ch', { ciphertext: CT })).rejects.toMatchObject({
      status: 403,
      response: { error: 'E2EE_DEVICE_REQUIRED' },
    });
  });
});

describe('E4 frankingTag (§3.2)', () => {
  const TAG = toB64(new Uint8Array(32).fill(9));

  it('şifresiz kanala frankingTag → 422 E2EE_NOT_ENCRYPTED (ciphertext olmasa da)', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue(null);
    await expect(
      svc.planSend(CALLER, 'ch', { content: 'x', frankingTag: TAG }),
    ).rejects.toMatchObject({
      status: 422,
      response: { error: 'E2EE_NOT_ENCRYPTED' },
    });
  });

  it('şifreli kanalda isteğe bağlı: verilirse 32 bayt plana girer, verilmezse null', async () => {
    const { prisma, svc } = setup();
    prisma.e2eeGroup.findUnique.mockResolvedValue({ channelId: 'ch' });
    const withTag = await svc.planSend(CALLER, 'ch', { ciphertext: CT, frankingTag: TAG });
    expect(Array.from((withTag as { frankingTag: Uint8Array }).frankingTag)).toEqual(
      Array(32).fill(9),
    );
    await expect(svc.planSend(CALLER, 'ch', { ciphertext: CT })).resolves.toMatchObject({
      frankingTag: null,
    });
  });

  it('düzenleme: şifresiz mesajda frankingTag → 422; şifreli mesajda yeni tag plana girer', async () => {
    const { svc } = setup();
    await expect(
      svc.planEdit(CALLER, { encrypted: false }, { content: 'x', frankingTag: TAG }),
    ).rejects.toMatchObject({ status: 422 });
    const plan = await svc.planEdit(
      CALLER,
      { encrypted: true },
      { ciphertext: CT, frankingTag: TAG },
    );
    expect((plan as { frankingTag: Uint8Array }).frankingTag).toHaveLength(32);
  });
});

describe('E2eeMessageService.planEdit', () => {
  it('şifresiz mesaj + düz içerik → şifresiz plan; ciphertext → 422', async () => {
    const { svc } = setup();
    await expect(svc.planEdit(CALLER, { encrypted: false }, { content: 'x' })).resolves.toEqual({
      encrypted: false,
    });
    await expect(
      svc.planEdit(CALLER, { encrypted: false }, { ciphertext: CT }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('şifreli mesaj + content → 409; ciphertext ile → plan', async () => {
    const { svc } = setup();
    await expect(svc.planEdit(CALLER, { encrypted: true }, { content: 'x' })).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    await expect(
      svc.planEdit(CALLER, { encrypted: true }, { ciphertext: CT }),
    ).resolves.toMatchObject({ encrypted: true, senderDeviceId: 'dev-1' });
  });
});
