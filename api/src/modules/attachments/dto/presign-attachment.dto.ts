import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PresignAttachmentDto {
  @ApiProperty({ example: 'görsel.png' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({ example: 1048576, description: 'Dosya boyutu (byte)' })
  @IsInt()
  @Min(1)
  size: number;
}
