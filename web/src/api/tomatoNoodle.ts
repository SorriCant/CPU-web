import { request, type RequestOptions } from "./request";

export interface TomatoNoodleRankingEntry {
  rank: number;
  userId: number;
  name: string;
  avatar?: string | null;
  bestScore: number;
  bestBowls: number;
  games: number;
  totalScore: number;
  totalBowls: number;
  achievementCount: number;
  updatedAt?: string | null;
}

export interface TomatoNoodleAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface TomatoNoodleLeaderboard {
  leaderboard: TomatoNoodleRankingEntry[];
  me: TomatoNoodleRankingEntry | null;
  totalPlayers: number;
  achievements: TomatoNoodleAchievement[];
  newlyUnlocked: Array<{ code: string; title: string; icon: string }>;
}

export const tomatoNoodleApi = {
  leaderboard: (options?: RequestOptions) => request.get<TomatoNoodleLeaderboard>(
    "/tools/tomato-egg-noodles/leaderboard",
    undefined,
    { cacheTtlMs: 15_000, suppressErrorMessage: true, ...options },
  ),
  startAttempt: (options?: RequestOptions) => request.post<{ id: number; startedAt: string }>(
    "/tools/tomato-egg-noodles/attempts",
    {},
    options,
  ),
  abandonAttempt: (id: number, options?: RequestOptions) => request.post<{ abandoned: boolean }>(
    `/tools/tomato-egg-noodles/attempts/${id}/abandon`,
    {},
    options,
  ),
  finishAttempt: (id: number, payload: { score: number; bowls: number; durationMs: number }, options?: RequestOptions) =>
    request.post<TomatoNoodleLeaderboard>(`/tools/tomato-egg-noodles/attempts/${id}/finish`, payload, options),
};
