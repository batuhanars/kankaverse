import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BanMemberDto {
  @ApiPropertyOptional({ description: 'Yasak nedeni (opsiyonel, moderasyon kaydı için)', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Yasak nedeni en fazla 500 karakter olabilir.' })
  reason?: string;
}
