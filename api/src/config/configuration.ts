const REQUIRED_ENVS = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

// S3 değişkenleri: dev'de opsiyonel (MinIO), prod'da zorunlu
const S3_REQUIRED_PROD_ENVS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

export default () => {
  for (const key of REQUIRED_ENVS) {
    if (!process.env[key]) {
      throw new Error(
        `FATAL: Zorunlu ortam değişkeni '${key}' tanımlanmamış. ` +
        `'.env' dosyasını kontrol edin. Uygulama başlamıyor.`,
      );
    }
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of S3_REQUIRED_PROD_ENVS) {
      if (!process.env[key]) {
        throw new Error(
          `FATAL: Production ortamında S3 değişkeni '${key}' zorunludur. ` +
          `Dosya paylaşımı çalışmaz.`,
        );
      }
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
    throw new Error(
      `FATAL: Production ortamında 'RESEND_API_KEY' zorunludur. ` +
      `E-posta gönderimi yapılamaz.`,
    );
  }

  // TOTP_ENC_KEY: tanımlıysa kesinlikle 32 byte olmalı
  if (process.env.TOTP_ENC_KEY) {
    const keyBytes = Buffer.from(process.env.TOTP_ENC_KEY, 'base64');
    if (keyBytes.length !== 32) {
      throw new Error(
        `FATAL: TOTP_ENC_KEY tam olarak 32 byte (base64) olmalıdır; mevcut: ${keyBytes.length} byte.`,
      );
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(`FATAL: Production ortamında 'TOTP_ENC_KEY' zorunludur.`);
  }

  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    database: {
      url: process.env.DATABASE_URL as string,
    },
    redis: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET as string,
      refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    },
    email: {
      resendApiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? 'noreply@kankaverse.app',
      frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    },
    totp: {
      encKey: process.env.TOTP_ENC_KEY,
      appName: process.env.APP_NAME ?? 'Kankaverse',
    },
    purgeEnabled: process.env.PURGE_ENABLED === 'true',
    newAccountDmLockDays: parseInt(process.env.NEW_ACCOUNT_DM_LOCK_DAYS ?? '7', 10),
    // Yeni üye karantina süresi (saat) — 0 = karantina kapalı [Sprint 7B]
    quarantineHours: parseInt(process.env.QUARANTINE_HOURS ?? '24', 10),
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET ?? 'kankaverse',
      accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
      publicUrl: process.env.S3_PUBLIC_URL ?? 'http://localhost:9000/kankaverse',
    },
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '25', 10),
    // LANSMAN: ATTACHMENT_SCAN_ENABLED=true + gerçek CSAM tarayıcı olmadan canlıya ALINMAZ (R5)
    attachmentScanEnabled: process.env.ATTACHMENT_SCAN_ENABLED === 'true',
  };
};
