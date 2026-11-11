import { ApiProperty } from '@nestjs/swagger';
import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { ReauthFieldsDto } from '../../auth/dto/reauth-fields.dto';
import {
  E2EE_BACKUP_SALT_B64_RE,
  E2EE_BACKUP_SHA256_RE,
  E2EE_BACKUP_WRAPPED_B64_RE,
} from '../e2ee.constants';

const SALT_MSG = { message: 'Tuz 16 baytlık geçerli bir base64 olmalı.' };
const WRAPPED_MSG = { message: 'Sarılmış anahtar 60 baytlık geçerli bir base64 olmalı.' };
const INT_MSG = { message: 'Parametreler tam sayı olmalı.' };

/**
 * Argon2id parametreleri. Burada yalnız TİP doğrulanır; taban/üst sınır servis katmanında,
 * çünkü taban altı özel hata koduyla (400 E2EE_BACKUP_WEAK_PARAMS) dönmeli.
 */
export class BackupParamsDto {
  @ApiProperty({ description: 'Bellek (KiB), taban 19456' })
  @IsInt(INT_MSG)
  m: number;

  @ApiProperty({ description: 'Yineleme, taban 2' })
  @IsInt(INT_MSG)
  t: number;

  @ApiProperty({ description: 'Paralellik, tam 1' })
  @IsInt(INT_MSG)
  p: number;
}

/** Anahtar kaydı gövdesi: tuz + parametre + sarılmış anahtar (sıfırlama ve kurulum ortak). */
export class BackupKeyMaterialDto {
  @ApiProperty({ description: 'Argon2id tuzu (16 bayt, base64)' })
  @IsString()
  @Matches(E2EE_BACKUP_SALT_B64_RE, SALT_MSG)
  salt: string;

  @ApiProperty({ type: BackupParamsDto })
  @ValidateNested()
  @Type(() => BackupParamsDto)
  params: BackupParamsDto;

  @ApiProperty({
    description: 'Sarılmış yedek anahtarı: nonce(12) + şifreli(32) + etiket(16) = 60 bayt, base64',
  })
  @IsString()
  @Matches(E2EE_BACKUP_WRAPPED_B64_RE, WRAPPED_MSG)
  wrappedKey: string;
}

export class PutBackupKeyDto extends BackupKeyMaterialDto {
  @ApiProperty({ description: 'İlk kurulumda 1; şifre değişiminde mevcut sürümle aynı' })
  @IsInt()
  @Min(1)
  keyVersion: number;
}

/** Sıfırlama: reauth + yeni anahtar kaydı; keyVersion sunucuda +1 (istemci göndermez). */
export class ResetBackupDto extends IntersectionType(ReauthFieldsDto, BackupKeyMaterialDto) {}

/** Yedeği kapatma: yalnız reauth. */
export class DeleteBackupDto extends ReauthFieldsDto {}

export class SnapshotRefDto {
  @ApiProperty({ description: 'E2eeDevice.id' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Şifreli görüntü boyutu (bayt), 1..25 MB' })
  @IsInt({ message: 'Boyut tam sayı olmalı.' })
  @Min(1, { message: 'Boyut en az 1 bayt olmalı.' })
  size: number;

  @ApiProperty({ description: 'Şifreli nesnenin sha256 değeri (küçük harf hex, 64)' })
  @IsString()
  @Matches(E2EE_BACKUP_SHA256_RE, { message: 'sha256 64 karakterlik küçük harf hex olmalı.' })
  sha256: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  keyVersion: number;
}
