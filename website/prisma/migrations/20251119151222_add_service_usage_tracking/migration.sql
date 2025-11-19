-- CreateTable
CREATE TABLE "ServiceUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScoreBonus" DOUBLE PRECISION,
    "messagesSinceUse" INTEGER NOT NULL DEFAULT 0,
    "pointsSinceUse" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceUsage_userId_sessionId_idx" ON "ServiceUsage"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "ServiceUsage_weekId_serviceType_idx" ON "ServiceUsage"("weekId", "serviceType");

-- CreateIndex
CREATE INDEX "ServiceUsage_userId_weekId_idx" ON "ServiceUsage"("userId", "weekId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceUsage_userId_weekId_serviceType_agentId_key" ON "ServiceUsage"("userId", "weekId", "serviceType", "agentId");
