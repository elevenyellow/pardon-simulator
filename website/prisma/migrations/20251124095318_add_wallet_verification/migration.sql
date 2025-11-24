-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "walletSignature" TEXT,
ADD COLUMN     "walletVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "walletVerifiedAt" TIMESTAMP(3);
