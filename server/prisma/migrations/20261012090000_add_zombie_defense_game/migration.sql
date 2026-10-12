CREATE TABLE IF NOT EXISTS "ZombieDefenseAttempt" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "score" INTEGER,
  "waves" INTEGER,
  "durationMs" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ZombieDefenseAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ZombieDefenseAttempt_userId_fkey') THEN
    ALTER TABLE "ZombieDefenseAttempt" ADD CONSTRAINT "ZombieDefenseAttempt_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ZombieDefenseAttempt_userId_score_idx" ON "ZombieDefenseAttempt"("userId", "score");
CREATE INDEX IF NOT EXISTS "ZombieDefenseAttempt_status_completedAt_idx" ON "ZombieDefenseAttempt"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "ZombieDefenseAttempt_userId_startedAt_idx" ON "ZombieDefenseAttempt"("userId", "startedAt");

CREATE TABLE IF NOT EXISTS "ZombieDefenseAchievement" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ZombieDefenseAchievement_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ZombieDefenseAchievement_userId_fkey') THEN
    ALTER TABLE "ZombieDefenseAchievement" ADD CONSTRAINT "ZombieDefenseAchievement_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ZombieDefenseAchievement_userId_code_key" ON "ZombieDefenseAchievement"("userId", "code");
CREATE INDEX IF NOT EXISTS "ZombieDefenseAchievement_userId_unlockedAt_idx" ON "ZombieDefenseAchievement"("userId", "unlockedAt");
CREATE INDEX IF NOT EXISTS "ZombieDefenseAchievement_code_unlockedAt_idx" ON "ZombieDefenseAchievement"("code", "unlockedAt");
