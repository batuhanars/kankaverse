// Güvenlik ağı: kök '/' artık tanıtım sitesi. Eski masaüstü sürümleri (APP_URL=kök gömülü)
// güncellenene dek landing'i yükler → Electron tespit edilince app ana ekranına yönlendir.
// Yeni masaüstü build'i zaten doğrudan /channels/@me yükler; bu yalnız kurulu eski istemciler için.
export default defineNuxtPlugin(() => {
  if (import.meta.client && /Electron/i.test(navigator.userAgent)) {
    window.location.replace('/channels/@me')
  }
})
