import {
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsNotEmpty,
  IsBase64,
  IsInt,
  Matches,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MESSAGE_CONTENT_MAX } from '../messages.constants';
import {
  E2EE_CIPHERTEXT_MAX_B64,
  E2EE_MENTION_IDS_MAX,
  FRANKING_TAG_B64_RE,
} from '../../e2ee/e2ee.constants';

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

  @ApiPropertyOptional({
    description:
      'E4: şifreli mesajda gönderen taahhüdü, HMAC-SHA256(fk, canon). Base64, çözülünce TAM 32 bayt (aksi 400). Şifresiz kanalda 422 E2EE_NOT_ENCRYPTED.',
    example: 'yb/XUsdjaj9t0LQy5tJqLI8mENQf5RAKZ8DOkJsZjag=',
  })
  @IsOptional()
  @IsString()
  @Matches(FRANKING_TAG_B64_RE, {
    message: 'Parmak izi, 32 baytlık geçerli bir base64 değeri olmalı.',
  })
  frankingTag?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'E2 Rev.2: şifreli mesajda bahsedilen kullanıcı kimlikleri (düz üst veri, en çok 20). Üye olmayan ve gönderenin kendisi sessizce atılır. Şifresiz mesajda 422 E2EE_NOT_ENCRYPTED.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(E2EE_MENTION_IDS_MAX, { message: 'En fazla 20 kişi etiketlenebilir.' })
  @IsString({ each: true })
  @Matches(/^[a-zA-Z0-9_-]{1,64}$/, { each: true, message: 'Geçersiz kullanıcı kimliği.' })
  mentionUserIds?: string[];

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
