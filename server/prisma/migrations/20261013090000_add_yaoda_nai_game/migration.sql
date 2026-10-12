CREATE TABLE IF NOT EXISTS "YaodaNaiAttempt" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "score" INTEGER,
  "drops" INTEGER,
  "level" INTEGER,
  "durationMs" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "YaodaNaiAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'YaodaNaiAttempt_userId_fkey') THEN
    ALTER TABLE "YaodaNaiAttempt" ADD CONSTRAINT "YaodaNaiAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "YaodaNaiAttempt_userId_score_idx" ON "YaodaNaiAttempt"("userId", "score");
CREATE INDEX IF NOT EXISTS "YaodaNaiAttempt_status_completedAt_idx" ON "YaodaNaiAttempt"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "YaodaNaiAttempt_userId_startedAt_idx" ON "YaodaNaiAttempt"("userId", "startedAt");

CREATE TABLE IF NOT EXISTS "YaodaNaiAchievement" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YaodaNaiAchievement_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'YaodaNaiAchievement_userId_fkey') THEN
    ALTER TABLE "YaodaNaiAchievement" ADD CONSTRAINT "YaodaNaiAchievement_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "YaodaNaiAchievement_userId_code_key" ON "YaodaNaiAchievement"("userId", "code");
CREATE INDEX IF NOT EXISTS "YaodaNaiAchievement_userId_unlockedAt_idx" ON "YaodaNaiAchievement"("userId", "unlockedAt");
CREATE INDEX IF NOT EXISTS "YaodaNaiAchievement_code_unlockedAt_idx" ON "YaodaNaiAchievement"("code", "unlockedAt");
