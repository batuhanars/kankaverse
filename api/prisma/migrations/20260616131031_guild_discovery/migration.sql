-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "bannerColor" TEXT,
ADD COLUMN     "discoverable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Guild_discoverable_idx" ON "Guild"("discoverable");
