import { ApiProperty } from '@nestjs/swagger';

/** C6 — Keşfet kartı için herkese-açık ortam özeti (DiscoveryGuildDto). */
export class DiscoveryGuildDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  iconUrl: string | null;

  @ApiProperty({ nullable: true, description: 'C19 hareketli simge (WebP); iconUrl daima statik' })
  iconAnimatedUrl: string | null;

  @ApiProperty({ nullable: true })
  bannerColor: string | null;

  @ApiProperty({ nullable: true })
  bannerUrl: string | null; // C8 — yüklenmiş afiş görseli (varsa kartta gösterilir, yoksa bannerColor gradient)

  @ApiProperty({ nullable: true, description: 'C19 hareketli afiş (WebP); bannerUrl daima statik' })
  bannerAnimatedUrl: string | null;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  memberCount: number;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  adultsOnly: boolean;
}

/** Keşfet listesi yanıtı: kartlar + sonraki sayfa imleci. */
export class DiscoveryGuildListDto {
  @ApiProperty({ type: [DiscoveryGuildDto] })
  items: DiscoveryGuildDto[];

  @ApiProperty({ nullable: true })
  nextCursor: string | null;
}

/** Popüler etiket çipi. */
export class DiscoveryTagDto {
  @ApiProperty()
  tag: string;

  @ApiProperty()
  count: number;
}
