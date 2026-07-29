import http from './http';

// Sprint M0 contract §2.7 — endpoint imzaları. Alan adları backend DTO'larından birebir okundu
// (contract'ın §2.7 tablosundaki `emailOrUsername` bir paraphrase'di; gerçek `LoginDto` alanı
// `identifier` — api/src/modules/auth/dto/login.dto.ts:11). Contract §2.7 dipnotu bunu emrediyor:
// "DTO alan adları mevcut LoginDto / Login2faDto'dan birebir okunur; dev tahmin etmez, dosyaya bakar."

export interface UserDto {
  id: string;
  username: string;
  email: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export interface LoginChallengeDto {
  twoFactorRequired: true;
  challengeToken: string;
}

export interface AuthSessionDto {
  user: UserDto;
  accessToken: string;
  // Yalnız `X-Client-Type: mobile` başlığıyla gelen istekte dolu (contract §2.2).
  refreshToken?: string;
}

export const authApi = {
  async login(payload: LoginPayload): Promise<AuthSessionDto | LoginChallengeDto> {
    const res = await http.post<AuthSessionDto | LoginChallengeDto>('/auth/login', payload);
    return res.data;
  },
  async loginTwoFa(challengeToken: string, code: string): Promise<AuthSessionDto> {
    const res = await http.post<AuthSessionDto>('/auth/login/2fa', { challengeToken, code });
    return res.data;
  },
  async me(): Promise<UserDto> {
    const res = await http.get<UserDto>('/auth/me');
    return res.data;
  },
  async logout(): Promise<null> {
    const res = await http.post<null>('/auth/logout');
    return res.data;
  },
};
