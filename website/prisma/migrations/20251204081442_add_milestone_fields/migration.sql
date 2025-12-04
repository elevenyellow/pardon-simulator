-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "finalScore" DOUBLE PRECISION,
ADD COLUMN     "finalScoreAt" TIMESTAMP(3),
ADD COLUMN     "milestoneShown" BOOLEAN NOT NULL DEFAULT false;
