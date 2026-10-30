import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ExternalAccount, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamProvider } from './providers/stream-provider';
import { StreamProvidersRegistry } from './stream-providers.registry';

/** State ömrü: 10 dk, tek kullanımlık (§1.3). */
export const LINK_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_STATE_LENGTH = 128;

export type LinkResult = 'linked' | 'taken' | 'error';

export interface ExternalAccountDto {
  provider: 'kick' | 'twitch';
  username: string;
  url: string;
  showOnProfile: boolean;
  linkedAt: string;
}

function notFound(): never {
  throw new NotFoundException({ message: 'Bağlantı bulunamadı.', error: 'PROVIDER_NOT_FOUND' });
}

/**
 * C36 §2 (R7) — dış hesap bağlama. Kimlik OAuth'tan gelir (kullanıcı adı yazarak bağlama YOK).
 * Dış platform token'ı bu dosyada hiçbir yere yazılmaz/loglanmaz: adaptör `identify` yalnız
 * `{ externalId, username }` döndürür, token kendi bellek kapsamında kalır.
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private prisma: PrismaService,
    private providers: StreamProvidersRegistry,
  ) {}

  providerFlags(): Record<'kick' | 'twitch', boolean> {
    const flags = { kick: false, twitch: false };
    for (const p of this.providers.list()) flags[p.key] = p.isEnabled();
    return flags;
  }

  async list(userId: string): Promise<ExternalAccountDto[]> {
    const rows = await this.prisma.externalAccount.findMany({
      where: { userId },
      orderBy: { linkedAt: 'asc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  /** §2.2 — POST /integrations/:provider/link */
  async startLink(userId: string, providerKey: string): Promise<{ url: string }> {
    const provider = this.providers.requireEnabled(providerKey);

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!user) notFound();
    if (user.isMinor) {
      throw new ForbiddenException({
        message: 'Bu özellik yaşına uygun değil.',
        error: 'MINOR_NOT_ALLOWED',
      });
    }
    const existing = await this.prisma.externalAccount.findUnique({
      where: { userId_provider: { userId, provider: provider.db } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Bu platformda zaten bir hesap bağlı.',
        error: 'ALREADY_LINKED',
      });
    }

    // Fırsatçı temizlik: süresi geçmiş state satırları
    await this.prisma.externalLinkState.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    // 32 bayt rastgele state (+ PKCE verifier). State tahmin edilemez ve tek kullanımlıktır.
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = provider.usesPkce ? randomBytes(32).toString('base64url') : '';
    await this.prisma.externalLinkState.create({
      data: {
        id: state,
        userId,
        provider: provider.db,
        codeVerifier,
        expiresAt: new Date(Date.now() + LINK_STATE_TTL_MS),
      },
    });
    const challenge = provider.usesPkce
      ? createHash('sha256').update(codeVerifier).digest('base64url')
      : null;
    return { url: provider.buildAuthorizeUrl(state, challenge) };
  }

  /**
   * §2.3-§2.4 — geri dönüş. Kimlik ÇEREZDEN DEĞİL state satırından gelir. Her başarısızlık aynı
   * `error` sonucuna iner (neden sızdırılmaz); yalnız "hesap başka kullanıcıya bağlı" ayrıdır.
   */
  async completeLink(
    providerKey: string,
    code: string | undefined,
    state: string | undefined,
  ): Promise<LinkResult> {
    const provider = this.providers.requireEnabled(providerKey);
    if (!code || !state || state.length > MAX_STATE_LENGTH) return 'error';

    // State TEK KULLANIMLIK: okuma ve silme tek atomik `delete`; ikinci kullanım P2025 alır.
    const row = await this.consumeState(state);
    if (!row) return 'error';
    if (row.provider !== provider.db) return 'error'; // yoldaki sağlayıcı ile eşleşmeli
    if (row.expiresAt.getTime() < Date.now()) return 'error';

    // Bu arada minör işaretlenmiş ya da silinmiş olabilir
    const user = await this.prisma.user.findUnique({
      where: { id: row.userId, deletedAt: null },
      select: { isMinor: true },
    });
    if (!user || user.isMinor) return 'error';

    let identity: { externalId: string; username: string };
    try {
      identity = await provider.identify(code, row.codeVerifier);
    } catch (err) {
      // Hata metni token/kod içermez (http.util); yine de yalnız mesaj loglanır
      this.logger.warn(`${provider.key} kimlik okunamadı: ${(err as Error).message}`);
      return 'error';
    }

    let account: ExternalAccount;
    try {
      account = await this.prisma.externalAccount.create({
        data: {
          userId: row.userId,
          provider: provider.db,
          externalId: identity.externalId,
          username: identity.username,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const taken = await this.prisma.externalAccount.findUnique({
          where: {
            provider_externalId: { provider: provider.db, externalId: identity.externalId },
          },
          select: { userId: true },
        });
        // Aynı kullanıcı zaten bağlıysa (çift tıklama) hata; başkasına bağlıysa "taken"
        return taken && taken.userId !== row.userId ? 'taken' : 'error';
      }
      throw err;
    }

    await this.audit(row.userId, 'integration.link', account.id, provider);
    await this.openSubscription(provider, account.externalId);
    return 'linked';
  }

  async unlink(userId: string, providerKey: string): Promise<null> {
    const provider = this.providers.find(providerKey) ?? notFound();
    const account = await this.prisma.externalAccount.findUnique({
      where: { userId_provider: { userId, provider: provider.db } },
    });
    if (!account) notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.externalAccount.delete({ where: { id: account.id } });
      // Son bağlı hesap gittiyse opt-in'ler anlamsız: hepsi silinir (§2.6)
      const remaining = await tx.externalAccount.count({ where: { userId } });
      if (remaining === 0) await tx.streamAnnounceOptIn.deleteMany({ where: { userId } });
    });
    await this.audit(userId, 'integration.unlink', account.id, provider);
    await this.closeSubscription(provider, account.externalId);
    return null;
  }

  async setShowOnProfile(
    userId: string,
    providerKey: string,
    showOnProfile: boolean,
  ): Promise<ExternalAccountDto> {
    const provider = this.providers.find(providerKey) ?? notFound();
    const account = await this.prisma.externalAccount.findUnique({
      where: { userId_provider: { userId, provider: provider.db } },
    });
    if (!account) notFound();
    const updated = await this.prisma.externalAccount.update({
      where: { id: account.id },
      data: { showOnProfile },
    });
    return this.toDto(updated);
  }

  private toDto(row: ExternalAccount): ExternalAccountDto {
    const provider = this.providers.list().find((p) => p.db === row.provider)!;
    return {
      provider: provider.key,
      username: row.username,
      url: provider.channelUrl(row.username),
      showOnProfile: row.showOnProfile,
      linkedAt: row.linkedAt.toISOString(),
    };
  }

  private async consumeState(state: string) {
    try {
      return await this.prisma.externalLinkState.delete({ where: { id: state } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null;
      throw err;
    }
  }

  /** Abonelik hatası bağlamayı bozmaz: günlük uzlaştırma işi eksik aboneliği yeniden açar. */
  private async openSubscription(provider: StreamProvider, externalId: string): Promise<void> {
    try {
      await provider.subscribe(externalId);
    } catch (err) {
      this.logger.error(
        `${provider.key} aboneliği açılamadı (uzlaştırma yeniden deneyecek): ${(err as Error).message}`,
      );
    }
  }

  private async closeSubscription(provider: StreamProvider, externalId: string): Promise<void> {
    if (!provider.isEnabled()) return;
    try {
      const subs = await provider.listSubscriptions();
      for (const sub of subs.filter((s) => s.externalId === externalId)) {
        await provider.unsubscribe(sub.id);
      }
    } catch (err) {
      this.logger.error(
        `${provider.key} aboneliği kapatılamadı (uzlaştırma kapatacak): ${(err as Error).message}`,
      );
    }
  }

  private async audit(
    actorId: string,
    action: string,
    entityId: string,
    provider: StreamProvider,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entityType: 'ExternalAccount',
        entityId,
        metadata: { provider: provider.key },
      },
    });
  }
}
