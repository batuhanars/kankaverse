import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** C9 — mesaj isteği reddet gövdesi. block=true → istek sahibini de engelle. */
export class RejectRequestDto {
  @ApiPropertyOptional({ description: 'true ise istek sahibi engellenir (tekrar istek atamaz).' })
  @IsOptional()
  @IsBoolean()
  block?: boolean;
}
