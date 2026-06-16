import { Module } from '@nestjs/common';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [InvitesController],
  providers: [InvitesService],
  exports: [InvitesService], // guilds (kankayı ortama davet) bu servisi kullanır
})
export class InvitesModule {}
