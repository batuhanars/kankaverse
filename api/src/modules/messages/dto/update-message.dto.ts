import {
  IsString,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsBase64,
  IsInt,
  Matches,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_CONTENT_MAX } from '../messages.constants';
import { E2EE_CIPHERTEXT_MAX_B64, FRANKING_TAG_B64_RE } from '../../e2ee/e2ee.constants';

export class UpdateMessageDto {
  @ApiProperty({
    example: 'Düzenlenmiş mesaj içeriği',
    maxLength: MESSAGE_CONTENT_MAX,
    required: false,
    description: 'Düz mesajda zorunlu (şifreli mesajda verilmemeli → 409 E2EE_REQUIRED).',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Mesaj içeriği boş olamaz.' })
  @MaxLength(MESSAGE_CONTENT_MAX, { message: 'Mesaj en fazla 16.000 karakter olabilir.' })
  content?: string;

  @ApiPropertyOptional({
    description: 'E1: şifreli mesajı düzenlemek için yeni şifreli yük (base64, ≤32 KB).',
    maxLength: E2EE_CIPHERTEXT_MAX_B64,
  })
  @IsOptional()
  @IsString()
  @IsBase64(undefined, { message: 'Geçerli bir base64 değeri gerekli.' })
  @MaxLength(E2EE_CIPHERTEXT_MAX_B64, { message: 'Şifreli mesaj en fazla 32 KB olabilir.' })
  ciphertext?: string;

  @ApiPropertyOptional({ description: 'E1: şifrelemede kullanılan MLS epoch (bilgi amaçlı)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  epoch?: number;

  @ApiPropertyOptional({
    description:
      'E4: yeni şifreli yükün taahhüdü (base64, tam 32 bayt). Eskisinin yerine geçer; verilmezse eski silinir (yeni içerikle uyuşmaz).',
  })
  @IsOptional()
  @IsString()
  @Matches(FRANKING_TAG_B64_RE, {
    message: 'Parmak izi, 32 baytlık geçerli bir base64 değeri olmalı.',
  })
  frankingTag?: string;
}
