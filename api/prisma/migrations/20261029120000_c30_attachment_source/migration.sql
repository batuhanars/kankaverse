-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "sourceAttachmentId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_sourceAttachmentId_idx" ON "Attachment"("sourceAttachmentId");
