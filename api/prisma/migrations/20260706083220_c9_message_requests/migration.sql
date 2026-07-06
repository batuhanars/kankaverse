-- CreateEnum
CREATE TYPE "DmRequestStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "dmRequestStatus" "DmRequestStatus",
ADD COLUMN     "dmRequesterId" TEXT;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_dmRequesterId_fkey" FOREIGN KEY ("dmRequesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
