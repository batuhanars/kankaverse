-- CreateEnum
CREATE TYPE "E2eeTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVEALED', 'UPLOADED', 'DONE', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'E2EE_TRANSFER';

-- CreateTable
CREATE TABLE "E2eeTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newDeviceId" TEXT NOT NULL,
    "oldDeviceId" TEXT,
    "commit" BYTEA NOT NULL,
    "newPub" BYTEA,
    "newNonce" BYTEA,
    "oldPub" BYTEA,
    "objectKey" TEXT,
    "size" INTEGER,
    "sha256" TEXT,
    "status" "E2eeTransferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eeTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "E2eeTransfer_userId_status_idx" ON "E2eeTransfer"("userId", "status");

-- CreateIndex
CREATE INDEX "E2eeTransfer_expiresAt_idx" ON "E2eeTransfer"("expiresAt");

