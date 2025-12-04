-- AlterTable
ALTER TABLE "Message" ADD COLUMN "coralMessageId" TEXT;

-- CreateIndex (unique constraint to prevent duplicate agent messages)
-- Note: This allows NULL values (for user messages) but ensures no duplicate coralMessageIds per thread
CREATE UNIQUE INDEX "Message_threadId_coralMessageId_key" ON "Message"("threadId", "coralMessageId");

