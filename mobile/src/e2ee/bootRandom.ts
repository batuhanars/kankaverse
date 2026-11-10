// Uygulama girişinden (index.js) EN ÖNCE çağrılır: expo-crypto ile `crypto.getRandomValues` kurulur.
// Kurulamazsa E2EE başlamaz (motor `RandomUnavailableError` fırlatır) ve burada loglanır, uygulama açılır.
import * as Crypto from 'expo-crypto'
import { installSecureRandom } from './randomPolyfill'

export function bootSecureRandom(): void {
  let ok = false
  try {
    ok = installSecureRandom((array) => Crypto.getRandomValues(array))
  } catch {
    ok = false
  }
  if (!ok) console.error('[E2EE] güvenli rastgelelik kurulamadı, şifreleme başlatılmayacak')
}
