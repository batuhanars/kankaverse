-- AlterTable
ALTER TABLE "PushToken" ADD COLUMN     "tokenFamily" TEXT;

-- CreateIndex
CREATE INDEX "PushToken_tokenFamily_idx" ON "PushToken"("tokenFamily");
