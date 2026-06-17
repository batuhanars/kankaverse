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

  // Kanal room'una yay (room:<channelId>) — mesaj/typing + bağlı oda olayları için.
  emitToRoom(channelId: string, event: string, payload: unknown) {
    this.server?.to(`room:${channelId}`).emit(event, payload);
  }

  // Ses presence room'una yay (voice:<channelId>) — kanala bağlı olmasa da sidebar'da
  // "kim var" listesini izleyen herkes (VoiceParticipantList aboneliği). room:<id>'den
  // AYRI: aktif kanal join'i ile çakışmaz; gözlemci girip/çıkışı canlı görür.
  emitToVoicePresence(channelId: string, event: string, payload: unknown) {
    this.server?.to(`voice:${channelId}`).emit(event, payload);
  }
}
