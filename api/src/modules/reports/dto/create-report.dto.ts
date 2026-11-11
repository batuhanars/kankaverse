import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsInt,
  Min,
  IsBase64,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportTarget, ReportReason } from '@prisma/client';
import { MESSAGE_CONTENT_MAX } from '../../messages/messages.constants';
import { REPORT_EVIDENCE_MAX } from '../../e2ee/e2ee.constants';

/** E4 §3.3: şifreli sohbette şikâyetçinin cihazından iletilen çözülmüş mesaj. */
export class ReportEvidenceItemDto {
  @ApiProperty()
  @IsString()
  messageId: string;

  @ApiProperty({ maxLength: MESSAGE_CONTENT_MAX, description: 'Şikâyetçinin çözdüğü düz metin' })
  @IsString()
  @MaxLength(MESSAGE_CONTENT_MAX)
  body: string;

  @ApiProperty({ description: 'Yük içindeki `sentAt` (ms); parmak izi doğrulaması bunu kullanır' })
  @IsInt()
  @Min(0)
  sentAt: number;

  @ApiPropertyOptional({ description: 'Mesajın parmak izi anahtarı (base64, v2 yükten)' })
  @IsOptional()
  @IsString()
  @IsBase64()
  @MaxLength(64)
  fk?: string;
}

export class CreateReportDto {
  @ApiProperty({ enum: ReportTarget })
  @IsEnum(ReportTarget)
  targetType: ReportTarget;

  @ApiProperty()
  @IsString()
  targetId: string;

  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    type: [ReportEvidenceItemDto],
    maxItems: REPORT_EVIDENCE_MAX,
    description:
      'E4: yalnız ŞİFRELİ mesaj hedefinde anlamlı (hedef + önceki 5, çözülmüş). Şifresiz mesajda yok sayılır; sunucu kendisi okur.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REPORT_EVIDENCE_MAX, { message: 'En fazla 6 kanıt mesajı iletilebilir.' })
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceItemDto)
  evidence?: ReportEvidenceItemDto[];
}
