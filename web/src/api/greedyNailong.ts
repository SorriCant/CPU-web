import { request, type RequestOptions } from "./request";

export interface GreedyNailongRankingEntry {
  rank: number;
  userId: number;
  name: string;
  avatar?: string | null;
  bestScore: number;
  bestLength: number;
  games: number;
  totalScore: number;
  totalFoods: number;
  achievementCount: number;
  updatedAt?: string | null;
}

export interface GreedyNailongAchievement {
  code: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string | null;
}

export interface GreedyNailongLeaderboard {
  leaderboard: GreedyNailongRankingEntry[];
  me: GreedyNailongRankingEntry | null;
  totalPlayers: number;
  achievements: GreedyNailongAchievement[];
  newlyUnlocked: Array<{ code: string; title: string; icon: string }>;
}

export const greedyNailongApi = {
  leaderboard: (options?: RequestOptions) => request.get<GreedyNailongLeaderboard>(
    "/tools/greedy-nailong/leaderboard",
    undefined,
    { cacheTtlMs: 15_000, suppressErrorMessage: true, ...options },
  ),
  startAttempt: (options?: RequestOptions) => request.post<{ id: number; startedAt: string }>(
    "/tools/greedy-nailong/attempts",
    {},
    options,
  ),
  abandonAttempt: (id: number, options?: RequestOptions) => request.post<{ abandoned: boolean }>(
    `/tools/greedy-nailong/attempts/${id}/abandon`,
    {},
    options,
  ),
  finishAttempt: (id: number, payload: { score: number; foods: number; length: number; durationMs: number }, options?: RequestOptions) =>
    request.post<GreedyNailongLeaderboard>(`/tools/greedy-nailong/attempts/${id}/finish`, payload, options),
};
