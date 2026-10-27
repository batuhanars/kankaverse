import { ApiProperty } from '@nestjs/swagger';

export class FunnelStepsDto {
  @ApiProperty({ description: 'Kohorttaki hesaplar' }) registered: number;
  @ApiProperty({ description: 'En az bir ortama girmiş' }) joinedGuild: number;
  @ApiProperty({ description: 'En az bir mesaj yazmış (DM dahil, silinmiş mesaj da sayılır)' })
  sentMessage: number;
  @ApiProperty({ description: 'Kayıt gününden sonraki bir günde oturum açmış' })
  returnedNextDay: number;
  @ApiProperty({ description: 'Kayıt gününden en az 7 gün sonra oturum açmış' })
  returnedAfter7Days: number;
  @ApiProperty({ description: 'En az 3 farklı takvim gününde oturum açmış' })
  activeOn3Days: number;
}

export class FunnelActivityDto {
  @ApiProperty({ description: 'Son 7 günde oturumu olan (kohorttan bağımsız)' })
  activeLast7Days: number;
  @ApiProperty({ description: 'Son 30 günde oturumu olan (kohorttan bağımsız)' })
  activeLast30Days: number;
  @ApiProperty({ description: 'Son 7 günde kayıt olan (kohorttan bağımsız)' })
  registeredLast7Days: number;
}

/** Yalnız toplam sayılar; kullanıcı bazlı veri YOK (KVKK). Silinmiş hesap ve platform yöneticileri sayılmaz. */
export class FunnelDto {
  @ApiProperty({ enum: [0, 30, 90], description: '0 = tümü' }) cohortDays: number;
  @ApiProperty() generatedAt: string;
  @ApiProperty({ type: FunnelStepsDto }) steps: FunnelStepsDto;
  @ApiProperty({ type: FunnelActivityDto }) activity: FunnelActivityDto;
}
