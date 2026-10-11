CREATE TABLE IF NOT EXISTS "TomatoNoodleAttempt" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "score" INTEGER,
  "bowls" INTEGER,
  "durationMs" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TomatoNoodleAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TomatoNoodleAttempt_userId_fkey') THEN
    ALTER TABLE "TomatoNoodleAttempt" ADD CONSTRAINT "TomatoNoodleAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TomatoNoodleAttempt_userId_score_idx" ON "TomatoNoodleAttempt"("userId", "score");
CREATE INDEX IF NOT EXISTS "TomatoNoodleAttempt_status_completedAt_idx" ON "TomatoNoodleAttempt"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "TomatoNoodleAttempt_userId_startedAt_idx" ON "TomatoNoodleAttempt"("userId", "startedAt");

CREATE TABLE IF NOT EXISTS "TomatoNoodleAchievement" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TomatoNoodleAchievement_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TomatoNoodleAchievement_userId_fkey') THEN
    ALTER TABLE "TomatoNoodleAchievement" ADD CONSTRAINT "TomatoNoodleAchievement_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "TomatoNoodleAchievement_userId_code_key" ON "TomatoNoodleAchievement"("userId", "code");
CREATE INDEX IF NOT EXISTS "TomatoNoodleAchievement_userId_unlockedAt_idx" ON "TomatoNoodleAchievement"("userId", "unlockedAt");
CREATE INDEX IF NOT EXISTS "TomatoNoodleAchievement_code_unlockedAt_idx" ON "TomatoNoodleAchievement"("code", "unlockedAt");
