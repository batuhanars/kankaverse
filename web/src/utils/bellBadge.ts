/**
 * C75 Rev.4 — zil rozeti: okunmamış bildirimler (MESSAGE_REQUEST hariç) + bekleyen gelen istek sayısı.
 * `unreadCount` sunucudan gelir ve MESSAGE_REQUEST bildirimlerini de içerir; onları düşüp istekleri
 * `requestCount` ile say. Böylece istek her durumda bir kez sayılır (24 sa bildirim sınırı rozeti etkilemez).
 * `unreadRequestNotifs` yalnız yüklü bildirimlerden sayılabildiği için fark negatife düşmesin diye kıstırılır.
 */
export function bellBadgeCount(
  unreadCount: number,
  unreadRequestNotifs: number,
  requestCount: number,
): number {
  return Math.max(0, unreadCount - unreadRequestNotifs) + requestCount
}
