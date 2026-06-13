import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameGroupDmDto {
  @ApiProperty({ description: 'Yeni grup adı (maks 50 karakter)', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  name: string;
}
