import { IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export const WEBHOOK_NAME_MAX = 32;

export class CreateWebhookDto {
  @ApiProperty({ description: 'Mesajların yazılacağı metin kanalı (bu ortamdan)' })
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ minLength: 1, maxLength: WEBHOOK_NAME_MAX })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Webhook adı boş olamaz.' })
  @MaxLength(WEBHOOK_NAME_MAX, { message: 'Webhook adı en fazla 32 karakter olabilir.' })
  name: string;
}
