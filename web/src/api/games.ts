import http from './axios'

// C31b §1.5 — masaüstü süreç eşlemesi için elle oyun listesi (yalnız CURATED)
export interface CuratedGameDto {
  id: string
  name: string
  executables: string[]
}

export const gamesApi = {
  curated: () => http.get<CuratedGameDto[]>('/games/curated'),
}
