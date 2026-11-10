/**
 * `JwtStrategy.validate()` (modules/auth/strategies/jwt.strategy.ts) döndürdüğü ve passport'un
 * `request.user`'a yazdığı şekil. Guard/decorator'larda `any`-erişimini önlemek için paylaşılan tip
 * (D41 lint hijyeni, 2026-08-07) — davranış değişikliği yok, yalnız tip anotasyonu.
 */
export interface RequestUser {
  id: string;
  username: string;
  sessionId: string;
  /** Refresh rotasyonunda sabit oturum zinciri (E1: E2EE cihazı buna bağlı). */
  tokenFamily: string;
  emailVerifiedAt: Date | null;
  isModerator: boolean;
}

export interface AuthenticatedRequest {
  user?: RequestUser;
}
