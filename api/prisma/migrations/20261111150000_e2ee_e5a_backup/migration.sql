-- CreateTable
CREATE TABLE "E2eeBackup" (
    "userId" TEXT NOT NULL,
    "salt" BYTEA NOT NULL,
    "params" JSONB NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eeBackup_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "E2eeBackupSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "E2eeBackupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "E2eeBackupSnapshot_userId_idx" ON "E2eeBackupSnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "E2eeBackupSnapshot_userId_deviceId_key" ON "E2eeBackupSnapshot"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "E2eeBackup" ADD CONSTRAINT "E2eeBackup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

