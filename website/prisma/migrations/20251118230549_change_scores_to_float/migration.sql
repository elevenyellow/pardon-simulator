-- AlterTable: Change score fields from INTEGER to DOUBLE PRECISION (Float)
-- This allows decimal scoring (e.g., 1.8, 2.3, -2.1) instead of only integers

-- Update User table
ALTER TABLE "User" ALTER COLUMN "totalScore" SET DATA TYPE DOUBLE PRECISION;

-- Update Session table  
ALTER TABLE "Session" ALTER COLUMN "currentScore" SET DATA TYPE DOUBLE PRECISION;

-- Update Score table
ALTER TABLE "Score" ALTER COLUMN "delta" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "Score" ALTER COLUMN "currentScore" SET DATA TYPE DOUBLE PRECISION;

-- Update LeaderboardEntry table
ALTER TABLE "LeaderboardEntry" ALTER COLUMN "finalScore" SET DATA TYPE DOUBLE PRECISION;

