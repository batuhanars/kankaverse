import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** AdminGuildDto — C48 Rev 1: platform yöneticisinin ortam listesi satırı (yalnız isModerator okur). */
export class AdminGuildDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ nullable: true, description: 'Statik simge adresi' })
  iconUrl: string | null;
  @ApiProperty() ownerId: string;
  @ApiProperty() ownerUsername: string;
  @ApiProperty({ description: 'Üye sayısı' }) memberCount: number;
  @ApiProperty({ description: 'Keşfet’te listeleniyor mu' }) discoverable: boolean;
  @ApiProperty({ description: 'Oluşturma tarihi (ISO)' }) createdAt: string;
}
