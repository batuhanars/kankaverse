import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  IsOptional,
  IsBoolean,
  IsArray,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'Moderatör', minLength: 1, maxLength: 50 })
  @IsString()
  @Length(1, 50)
  name: string;

  @ApiProperty({ example: '#FF5733', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Geçerli bir hex renk kodu girin (örn: #FF5733).' })
  color?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  hoist?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  mentionable?: boolean;

  @ApiProperty({ example: ['VIEW_CHANNELS', 'CREATE_INVITE'], required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
