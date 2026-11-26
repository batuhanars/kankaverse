-- C75 Rev.6: mesaj istekleri "görüldü" zamaný.
ALTER TABLE "User" ADD COLUMN "messageRequestsSeenAt" TIMESTAMP(3);
