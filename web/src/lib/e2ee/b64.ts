// Standart base64 (padding'li): sunucu sözleşmesi baytları JSON'da böyle taşır (E1 §2).

export function toB64(bytes: Uint8Array): string {
  let bin = ''
  // Parça parça: büyük dizilerde String.fromCharCode(...bytes) çağrı yığınını taşırır.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

export function fromB64(text: string): Uint8Array {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
