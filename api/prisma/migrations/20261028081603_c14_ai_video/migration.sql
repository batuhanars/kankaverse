-- CreateEnum
CREATE TYPE "AiVideoStatus" AS ENUM ('QUOTED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AiVideoGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputKey" TEXT,
    "resolution" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "quoteMicroUsd" INTEGER NOT NULL,
    "costMicroUsd" INTEGER,
    "providerJobId" TEXT,
    "status" "AiVideoStatus" NOT NULL DEFAULT 'QUOTED',
    "errorCode" TEXT,
    "outputKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiVideoGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiVideoGeneration_userId_createdAt_idx" ON "AiVideoGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiVideoGeneration_status_idx" ON "AiVideoGeneration"("status");

-- AddForeignKey
ALTER TABLE "AiVideoGeneration" ADD CONSTRAINT "AiVideoGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
