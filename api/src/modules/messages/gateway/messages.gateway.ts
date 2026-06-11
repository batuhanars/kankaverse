import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { HttpException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MembershipService } from '../../../shared/membership/membership.service';

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
    private membership: MembershipService,
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
      socket.emit('auth_error', { error: 'UNAUTHORIZED' });
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

    // Yetki kontrolü tek kaynak (MembershipService); HTTP exception → WS ack'e çevrilir
    try {
      await this.membership.requireChannelAccess(userId, channelId);
    } catch (e) {
      const res = e instanceof HttpException ? (e.getResponse() as { error?: string }) : null;
      return { ok: false, error: res?.error ?? 'FORBIDDEN' };
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
