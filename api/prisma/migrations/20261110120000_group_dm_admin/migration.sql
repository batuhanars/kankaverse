-- Grup DM yöneticisi: kurucu (Channel.ownerId) üyelere yönetici yetkisi verebilir.
-- Yönetici normal üyelerin mesajını silebilir, onları çıkarabilir, grubu yeniden adlandırabilir.
ALTER TABLE "ChannelMember" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
