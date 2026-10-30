import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const AI_GRANT_MAX_CREDITS = 100_000;
export const AI_GRANT_NOTE_MAX = 200;

/** `PUT /admin/ai-video/grants/:userId`: oluştur ya da yenile (yeni dönem başlatır). */
export class UpsertAiVideoGrantDto {
  @ApiProperty({ minimum: 1, maximum: AI_GRANT_MAX_CREDITS, description: 'Kredi bütçesi' })
  @IsInt()
  @Min(1)
  @Max(AI_GRANT_MAX_CREDITS)
  budgetCredits!: number;

  @ApiPropertyOptional({ nullable: true, description: 'ISO bitiş; yok/null = süresiz' })
  @ValidateIf((o: UpsertAiVideoGrantDto) => o.expiresAt !== undefined && o.expiresAt !== null)
  @IsISO8601()
  expiresAt?: string | null;

  @ApiPropertyOptional({ maxLength: AI_GRANT_NOTE_MAX, description: 'Yalnız admin içindir' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(AI_GRANT_NOTE_MAX)
  note?: string;
}

export class AiVideoGrantRowDto {
  @ApiProperty() user!: { id: string; username: string };
  @ApiProperty() budgetCredits!: number;
  @ApiProperty() spentCredits!: number;
  @ApiProperty() startsAt!: string;
  @ApiProperty({ nullable: true }) expiresAt!: string | null;
  @ApiProperty({ nullable: true }) revokedAt!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'REVOKED'] })
  status!: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'REVOKED';
  @ApiProperty({ nullable: true }) note!: string | null;
  @ApiProperty() grantedBy!: { id: string; username: string };
}
