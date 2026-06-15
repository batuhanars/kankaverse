import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  // Birden çok kullanıcıya yay (guild üyelerine broadcast — REV-14 realtime üye olayları).
  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const userId of userIds) {
      this.server?.to(`user:${userId}`).emit(event, payload);
    }
  }

  // Kanal room'una yay (room:<channelId>) — ses presence olayları için.
  emitToRoom(channelId: string, event: string, payload: unknown) {
    this.server?.to(`room:${channelId}`).emit(event, payload);
  }
}
