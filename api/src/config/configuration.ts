const REQUIRED_ENVS = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;

export default () => {
  for (const key of REQUIRED_ENVS) {
    if (!process.env[key]) {
      throw new Error(
        `FATAL: Zorunlu ortam değişkeni '${key}' tanımlanmamış. ` +
        `'.env' dosyasını kontrol edin. Uygulama başlamıyor.`,
      );
    }
  }

  if (process.env.NODE_ENV === 'production' && !process.env.RESEND_API_KEY) {
    throw new Error(
      `FATAL: Production ortamında 'RESEND_API_KEY' zorunludur. ` +
      `E-posta gönderimi yapılamaz.`,
    );
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
  };
};
