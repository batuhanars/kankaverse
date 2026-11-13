-- AlterTable
ALTER TABLE "E2eeDevice" ADD COLUMN     "parkedAt" TIMESTAMP(3),
ALTER COLUMN "tokenFamily" DROP NOT NULL;

-- CreateTable
CREATE TABLE "E2eeRebindNonce" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nonce" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "E2eeRebindNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "E2eeRebindNonce_nonce_key" ON "E2eeRebindNonce"("nonce");

-- CreateIndex
CREATE INDEX "E2eeRebindNonce_userId_idx" ON "E2eeRebindNonce"("userId");

-- CreateIndex
CREATE INDEX "E2eeRebindNonce_expiresAt_idx" ON "E2eeRebindNonce"("expiresAt");

-- CreateIndex
CREATE INDEX "E2eeDevice_parkedAt_idx" ON "E2eeDevice"("parkedAt");
