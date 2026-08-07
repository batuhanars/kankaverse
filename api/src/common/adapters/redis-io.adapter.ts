import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly allowedOrigin: string;

  /**
   * @param app NestJS application ref (INestApplicationContext | object)
   * @param allowedOrigin WebSocket CORS origin — config'ten gelir (FRONTEND_URL).
   *   Dev: 'http://localhost:5173', prod: gerçek frontend URL.
   */
  constructor(app: object, allowedOrigin: string) {
    super(app);
    this.allowedOrigin = allowedOrigin;
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    // CORS: origin config'ten gelir; credentials true (httpOnly cookie auth)
    const serverOptions: Partial<ServerOptions> = {
      ...options,
      cors: {
        origin: this.allowedOrigin,
        credentials: true,
      },
    };
    // Nest'in IoAdapter.createIOServer imzası `any` döner (üçüncü parti tip) — Server'a assert ediyoruz.
    const server = super.createIOServer(port, serverOptions) as Server;
    server.adapter(this.adapterConstructor);
    return server;
  }
}
