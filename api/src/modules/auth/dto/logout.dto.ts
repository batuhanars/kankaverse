import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// C69: gövde tamamen isteğe bağlı. Eski istemciler ve tarayıcı gövde göndermez -> bugünkü davranış (cihaz iptal).
export class LogoutDto {
  @ApiPropertyOptional({
    description:
      'Yalnız true ise E2EE cihazı iptal edilmez, park edilir (mobil/masaüstü, yerel depoyu silmeyen istemciler). Yoksa/false: cihaz iptal.',
  })
  @IsOptional()
  @IsBoolean()
  keepE2eeDevice?: boolean;
}
