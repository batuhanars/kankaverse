import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

// E8 §3.1 — katılım tokeni isteği. Eski istemciler gövde göndermez → `callE2ee` yok = şifreli aramayı yapamaz.
export class VoiceTokenDto {
  @ApiPropertyOptional({ description: 'İstemci DM aramasını uçtan uca şifreleyebilir (E8)' })
  @IsOptional()
  @IsBoolean()
  callE2ee?: boolean;
}
