import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'

// Prod: VITE_API_URL = https://api.<domain> (api kök'ten servis eder: /auth, /channels …).
// Dev: tanımsız → '/api' (vite proxy 127.0.0.1:3001'e rewrite eder). Tek değişken iki ortamı kapsar.
const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // refresh httpOnly cookie için (alt-domain → sameSite:'lax' yeterli)
})

// In-flight refresh promise — eş zamanlı 401'lerde tek refresh
let refreshPromise: Promise<string> | null = null

export function getAccessToken(): string | null {
  return sessionStorage.getItem('kv_access_token')
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem('kv_access_token', token)
}

export function clearAccessToken(): void {
  sessionStorage.removeItem('kv_access_token')
}

async function doRefresh(): Promise<string> {
  const res = await axios.post<ApiResponse<{ accessToken: string }>>(
    '/api/auth/refresh',
    {},
    { withCredentials: true },
  )
  const token = res.data.data.accessToken
  setAccessToken(token)
  return token
}

// Request interceptor — Bearer token ekle
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — envelope unwrap + 401 refresh
http.interceptors.response.use(
  (response) => {
    // envelope'dan data'yı çıkar; callers response.data alır
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = response.data.data
    }
    return response
  },
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => {
            refreshPromise = null
          })
        }
        const newToken = await refreshPromise
        original.headers.Authorization = `Bearer ${newToken}`
        return http(original)
      } catch {
        clearAccessToken()
        // Login'e yönlendir — router import döngüsünden kaçınmak için event
        window.dispatchEvent(new CustomEvent('kv:auth:expired'))
      }
    }
    return Promise.reject(error)
  },
)

export default http
