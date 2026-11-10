-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "ciphertext" BYTEA,
ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senderDeviceId" TEXT;

-- CreateTable
CREATE TABLE "E2eeDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenFamily" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "signatureKey" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "E2eeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2eeKeyPackage" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "lastResort" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeKeyPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2eeGroup" (
    "channelId" TEXT NOT NULL,
    "groupId" BYTEA NOT NULL,
    "epoch" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeGroup_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "E2eeHandshake" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "senderDeviceId" TEXT NOT NULL,
    "commit" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeHandshake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "E2eeWelcome" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "targetDeviceId" TEXT NOT NULL,
    "welcome" BYTEA NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "E2eeDevice_tokenFamily_key" ON "E2eeDevice"("tokenFamily");

-- CreateIndex
CREATE INDEX "E2eeDevice_userId_idx" ON "E2eeDevice"("userId");

-- CreateIndex
CREATE INDEX "E2eeKeyPackage_deviceId_consumedAt_idx" ON "E2eeKeyPackage"("deviceId", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "E2eeHandshake_channelId_epoch_key" ON "E2eeHandshake"("channelId", "epoch");

-- CreateIndex
CREATE INDEX "E2eeWelcome_targetDeviceId_deliveredAt_idx" ON "E2eeWelcome"("targetDeviceId", "deliveredAt");

-- AddForeignKey
ALTER TABLE "E2eeDevice" ADD CONSTRAINT "E2eeDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "E2eeKeyPackage" ADD CONSTRAINT "E2eeKeyPackage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "E2eeDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
