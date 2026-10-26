/**
 * Mesaj yazarı select'i (C16). messages.service içindeki tüm mesaj sorguları AYNI şekli kullanır;
 * hareketli avatar alanı (`avatarAnimatedUrl`) tek yerden eklenir. Üye listesi/ses/bildirim
 * select'leri bilinçli olarak bunu KULLANMAZ (C13 kararıyla statik kalır).
 */
export const MESSAGE_AUTHOR_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
  avatarAnimatedUrl: true,
} as const;
