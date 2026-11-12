import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { E2EE_B64_32_RE, E2EE_BACKUP_SHA256_RE, E2EE_TRANSFER_MAX_BYTES } from '../e2ee.constants';

const B64_32_MSG = { message: '32 baytlık geçerli bir base64 olmalı.' };

/**
 * E5b §3.2: yeni cihaz (N) isteği açar; yalnız taahhüt gider. Çağıranın cihazı GÖVDEDEN alınmaz, oturum
 * zincirinden (`tokenFamily`) çözülür: bir cihaz kendini başka cihaz gibi gösteremez.
 */
export class CreateTransferDto {
  @ApiProperty({ description: 'C = SHA256(pack("kv-e5b-commit-v1", EN, rN)), 32 bayt base64' })
  @IsString()
  @Matches(E2EE_B64_32_RE, B64_32_MSG)
  commit: string;
}

/** Eski cihaz (O) kabul eder ve geçici açık anahtarını verir (cihaz oturumdan). */
export class AcceptTransferDto {
  @ApiProperty({ description: 'EO, X25519 açık anahtar, 32 bayt base64' })
  @IsString()
  @Matches(E2EE_B64_32_RE, B64_32_MSG)
  pub: string;
}

/** N taahhüdü açar. */
export class RevealTransferDto {
  @ApiProperty({ description: 'EN, X25519 açık anahtar, 32 bayt base64' })
  @IsString()
  @Matches(E2EE_B64_32_RE, B64_32_MSG)
  pub: string;

  @ApiProperty({ description: 'rN, taahhüt rastgeleliği, 32 bayt base64' })
  @IsString()
  @Matches(E2EE_B64_32_RE, B64_32_MSG)
  nonce: string;
}

/** O şifreli yükün boyut ve özetini bildirir (presign + commit). */
export class TransferBlobDto {
  @ApiProperty({ description: 'Şifreli yük boyutu (bayt), 1..25 MB' })
  @IsInt({ message: 'Boyut tam sayı olmalı.' })
  @Min(1, { message: 'Boyut en az 1 bayt olmalı.' })
  @Max(E2EE_TRANSFER_MAX_BYTES * 2, { message: 'Boyut çok büyük.' })
  size: number;

  @ApiProperty({ description: 'Şifreli yükün sha256 değeri (küçük harf hex, 64)' })
  @IsString()
  @Matches(E2EE_BACKUP_SHA256_RE, { message: 'sha256 64 karakterlik küçük harf hex olmalı.' })
  sha256: string;
}
