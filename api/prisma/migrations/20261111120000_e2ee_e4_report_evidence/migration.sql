-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "frankingTag" BYTEA;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "evidencePurgeAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReportEvidence" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT,
    "channelId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB NOT NULL,
    "messageAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "isTarget" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportEvidence_reportId_idx" ON "ReportEvidence"("reportId");

-- AddForeignKey
ALTER TABLE "ReportEvidence" ADD CONSTRAINT "ReportEvidence_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

