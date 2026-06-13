import { IsArray, IsString, ArrayMinSize, ArrayMaxSize, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDmDto {
  @ApiProperty({ description: '1-9 benzersiz üye ID (kendini içermez)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(9)
  @IsString({ each: true })
  memberIds: string[];

  @ApiPropertyOptional({ description: 'Grup adı (opsiyonel, maks 50 karakter)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;
}
