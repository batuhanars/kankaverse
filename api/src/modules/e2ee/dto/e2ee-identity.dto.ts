import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReauthFieldsDto } from '../../auth/dto/reauth-fields.dto';
import {
  E2EE_BACKUP_WRAPPED_B64_RE,
  E2EE_IDENTITY_KEY_B64_RE,
  E2EE_IDENTITY_MAX_SIGNATURES,
  E2EE_IDENTITY_SIG_B64_RE,
} from '../e2ee.constants';

const KEY_MSG = { message: 'Kimlik anahtarı 32 baytlık geçerli bir base64 olmalı.' };
const SIG_MSG = { message: 'İmza 64 baytlık geçerli bir base64 olmalı.' };

/** Bir cihaza atılan kimlik imzası (E7 §2.2). */
export class DeviceSignatureDto {
  @ApiProperty({ description: 'E2eeDevice.id (çağıranın kendi aktif cihazı)' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Ed25519 imzası (64 bayt, base64)' })
  @IsString()
  @Matches(E2EE_IDENTITY_SIG_B64_RE, SIG_MSG)
  sig: string;
}

/** İlk kurulum ve sıfırlama ortak gövdesi: yeni açık anahtar + kendi cihazlarına imzalar. */
export class IdentityMaterialDto {
  @ApiProperty({ description: 'Kimlik açık anahtarı (Ed25519, 32 bayt, base64)' })
  @IsString()
  @Matches(E2EE_IDENTITY_KEY_B64_RE, KEY_MSG)
  publicKey: string;

  @ApiProperty({ type: [DeviceSignatureDto] })
  @IsArray()
  @ArrayMaxSize(E2EE_IDENTITY_MAX_SIGNATURES)
  @ValidateNested({ each: true })
  @Type(() => DeviceSignatureDto)
  signatures: DeviceSignatureDto[];
}

export class PutIdentityDto extends IdentityMaterialDto {}

/** Sıfırlama: reauth + yeni kimlik. Sürüm sunucuda +1 (istemci göndermez; imzalar o sürümle atılmış olmalı). */
export class ResetIdentityDto extends IntersectionType(ReauthFieldsDto, IdentityMaterialDto) {}

export class SignDeviceDto {
  @ApiProperty({ description: 'İmzanın atıldığı kimlik sürümü (güncel olmalı)' })
  @IsInt()
  @Min(1)
  identityVersion: number;

  @ApiProperty({ description: 'Ed25519 imzası (64 bayt, base64)' })
  @IsString()
  @Matches(E2EE_IDENTITY_SIG_B64_RE, SIG_MSG)
  sig: string;
}

export class PutBackupIdentityDto {
  @ApiProperty({
    description: 'BMK ile sarılı kimlik özel anahtarı: nonce(12) + 32 + etiket(16) = 60 bayt',
  })
  @IsString()
  @Matches(E2EE_BACKUP_WRAPPED_B64_RE, {
    message: 'Sarılmış kimlik 60 baytlık geçerli bir base64 olmalı.',
  })
  wrappedIdentity: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  identityVersion: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  keyVersion: number;
}
