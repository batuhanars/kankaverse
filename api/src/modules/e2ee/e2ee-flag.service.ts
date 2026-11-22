import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * §2.2 uygunluk: bayrak açık VE (liste boş VEYA kullanıcı listede).
 * 🔴 Prod'a liste dolu gider; boş liste = herkes, §0 kapısından önce YASAK.
 */
@Injectable()
export class E2eeFlagService {
  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('e2eeEnabled') === true;
  }

  /** E4 §2.2: istemci yalnız true iken v2 (parmak izli) yük gönderir. Varsayılan false. */
  get franking(): boolean {
    return this.config.get<boolean>('e2eeFranking') === true;
  }

  /** E5a: şifreli DM yedeği uçları açık mı (uygunluk ayrıca isEligible ile). Varsayılan false. */
  get backup(): boolean {
    return this.config.get<boolean>('e2eeBackup') === true;
  }

  /** E5b: cihazdan cihaza geçmiş aktarımı uçları açık mı (uygunluk ayrıca isEligible ile). Varsayılan false. */
  get transfer(): boolean {
    return this.config.get<boolean>('e2eeTransfer') === true;
  }

  /**
   * E8: şifreli kanallarda (E2eeGroup olan DM/grup DM) arama da şifreli mi. Varsayılan false.
   * Açıkken yeteneğini bildirmeyen istemci o aramaya giremez (426), şifresize düşme yok.
   */
  get calls(): boolean {
    return this.enabled && this.config.get<boolean>('e2eeCalls') === true;
  }

  /** E8 ilk aşama: arama şifrelemesi izin listesi dolu mu (doluysa kanal üyeleri ayrıca denetlenir). */
  get callsRestricted(): boolean {
    return (this.config.get<string[]>('e2eeCallUserIds') ?? []).length > 0;
  }

  /**
   * E8 ilk aşama: bu üyelerle arama şifrelenebilir mi. Liste boş = evet; doluysa TÜM üyeler listede olmalı.
   * Karar arayana değil kanala bağlı: aynı aramadaki herkes aynı sonucu alır (biri şifreli biri şifresiz olamaz).
   */
  callsAllowedFor(memberIds: string[]): boolean {
    const allow = this.config.get<string[]>('e2eeCallUserIds') ?? [];
    return allow.length === 0 || memberIds.every((id) => allow.includes(id));
  }

  isEligible(userId: string): boolean {
    if (!this.enabled) return false;
    const allow = this.config.get<string[]>('e2eeUserIds') ?? [];
    return allow.length === 0 || allow.includes(userId);
  }
}
