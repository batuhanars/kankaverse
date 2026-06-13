import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AddReactionDto {
  @ApiProperty({ description: 'Emoji (unicode veya kısa string, 1-32 karakter)', example: '👍' })
  @IsString()
  @Length(1, 32)
  emoji: string;
}
