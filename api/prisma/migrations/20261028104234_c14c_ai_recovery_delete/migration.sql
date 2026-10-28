-- AlterTable
ALTER TABLE "AiVideoGeneration" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "providerCompletedAt" TIMESTAMP(3);
