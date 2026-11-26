-- C75 Rev.7: mesaj isteği başına "görüldü" (alıcının üyelik satırı).
ALTER TABLE "ChannelMember" ADD COLUMN "requestSeenAt" TIMESTAMP(3);
