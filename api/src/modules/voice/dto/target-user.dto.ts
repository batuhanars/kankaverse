import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

// R11B — Yayın-durdur + Odadan-çıkar gövdesi. Hedef kullanıcı id'si.
export class TargetUserDto {
  @ApiProperty({ description: 'Hedef kullanıcı id' })
  @IsString()
  @IsNotEmpty()
  targetUserId!: string;
}
