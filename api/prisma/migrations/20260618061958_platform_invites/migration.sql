-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformInviteId" TEXT;

-- CreateTable
CREATE TABLE "PlatformInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvite_code_key" ON "PlatformInvite"("code");

-- CreateIndex
CREATE INDEX "PlatformInvite_creatorId_idx" ON "PlatformInvite"("creatorId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_platformInviteId_fkey" FOREIGN KEY ("platformInviteId") REFERENCES "PlatformInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformInvite" ADD CONSTRAINT "PlatformInvite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
