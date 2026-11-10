import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsNotEmpty,
  IsBase64,
  IsInt,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_CONTENT_MAX } from '../messages.constants';
import { E2EE_CIPHERTEXT_MAX_B64 } from '../../e2ee/e2ee.constants';

export class CreateMessageDto {
  @ApiPropertyOptional({ example: 'Merhaba kankaverse!', maxLength: MESSAGE_CONTENT_MAX })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Mesaj içeriği boş string olamaz.' })
  @MaxLength(MESSAGE_CONTENT_MAX, { message: 'Mesaj en fazla 16.000 karakter olabilir.' })
  content?: string;

  @ApiPropertyOptional({
    description:
      'E1: şifreli DM mesajı (base64, ≤32 KB). Şifreli kanalda ZORUNLU ve `content` verilmemeli (409 E2EE_REQUIRED); şifresiz kanalda 422 E2EE_NOT_ENCRYPTED.',
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  replyToId?: string;

  @ApiPropertyOptional({ type: [String], description: "Eklenecek dosya ID'leri (presign sonrası)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Bir mesaja en fazla 10 dosya eklenebilir.' })
  @IsString({ each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({
    description:
      'İstemci eşleştirme anahtarı (iyimser gönderim). Veritabanına yazılmaz; cevap ve message.created yayınında aynen yankılanır.',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nonce?: string;
}
