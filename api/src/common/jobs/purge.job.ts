import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { revokeUserDevicesInTx } from '../../modules/e2ee/e2ee-revocation.service';
import { StorageService } from '../../shared/storage/storage.service';

@Injectable()
export class PurgeJob {
  private readonly logger = new Logger(PurgeJob.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async run() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // deletedAt: null → zaten imha edilmiş kullanıcı bir daha adaya girmez (idempotency).
    const candidates = await this.prisma.user.findMany({
      where: { deletionRequestedAt: { lte: thirtyDaysAgo }, deletedAt: null },
      select: { id: true },
    });

    if (candidates.length === 0) return;

    const purgeEnabled = this.config.get<boolean>('purgeEnabled');

    if (!purgeEnabled) {
      // PURGE_ENABLED=false (varsayılan): yalnızca logla, imha etme — bugünkü davranış korunur.
      candidates.forEach((u) =>
        this.logger.log(`Purge adayı imha edilmedi (PURGE_ENABLED=false, bayrak kapalı): ${u.id}`),
      );
      return;
    }

    let purged = 0;
    for (const candidate of candidates) {
      try {
        await this.purgeUser(candidate.id);
        purged++;
      } catch (err) {
        this.logger.error(
          `Purge başarısız (kullanıcı: ${candidate.id}): ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(`${purged} kullanıcı imha edildi (asgari kimlik imhası, Sprint R6a §2).`);
  }

  /**
   * Asgari kimlik imhası (Sprint R6a §2). Tek transaction: kimlik alanları temizlenir +
   * Session/PushToken/NotificationPref/RecoveryCode satırları silinir.
   *
   * BİLEREK DOKUNULMAYANLAR (sözleşme §2): mesaj içerikleri, yüklenen dosyalar (Attachment),
   * moderasyon/rapor/audit kayıtları, UserBlock. Bunların imhası R6'nın hukuk ayağına bağlı.
   *
   * 🔴 Sapma (R7 incelemesinde bakılmalı): sözleşme `birthDate` alanının null'a çekilmesini
   * istiyor ama Prisma şemasında `birthDate` NOT NULL (`schema.prisma:108`, migration olmadan
   * null yazılamaz). Bu alana bilerek dokunulmadı — nullable'a çevirmek şema migration'ı
   * gerektirir ve bu sprint'in kapsamı dışında ("şema değişikliği gerekiyorsa dur ve bildir").
   * Sahip karar verene kadar birthDate silinmiş hesapta olduğu gibi kalır.
   *
   * Not: `RecoveryCode` satırları da siliniyor — sözleşme §2.1'de "2FA alanları ... kurtarma
   * kodları → kapalı/null" ifadesi var ama kurtarma kodları User üzerinde alan değil, ayrı
   * `RecoveryCode` tablosunda satır; "kapalı/null" karşılığı bu satırların silinmesi olarak
   * yorumlandı. Sözleşmenin §2.2 açık silme listesinde (Session/PushToken/NotificationPref)
   * yer almıyor — R7 incelemesinde bu yorumun onaylanması gerekiyor.
   */
  private async purgeUser(userId: string): Promise<void> {
    let backupKeys: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@kankaverse.invalid`,
          username: `silinmis_${userId}`,
          // argon2id formatında değil → argon2.verify() asla eşleşmez; ayrıca login sorguları
          // her yerde deletedAt: null filtreler, bu satıra zaten erişilemez.
          passwordHash: randomBytes(32).toString('hex'),
          // Sahip kararı 2026-08-10 (R7): `birthDate` şemada NOT NULL. Nullable'a çevirmek
          // migration ister; kapalı testin hemen öncesinde şemaya dokunmamak için gerçek değerin
          // ÜZERİNE sabit bir yer tutucu yazılıyor. Sonuç aynı: gerçek doğum tarihi geri
          // getirilemez biçimde yok olur, satıra zaten `deletedAt` sonrası erişilmiyor.
          birthDate: new Date('1970-01-01T00:00:00.000Z'),
          avatarUrl: null,
          bannerUrl: null,
          // C13 hareketli sürümleri de düşer (C19 sırasında bulunan eksik; yoksa silinen hesabın
          // hareketli avatarı/afişi yayında kalır).
          avatarAnimatedUrl: null,
          bannerAnimatedUrl: null,
          bio: null,
          twoFactorEnabled: false,
          totpSecret: null,
          deletedAt: new Date(),
          deletionRequestedAt: null,
        },
      });
      await revokeUserDevicesInTx(tx, userId); // E1: E2EE cihazlari iptal + KeyPackage silme
      await tx.session.deleteMany({ where: { userId } });
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.notificationPref.deleteMany({ where: { userId } });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      // C31f (KVKK): son oynanan oyun geçmişi hesap imhasında silinir.
      await tx.recentGame.deleteMany({ where: { userId } });
      // C36 (KVKK): bağlı Kick/Twitch hesapları, bekleyen bağlama state'leri ve duyuru opt-in'leri silinir.
      // Platform aboneliği günlük uzlaştırma işince kapatılır (hesap satırı yok → bağlı olmayan abonelik).
      await tx.externalAccount.deleteMany({ where: { userId } });
      await tx.externalLinkState.deleteMany({ where: { userId } });
      await tx.streamAnnounceOptIn.deleteMany({ where: { userId } });
      // E5a (KVKK, kurul k.4): şifreli DM yedeği. Kullanıcı satırı silinmediği (anonimleştirildiği) için
      // User Cascade'i DEVREYE GİRMEZ; anahtar kaydı ve görüntü satırları açıkça silinir.
      // Görüntü tablosunun User ilişkisi yok; nesneler transaction sonrası silinir.
      const snaps = await tx.e2eeBackupSnapshot.findMany({
        where: { userId },
        select: { objectKey: true },
      });
      backupKeys = snaps.map((x) => x.objectKey);
      await tx.e2eeBackupSnapshot.deleteMany({ where: { userId } });
      await tx.e2eeBackup.deleteMany({ where: { userId } });
    });
    // Nesne silme en iyi çaba (yetim risk kabul edildi); hata imhayı başarısız saymaz, anahtar loglanır.
    for (const key of backupKeys) {
      try {
        await this.storage.delete(key);
      } catch (err) {
        this.logger.error(`E2EE yedek nesnesi silinemedi (yetim kalabilir): ${key}: ${(err as Error).message}`);
      }
    }
  }
}
