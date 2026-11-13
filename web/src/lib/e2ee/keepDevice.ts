// C69: şifreleme cihazını çıkışta KORUYAN istemci mi? Yalnız masaüstü uygulaması (Electron köprüsü var).
// Düz tarayıcı ortak bilgisayar olabilir: çıkışta ve girişte bugünkü gibi her şey silinir. Karar tek yerde.
export function keepsE2eeDevice(): boolean {
  return typeof window !== 'undefined' && window.kankaverse?.isElectron === true
}
