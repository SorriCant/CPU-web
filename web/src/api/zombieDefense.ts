import { request, type RequestOptions } from "./request";

export interface ZombieDefenseRankingEntry {
  rank: number;
  userId: number;
  name: string;
  avatar?: string | null;
  bestScore: number;
  bestWaves: number;
  games: number;
  totalScore: number;
  totalWaves: number;
  achievementCount: number;
  updatedAt?: string | null;
}

export interface ZombieDefenseAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface ZombieDefenseLeaderboard {
  leaderboard: ZombieDefenseRankingEntry[];
  me: ZombieDefenseRankingEntry | null;
  totalPlayers: number;
  achievements: ZombieDefenseAchievement[];
  newlyUnlocked: Array<{ code: string; title: string; icon: string }>;
}

export const zombieDefenseApi = {
  leaderboard: (options?: RequestOptions) => request.get<ZombieDefenseLeaderboard>(
    "/tools/zombie-defense/leaderboard",
    undefined,
    { cacheTtlMs: 15_000, suppressErrorMessage: true, ...options },
  ),
  startAttempt: (options?: RequestOptions) => request.post<{ id: number; startedAt: string }>(
    "/tools/zombie-defense/attempts",
    {},
    options,
  ),
  abandonAttempt: (id: number, options?: RequestOptions) => request.post<{ abandoned: boolean }>(
    `/tools/zombie-defense/attempts/${id}/abandon`,
    {},
    options,
  ),
  finishAttempt: (id: number, payload: { score: number; waves: number; durationMs: number }, options?: RequestOptions) =>
    request.post<ZombieDefenseLeaderboard>(`/tools/zombie-defense/attempts/${id}/finish`, payload, options),
};
