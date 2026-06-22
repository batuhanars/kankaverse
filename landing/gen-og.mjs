// Tek seferlik OG kart üreteci (1200x630). Koyu zemin + kor parıltı (SVG) + gerçek logo (composite).
// Çalıştır: npm i sharp --no-save && node gen-og.mjs  → public/og.png. Sonra bu dosya silinir.
import sharp from 'sharp'

const W = 1200
const H = 630
const LOGO_W = 540

// Logoyu hedef genişliğe ölçekle, yüksekliğini öğren
const logoBuf = await sharp('public/kankaverse-logo.png').resize({ width: LOGO_W }).png().toBuffer()
const { height: logoH } = await sharp(logoBuf).metadata()
const logoLeft = Math.round((W - LOGO_W) / 2)
const logoTop = 188

const taglineY = logoTop + logoH + 78
const footerY = H - 70

const bg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="80%" cy="6%" r="65%">
      <stop offset="0%" stop-color="#FF6B3D" stop-opacity="0.22"/>
      <stop offset="55%" stop-color="#FF6B3D" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#1A1817"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <!-- imza altıgen (soluk) -->
  <path transform="translate(96 96) scale(2.1)" d="M30 0 L60 15 L60 45 L30 60 L0 45 L0 15 Z"
        fill="none" stroke="#FF6B3D" stroke-opacity="0.10" stroke-width="2"/>
  <text x="${W / 2}" y="${taglineY}" text-anchor="middle"
        font-family="Figtree, 'Segoe UI', Arial, sans-serif" font-size="38" font-weight="600" fill="#F4F1ED">Türkiye'nin topluluk ve sohbet platformu</text>
  <text x="${W / 2}" y="${footerY}" text-anchor="middle"
        font-family="Figtree, 'Segoe UI', Arial, sans-serif" font-size="22" fill="#847C71">kankaverse.com  ·  Türkçe  ·  yerli  ·  güvenli</text>
</svg>`

await sharp(Buffer.from(bg))
  .composite([{ input: logoBuf, left: logoLeft, top: logoTop }])
  .png()
  .toFile('public/og.png')

console.log(`og.png üretildi (logo ${LOGO_W}x${logoH}, top ${logoTop})`)
