import { request, type RequestOptions } from "./request";

export interface YaodaNaiRankingEntry {
  rank: number;
  userId: number;
  name: string;
  avatar?: string | null;
  bestScore: number;
  bestLevel: number;
  games: number;
  totalScore: number;
  totalDrops: number;
  achievementCount: number;
  updatedAt?: string | null;
}

export interface YaodaNaiAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface YaodaNaiLeaderboard {
  leaderboard: YaodaNaiRankingEntry[];
  me: YaodaNaiRankingEntry | null;
  totalPlayers: number;
  achievements: YaodaNaiAchievement[];
  newlyUnlocked: Array<{ code: string; title: string; icon: string }>;
}

export const yaodaNaiApi = {
  leaderboard: (options?: RequestOptions) => request.get<YaodaNaiLeaderboard>(
    "/tools/yaoda-nai/leaderboard",
    undefined,
    { cacheTtlMs: 15_000, suppressErrorMessage: true, ...options },
  ),
  startAttempt: (options?: RequestOptions) => request.post<{ id: number; startedAt: string }>(
    "/tools/yaoda-nai/attempts",
    {},
    options,
  ),
  abandonAttempt: (id: number, options?: RequestOptions) => request.post<{ abandoned: boolean }>(
    `/tools/yaoda-nai/attempts/${id}/abandon`,
    {},
    options,
  ),
  finishAttempt: (id: number, payload: { score: number; drops: number; level: number; durationMs: number }, options?: RequestOptions) =>
    request.post<YaodaNaiLeaderboard>(`/tools/yaoda-nai/attempts/${id}/finish`, payload, options),
};
