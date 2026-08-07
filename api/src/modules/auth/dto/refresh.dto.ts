import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Cookie yoksa (native istemci) gövdeden kabul edilir — Sprint M0 contract §2.3.
// Cookie varsa gövde yok sayılır, bugünkü davranış değişmez.
export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Yalnız cookie yokken kullanılır (mobil istemci, X-Client-Type: mobile ile alınan token)',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
