-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "Score" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "walletAddress" TEXT;

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_threadId_senderId_idx" ON "Message"("threadId", "senderId");

-- CreateIndex
CREATE INDEX "Score_userId_createdAt_idx" ON "Score"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Score_sessionId_idx" ON "Score"("sessionId");

-- CreateIndex
CREATE INDEX "Session_walletAddress_idx" ON "Session"("walletAddress");
