import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { E2eeDevicesService } from './e2ee-devices.service';
import { E2EE_ERRORS, fromB64 } from './e2ee.util';

export type E2eeSendPlan =
  | { encrypted: false }
  | {
      encrypted: true;
      senderDeviceId: string;
      ciphertext: Uint8Array<ArrayBuffer>;
      /** E4: yoksa null (v1 istemci; düzenlemede verilmezse eski tag silinir, yeni içerikle uyuşmaz). */
      frankingTag: Uint8Array<ArrayBuffer> | null;
    };

type CallerRef = Pick<RequestUser, 'id' | 'tokenFamily'>;
type Payload = { content?: string; ciphertext?: string; frankingTag?: string };

/**
 * Mesaj uçlarının E2EE kuralları (§2.5). Kanal şifreli ⇔ `E2eeGroup` satırı var (bayrağa BAKILMAZ:
 * bir DM bir kez şifreli olduysa düz metne dönmez). MessagesService yalnız bu planı uygular.
 */
@Injectable()
export class E2eeMessageService {
  constructor(
    private prisma: PrismaService,
    private devices: E2eeDevicesService,
  ) {}

  /** POST /channels/:id/messages kuralları. Şifreli kanalda düz içerik 409, şifresizde ciphertext 422. */
  async planSend(
    caller: CallerRef | undefined,
    channelId: string,
    dto: Payload,
  ): Promise<E2eeSendPlan> {
    const group = await this.prisma.e2eeGroup.findUnique({
      where: { channelId },
      select: { channelId: true },
    });
    if (!group) {
      if (dto.ciphertext !== undefined || dto.frankingTag !== undefined) {
        throw E2EE_ERRORS.notEncrypted();
      }
      return { encrypted: false };
    }
    return this.encryptedPlan(caller, dto);
  }

  /** PATCH kuralları: şifreli mesajda `ciphertext`, şifresizde `content`. */
  async planEdit(
    caller: CallerRef | undefined,
    message: { encrypted: boolean },
    dto: Payload,
  ): Promise<E2eeSendPlan> {
    if (!message.encrypted) {
      if (dto.ciphertext !== undefined || dto.frankingTag !== undefined) {
        throw E2EE_ERRORS.notEncrypted();
      }
      return { encrypted: false };
    }
    return this.encryptedPlan(caller, dto);
  }

  private async encryptedPlan(caller: CallerRef | undefined, dto: Payload): Promise<E2eeSendPlan> {
    if (dto.content !== undefined || dto.ciphertext === undefined) throw E2EE_ERRORS.required();
    if (!caller) throw E2EE_ERRORS.deviceRequired();
    const device = await this.devices.requireActiveDevice(caller);
    return {
      encrypted: true,
      senderDeviceId: device.id,
      ciphertext: fromB64(dto.ciphertext),
      frankingTag: dto.frankingTag === undefined ? null : fromB64(dto.frankingTag),
    };
  }
}
