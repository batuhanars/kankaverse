const REQUIRED_ENVS = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

// S3 değişkenleri: dev'de opsiyonel (MinIO), prod'da zorunlu
const S3_REQUIRED_PROD_ENVS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
] as const;

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
      `FATAL: Production ortamında 'RESEND_API_KEY' zorunludur. ` + `E-posta gönderimi yapılamaz.`,
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

  // C36: Kick/Twitch hesap bağlama. Bayrak açıkken kimlik bilgisi eksikse fail-fast (yarım yapılandırma
  // sessizce "bağlama çalışmıyor" demektir). Bayrak kapalıyken hiçbiri gerekmez (build-dark).
  const streamLinkRequired: Record<string, readonly string[]> = {
    KICK: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET', 'KICK_REDIRECT_URI'],
    TWITCH: [
      'TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_SECRET',
      'TWITCH_REDIRECT_URI',
      'TWITCH_EVENTSUB_SECRET',
    ],
  };
  for (const [provider, keys] of Object.entries(streamLinkRequired)) {
    if (process.env[`${provider}_ENABLED`] !== 'true') continue;
    for (const key of keys) {
      if (!process.env[key]) {
        throw new Error(`FATAL: ${provider}_ENABLED=true iken '${key}' zorunludur.`);
      }
    }
  }
  const eventsubSecret = process.env.TWITCH_EVENTSUB_SECRET;
  if (
    process.env.TWITCH_ENABLED === 'true' &&
    (!eventsubSecret || eventsubSecret.length < 10 || eventsubSecret.length > 100)
  ) {
    throw new Error('FATAL: TWITCH_EVENTSUB_SECRET 10-100 karakter olmalıdır (Twitch kuralı).');
  }
  const csv = (raw: string | undefined) =>
    (raw ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

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
      // C8-fix: Avatar/afiş gibi profil görselleri AYRI public bucket + özel alan adından sunulur
      // (imzasız <img> GET). Mesaj/DM ekleri private bucket + presigned GET'te kalır (üyelik/scan kapısı).
      // Dev/MinIO'da varsayılan olarak ana bucket'a düşer (mevcut davranış korunur).
      publicBucket: process.env.S3_PUBLIC_BUCKET ?? process.env.S3_BUCKET ?? 'kankaverse',
      publicBaseUrl:
        process.env.S3_PUBLIC_BASE_URL ??
        process.env.S3_PUBLIC_URL ??
        'http://localhost:9000/kankaverse',
    },
    maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '25', 10),
    // C13 — hareketli avatar/afiş (GIF + videodan kesit → sunucuda hareketli WebP). Default KAPALI.
    // Kapatma anahtarı + ileride abonelik kapısının takılacağı tek nokta (canCreateAnimated).
    animatedProfileEnabled: process.env.ANIMATED_PROFILE_ENABLED === 'true',
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH ?? 'ffprobe',
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
    // Sprint M3 — Expo Push gönderimi feature-flag. Default false → PushService no-op
    // (dev build/FCM kimlik bilgisi olmadan sessizce devre dışı; §2.3).
    expoPushEnabled: process.env.EXPO_PUSH_ENABLED === 'true',
    // C14 — yapay zeka ile video üretimi (Pika). Para harcar: yalnız açık liste (AI_VIDEO_USER_IDS) + bayrak + anahtar.
    // PIKA_API_KEY yalnız sunucuda; hiçbir yanıtta/logda görünmez. Varsayılan KAPALI.
    aiVideo: {
      enabled: process.env.AI_VIDEO_ENABLED === 'true',
      apiKey: process.env.PIKA_API_KEY ?? '',
      apiUrl: (process.env.PIKA_API_URL ?? 'https://api.dev.pika.art').replace(/\/+$/, ''),
      // C14b: açık model anahtarları (tablo ai-video.models.ts); eski AI_VIDEO_MODEL/RESOLUTION kalktı
      models: (process.env.AI_VIDEO_MODELS ?? 'wan-3.0')
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0),
      dailyCapUsd: parseFloat(process.env.AI_VIDEO_DAILY_CAP_USD ?? '3'),
      // C33: kullanıcıya görünen birim "kredi"; 1 kredi = bu kadar mikro-USD (10000 = 0,01 $)
      creditMicroUsd: parseInt(process.env.AI_VIDEO_CREDIT_MICRO_USD ?? '10000', 10) || 10000,
      // C39: kilitli kullanıcıya "Ortama katıl" düğmesi için davet kodu. boş env değeri varsayılana düşer
      accessInviteCode: process.env.AI_VIDEO_ACCESS_INVITE_CODE?.trim() || 'QGJVTH5K',
      userIds: (process.env.AI_VIDEO_USER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    },
    // C36 — Kick + Twitch hesap bağlama ve "yayına başladı" duyurusu. Varsayılan KAPALI (sağlayıcı başına).
    // Erişim/yenileme token'ı SAKLANMAZ; yalnız uygulama kimlik bilgileri burada durur (yalnız sunucu).
    streamLink: {
      kick: {
        enabled: process.env.KICK_ENABLED === 'true',
        clientId: process.env.KICK_CLIENT_ID ?? '',
        clientSecret: process.env.KICK_CLIENT_SECRET ?? '',
        redirectUri: process.env.KICK_REDIRECT_URI ?? '',
        // Ek kumar kategorisi kimlikleri (ad deseni zaten kodda; bu liste yalnız genişletir)
        gamblingCategoryIds: csv(process.env.KICK_GAMBLING_CATEGORY_IDS),
      },
      twitch: {
        enabled: process.env.TWITCH_ENABLED === 'true',
        clientId: process.env.TWITCH_CLIENT_ID ?? '',
        clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
        redirectUri: process.env.TWITCH_REDIRECT_URI ?? '',
        eventsubSecret: eventsubSecret ?? '',
        gamblingCategoryIds: csv(process.env.TWITCH_GAMBLING_CATEGORY_IDS),
      },
    },
    // Kayıt modu — kapalı-test fazı (Sprint Closed-Registration)
    // 'open' (default): kayıt açık, davet kodu yok sayılır.
    // 'invite': yalnız geçerli davet koduyla kayıt.
    // 'closed': kayıt tamamen kapalı.
    // Geçersiz değer → fail-closed ('closed'): kayıt açık-kalmasındansa kapalı kalsın (T&S prensibi).
    registrationMode: (() => {
      const raw = process.env.REGISTRATION_MODE ?? 'open';
      if (raw === 'open' || raw === 'invite' || raw === 'closed') {
        return raw;
      }
      // Bilinmeyen değer → fail-closed + uyarı
      console.warn(
        `[config] REGISTRATION_MODE geçersiz değer: '${raw}'. Güvenli taraf için 'closed' kullanılıyor.`,
      );
      return 'closed' as const;
    })(),
  };
};
