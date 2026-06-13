import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportTarget, ReportReason } from '@prisma/client';

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
}
