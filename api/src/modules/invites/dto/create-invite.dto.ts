import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiPropertyOptional({ example: 10, description: 'Maksimum kullanım sayısı (1-1000). Boş bırakılırsa sınırsız.' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'maxUses en az 1 olmalıdır.' })
  @Max(1000, { message: 'maxUses en fazla 1000 olabilir.' })
  maxUses?: number;

  @ApiPropertyOptional({ example: 24, description: 'Geçerlilik süresi (saat, 1-720). Boş bırakılırsa süresiz.' })
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'expiresInHours en az 1 olmalıdır.' })
  @Max(720, { message: 'expiresInHours en fazla 720 olabilir.' })
  expiresInHours?: number;
}
