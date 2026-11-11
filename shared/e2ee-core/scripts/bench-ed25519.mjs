// Ölçüm betiği (yalnız Node): Ed25519 doğrulamasının İLK (soğuk) ve SICAK süresi, BASE önhesaplama pencere
// boyutuna göre. Kullanım: node scripts/bench-ed25519.mjs [pencere]   (boş = kütüphane varsayılanı, W=8).
// Her pencere AYRI süreçte koşulmalı ki "ilk doğrulama" gerçekten soğuk olsun; bu yüzden imza, anahtar
// üretmeden (önhesaplamayı tetikler) sabit test vektöründen alınır. Anahtar/içerik gerçek değil.
import { ed25519 } from '@noble/curves/ed25519.js'

const hex = (s) => Uint8Array.from(Buffer.from(s, 'hex'))
const pk = hex('ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c')
const sig = hex(
  'f6813347985c934e61b0b3b8d6c3d50d9872455a25a00952795b5a6bd682a47a6ab303bfe912c8d8f03b2016835258d2bb3152efb8a63f2c54f7d1a801b50d02',
)
const msg = new Uint8Array(200).fill(3)

const arg = process.argv[2]
if (arg !== undefined) ed25519.Point.BASE.precompute(Number(arg), true) // tembel: tablo ilk kullanımda kurulur

const verify = () => ed25519.verify(sig, msg, pk, { zip215: false })
const t0 = performance.now()
if (!verify()) throw new Error('doğrulama başarısız')
const cold = performance.now() - t0

const N = 200
verify() // ısınma
const t1 = performance.now()
for (let i = 0; i < N; i++) verify()
const warm = (performance.now() - t1) / N

console.log(`W=${arg ?? 'varsayılan(8)'} ilk=${cold.toFixed(1)}ms sıcak=${(warm * 1000).toFixed(0)}µs/işlem`)
