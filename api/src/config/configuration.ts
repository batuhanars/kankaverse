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

  // S3 yalnızca dosya yükleme AÇIKSA prod'da zorunlu. UPLOADS_ENABLED=false → S3 gerekmez
  // (CSAM tarayıcı/R5 hazır olana dek yüklemeyi kapalı tutmak ayrıca güvenli taraf).
  if (process.env.NODE_ENV === 'production' && process.env.UPLOADS_ENABLED !== 'false') {
    for (const key of S3_REQUIRED_PROD_ENVS) {
      if (!process.env[key]) {
        throw new Error(
          `FATAL: Production ortamında (UPLOADS_ENABLED!=false iken) S3 değişkeni '${key}' zorunludur. ` +
          `Yüklemeyi kapatmak için UPLOADS_ENABLED=false ver.`,
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

  // LiveKit (ses kanalları): prod'da üçü de zorunlu (fail-fast); dev'de yoksa ses devre dışı (503).
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'LIVEKIT_URL'] as const) {
      if (!process.env[key]) {
        throw new Error(
          `FATAL: Production ortamında LiveKit değişkeni '${key}' zorunludur. Ses kanalları çalışmaz.`,
        );
      }
    }
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
    // LiveKit ses kanalları — üçü de tanımlı değilse ses devre dışı (service 503 döner)
    livekit: {
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
      url: process.env.LIVEKIT_URL,
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
    // Dosya yükleme feature-flag: CSAM tarayıcı yokken kapalı önizlemede false yapılabilir (D14)
    // Dev'de ve varsayılan: true (açık). Kapalı önizleme: UPLOADS_ENABLED=false
    uploadsEnabled: process.env.UPLOADS_ENABLED !== 'false',
    // WebSocket CORS origin: prod'da frontend URL'yi daraltır
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    // ── Video/Ekran paylaşımı feature-flag'leri (BUILD-DARK) ──────────────────
    // Sprint C4. Default false → bayrak false iken mintToken yalnız MICROPHONE grant'i.
    // Prod fail-fast YOK: default false güvenli taraf. Açma önkoşulları §0.1'de.
    cameraEnabled: process.env.CAMERA_ENABLED === 'true',
    screenEnabled: process.env.SCREEN_ENABLED === 'true',
    // Discord şablon göçü (yapı-only) feature-flag — default KAPALI. Açma: DISCORD_IMPORT_ENABLED=true
    discordImportEnabled: process.env.DISCORD_IMPORT_ENABLED === 'true',
    // Kayıt modu — kapalı-test fazı (Sprint Closed-Registration)
    // 'open' (default): kayıt açık, davet kodu yok sayılır.
    // 'invite': yalnız geçerli davet koduyla kayıt.
    // 'closed': kayıt tamamen kapalı.
    // Geçersiz değer → fail-closed ('closed'): kayıt açık-kalmasındansa kapalı kalsın (T&S prensibi).
    registrationMode: (() => {
      const raw = process.env.REGISTRATION_MODE ?? 'open';
      if (raw === 'open' || raw === 'invite' || raw === 'closed') {
        return raw as 'open' | 'invite' | 'closed';
      }
      // Bilinmeyen değer → fail-closed + uyarı
      console.warn(
        `[config] REGISTRATION_MODE geçersiz değer: '${raw}'. Güvenli taraf için 'closed' kullanılıyor.`,
      );
      return 'closed' as const;
    })(),
  };
};
