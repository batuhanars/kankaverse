import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { GamesController } from './games.controller';

@Module({ imports: [SharedModule], controllers: [GamesController] })
export class GamesModule {}
