import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBase64,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  E2EE_CLAIM_MAX_DEVICES,
  E2EE_HANDSHAKE_MAX_B64,
  E2EE_KEY_PACKAGE_MAX_B64,
  E2EE_KEY_PACKAGES_PER_CALL,
  E2EE_PLATFORMS,
  E2EE_WELCOMES_PER_REQUEST,
} from '../e2ee.constants';

const B64 = { message: 'Geçerli bir base64 değeri gerekli.' };

export class RegisterDeviceDto {
  @ApiProperty({ enum: E2EE_PLATFORMS })
  @IsIn(E2EE_PLATFORMS, { message: 'Geçersiz platform.' })
  platform: 'web' | 'android';

  @ApiProperty({ description: 'MLS imza açık anahtarı (Ed25519, 32 bayt), base64' })
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(64)
  signatureKey: string;
}

export class UploadKeyPackagesDto {
  @ApiProperty({ type: [String], description: 'KeyPackage listesi (base64), en çok 50' })
  @IsArray()
  @ArrayMaxSize(E2EE_KEY_PACKAGES_PER_CALL, { message: 'Tek çağrıda en fazla 50 KeyPackage.' })
  @IsString({ each: true })
  @IsBase64(undefined, { each: true, ...B64 })
  @MaxLength(E2EE_KEY_PACKAGE_MAX_B64, { each: true })
  keyPackages: string[];

  @ApiPropertyOptional({ description: 'Son çare KeyPackage (base64); eskisinin yerine geçer' })
  @IsOptional()
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(E2EE_KEY_PACKAGE_MAX_B64)
  lastResort?: string;
}

export class ClaimKeyPackagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(E2EE_CLAIM_MAX_DEVICES)
  @IsString({ each: true })
  deviceIds: string[];
}

export class WelcomeItemDto {
  @ApiProperty()
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Opak MLS Welcome (base64)' })
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(E2EE_HANDSHAKE_MAX_B64)
  welcome: string;
}

export class CreateGroupDto {
  @ApiProperty({ description: 'MLS group_id (32 bayt, base64)' })
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(64)
  groupId: string;

  @ApiProperty({ description: 'Opak MLS commit (base64)' })
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(E2EE_HANDSHAKE_MAX_B64)
  commit: string;

  @ApiProperty({ type: [WelcomeItemDto] })
  @IsArray()
  @ArrayMaxSize(E2EE_WELCOMES_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => WelcomeItemDto)
  welcomes: WelcomeItemDto[];
}

export class PostCommitDto {
  @ApiProperty({ description: 'Commit’in uygulandığı epoch' })
  @IsInt()
  @Min(0)
  @Max(2_000_000_000)
  epoch: number;

  @ApiProperty({ description: 'Opak MLS commit (base64)' })
  @IsString()
  @IsBase64(undefined, B64)
  @MaxLength(E2EE_HANDSHAKE_MAX_B64)
  commit: string;

  @ApiPropertyOptional({ type: [WelcomeItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(E2EE_WELCOMES_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => WelcomeItemDto)
  welcomes?: WelcomeItemDto[];
}
