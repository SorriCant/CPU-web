CREATE TABLE IF NOT EXISTS "GreedyNailongAttempt" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "score" INTEGER,
  "foods" INTEGER,
  "length" INTEGER,
  "durationMs" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GreedyNailongAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GreedyNailongAttempt_userId_fkey') THEN
    ALTER TABLE "GreedyNailongAttempt" ADD CONSTRAINT "GreedyNailongAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GreedyNailongAttempt_userId_score_idx" ON "GreedyNailongAttempt"("userId", "score");
CREATE INDEX IF NOT EXISTS "GreedyNailongAttempt_status_completedAt_idx" ON "GreedyNailongAttempt"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "GreedyNailongAttempt_userId_startedAt_idx" ON "GreedyNailongAttempt"("userId", "startedAt");

CREATE TABLE IF NOT EXISTS "GreedyNailongAchievement" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GreedyNailongAchievement_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GreedyNailongAchievement_userId_fkey') THEN
    ALTER TABLE "GreedyNailongAchievement" ADD CONSTRAINT "GreedyNailongAchievement_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "GreedyNailongAchievement_userId_code_key" ON "GreedyNailongAchievement"("userId", "code");
CREATE INDEX IF NOT EXISTS "GreedyNailongAchievement_userId_unlockedAt_idx" ON "GreedyNailongAchievement"("userId", "unlockedAt");
CREATE INDEX IF NOT EXISTS "GreedyNailongAchievement_code_unlockedAt_idx" ON "GreedyNailongAchievement"("code", "unlockedAt");
