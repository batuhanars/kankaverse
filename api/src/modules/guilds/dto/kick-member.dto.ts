import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class KickMemberDto {
  @ApiPropertyOptional({ description: 'Atma nedeni (opsiyonel, moderasyon kaydı için)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Atma nedeni en fazla 500 karakter olabilir.' })
  reason?: string;
}
