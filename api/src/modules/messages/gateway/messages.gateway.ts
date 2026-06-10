import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

interface AuthSocket extends Socket {
  data: { userId: string; sessionId: string };
}

@WebSocketGateway({ cors: { origin: '*' } })
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(socket: AuthSocket) {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) throw new Error('Token eksik');

      const payload = this.jwtService.verify<{ sub: string; sessionId: string }>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });

      const session = await this.prisma.session.findFirst({
        where: { id: payload.sessionId, revokedAt: null },
      });
      if (!session) throw new Error('Oturum geçersiz');

      socket.data.userId = payload.sub;
      socket.data.sessionId = payload.sessionId;
    } catch {
      socket.emit('connect_error', { error: 'UNAUTHORIZED' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(_socket: AuthSocket) {
    // Temizlik gerekmez; room'lar otomatik ayrılır
  }

  @SubscribeMessage('channel:join')
  async handleChannelJoin(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId, deletedAt: null },
    });

    if (!channel) {
      return { ok: false, error: 'CHANNEL_NOT_FOUND' };
    }

    if (channel.guildId) {
      const membership = await this.prisma.guildMember.findUnique({
        where: { guildId_userId: { guildId: channel.guildId, userId } },
      });
      if (!membership) {
        return { ok: false, error: 'NOT_CHANNEL_MEMBER' };
      }
    }

    socket.join(`room:${channelId}`);
    return { ok: true };
  }

  @SubscribeMessage('channel:leave')
  handleChannelLeave(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    socket.leave(`room:${payload.channelId}`);
  }

  broadcastMessage(channelId: string, messageDto: unknown) {
    this.server.to(`room:${channelId}`).emit('message.created', messageDto);
  }
}
