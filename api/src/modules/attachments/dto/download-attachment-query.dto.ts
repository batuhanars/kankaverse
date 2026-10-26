import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** GET /attachments/:id query (C15). `download` yalnız `1` / `true` kabul edilir; başka değer 400. */
export class DownloadAttachmentQueryDto {
  @ApiPropertyOptional({
    enum: ['1', 'true'],
    description:
      'İndirme modu: imzalı adres `Content-Disposition: attachment` taşır (dosya adı ekin kayıtlı adı). Yoksa eski davranış.',
  })
  @IsOptional()
  @IsIn(['1', 'true'])
  download?: string;
}
