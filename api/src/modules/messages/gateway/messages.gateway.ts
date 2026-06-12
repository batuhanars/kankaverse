import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { HttpException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MembershipService } from '../../../shared/membership/membership.service';
import { RealtimeService } from '../../../shared/realtime/realtime.service';

interface AuthSocket extends Socket {
  data: { userId: string; sessionId: string; username?: string };
}

@WebSocketGateway({ cors: { origin: '*' } })
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private membership: MembershipService,
    private realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

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

      // username'i handshake'te önbelleğe al; typing broadcast'te tekrar sorguya gerek kalmaz
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { username: true },
      });
      socket.data.username = user?.username ?? payload.sub;

      socket.join(`user:${payload.sub}`);
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

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    try {
      await this.membership.requireChannelAccess(userId, channelId);
    } catch {
      // Sessiz drop: erişim yoksa veya yaş kısıtlıysa yaymadan ack ile dön
      return { ok: false };
    }

    const username = socket.data.username ?? userId;
    socket.to(`room:${channelId}`).emit('typing:update', { userId, username, channelId });
    return { ok: true };
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string },
  ) {
    const userId = socket.data.userId;
    const { channelId } = payload;

    try {
      await this.membership.requireChannelAccess(userId, channelId);
    } catch {
      // Sessiz drop
      return { ok: false };
    }

    const username = socket.data.username ?? userId;
    socket.to(`room:${channelId}`).emit('typing:clear', { userId, username, channelId });
    return { ok: true };
  }

  broadcastMessage(channelId: string, messageDto: unknown) {
    this.server.to(`room:${channelId}`).emit('message.created', messageDto);
  }
}
