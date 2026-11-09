import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Expo push token biçimi: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" — sözleşme §2.2.
const EXPO_PUSH_TOKEN_REGEX = /^ExponentPushToken\[[^[\]]+\]$/;

/** POST /notifications/push-tokens body — upsert (token unique; userId çağırandan). */
export class CreatePushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[abcDEF123]' })
  @IsString()
  @IsNotEmpty({ message: 'Token boş olamaz.' })
  @Matches(EXPO_PUSH_TOKEN_REGEX, { message: 'Geçersiz push token biçimi.' })
  token: string;

  @ApiProperty({ enum: ['android', 'ios'], example: 'android' })
  @IsIn(['android', 'ios'], { message: 'Geçersiz platform.' })
  platform: 'android' | 'ios';

  @ApiPropertyOptional({
    example: 'Pixel 8 (dev build)',
    description: 'Teşhis amaçlı; kullanıcıya gösterilmez.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;

  @ApiPropertyOptional({
    enum: [1, 2],
    example: 2,
    description:
      'Push biçimi. 1 (varsayılan) = title/body; 2 = veri-yalnız mesaj bildirimi (C50, istemci kendisi çizer).',
  })
  @IsOptional()
  @IsIn([1, 2], { message: 'Geçersiz push biçimi.' })
  format?: 1 | 2;
}
