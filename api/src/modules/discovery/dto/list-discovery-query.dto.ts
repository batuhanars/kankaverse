import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** GET /discovery/guilds query — arama + etiket filtre + imleç sayfalama. */
export class ListDiscoveryQueryDto {
  @ApiPropertyOptional({ description: 'Ortam adında arama (case-insensitive contains)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: 'Etiket filtresi (normalize edilir: trim+lowercase)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({ description: 'Sayfalama imleci (önceki yanıtın nextCursor değeri)' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
