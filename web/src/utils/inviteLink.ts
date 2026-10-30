/** Tam davet bağlantısı: origin + /invite/:code (davet paylaşan tüm yüzeylerin tek kaynağı). */
export function inviteUrl(code: string): string {
  return `${window.location.origin}/invite/${code}`
}
