-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coralSessionId" TEXT NOT NULL,
    "currentScore" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "weekId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "coralThreadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mentions" TEXT[],
    "isIntermediary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "threadId" TEXT,
    "delta" INTEGER NOT NULL,
    "currentScore" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "agentId" TEXT,
    "messageId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "finalScore" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "prizeAmount" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromWallet" TEXT NOT NULL,
    "toAgent" TEXT NOT NULL,
    "toWallet" TEXT NOT NULL,
    "amount" DECIMAL(10,4) NOT NULL,
    "currency" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "paymentId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "x402Registered" BOOLEAN NOT NULL DEFAULT false,
    "x402ScanUrl" TEXT,
    "x402ScanId" TEXT,
    "x402RegisteredAt" TIMESTAMP(3),
    "x402Error" TEXT,
    "isAgentToAgent" BOOLEAN NOT NULL DEFAULT false,
    "initiatedBy" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "Session_coralSessionId_idx" ON "Session"("coralSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_userId_weekId_key" ON "Session"("userId", "weekId");

-- CreateIndex
CREATE INDEX "Thread_sessionId_agentId_idx" ON "Thread"("sessionId", "agentId");

-- CreateIndex
CREATE INDEX "Thread_coralThreadId_idx" ON "Thread"("coralThreadId");

-- CreateIndex
CREATE INDEX "Message_threadId_timestamp_idx" ON "Message"("threadId", "timestamp");

-- CreateIndex
CREATE INDEX "Score_userId_timestamp_idx" ON "Score"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "Score_sessionId_timestamp_idx" ON "Score"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "Score_category_idx" ON "Score"("category");

-- CreateIndex
CREATE INDEX "Score_agentId_idx" ON "Score"("agentId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_weekId_rank_idx" ON "LeaderboardEntry"("weekId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_userId_weekId_key" ON "LeaderboardEntry"("userId", "weekId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_signature_key" ON "Payment"("signature");

-- CreateIndex
CREATE INDEX "Payment_fromWallet_createdAt_idx" ON "Payment"("fromWallet", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_toWallet_createdAt_idx" ON "Payment"("toWallet", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_signature_idx" ON "Payment"("signature");

-- CreateIndex
CREATE INDEX "Payment_x402Registered_idx" ON "Payment"("x402Registered");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
