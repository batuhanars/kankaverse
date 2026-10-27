-- AlterTable
ALTER TABLE "User" ADD COLUMN     "quickReactions" TEXT[] DEFAULT ARRAY[]::TEXT[];
