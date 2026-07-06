-- AlterEnum
ALTER TYPE "ModActionType" ADD VALUE 'MEDIA_REMOVE';

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "bannerUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bannerUrl" TEXT;
