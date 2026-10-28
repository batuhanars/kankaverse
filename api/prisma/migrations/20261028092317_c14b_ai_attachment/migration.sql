-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "aiGenerationId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_aiGenerationId_idx" ON "Attachment"("aiGenerationId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_aiGenerationId_fkey" FOREIGN KEY ("aiGenerationId") REFERENCES "AiVideoGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
