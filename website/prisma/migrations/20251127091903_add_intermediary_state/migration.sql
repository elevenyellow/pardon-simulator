-- CreateTable
CREATE TABLE "intermediary_states" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "targetAgent" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intermediary_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intermediary_states_expiresAt_idx" ON "intermediary_states"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "intermediary_states_agentId_threadId_key" ON "intermediary_states"("agentId", "threadId");
