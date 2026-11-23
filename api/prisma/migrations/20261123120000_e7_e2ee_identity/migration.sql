-- AlterTable
ALTER TABLE "E2eeDevice" ADD COLUMN     "identitySig" BYTEA,
ADD COLUMN     "identityVersion" INTEGER;

-- AlterTable
ALTER TABLE "E2eeBackup" ADD COLUMN     "identityVersion" INTEGER,
ADD COLUMN     "wrappedIdentity" BYTEA;

-- CreateTable
CREATE TABLE "E2eeIdentity" (
    "userId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eeIdentity_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "E2eeIdentity" ADD CONSTRAINT "E2eeIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

