import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A4 B1b — Mağdurun kendi EMERGENCY raporuna eklediği gönüllü metin beyanı.
 * Yalnız metin (canlı ses "ifade alma" reddedildi). ≤2000 karakter.
 */
export class EmergencyStatementDto {
  @ApiProperty({ description: 'Ne olduğuna dair mağdurun kendi beyanı (gönüllü, metin)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}
