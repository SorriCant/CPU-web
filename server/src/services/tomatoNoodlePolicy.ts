export const TOMATO_NOODLE_MAX_ATTEMPT_MS = 45 * 60 * 1000;
// 每道工序最多 3 分、一碗最多 23 分；客户端做完一碗至少 7.5 秒（约 326 毫秒一分），这里留出余量。
export const TOMATO_NOODLE_MIN_MS_PER_POINT = 250;
export const TOMATO_NOODLE_MAX_BOWL_POINTS = 23;
// 没出锅的那一碗最多做完 5 道工序。
export const TOMATO_NOODLE_MAX_UNSERVED_POINTS = 15;
// 一碗里最多失误两次（第三次失误即结束），其余四道工序至少各得 1 分。
export const TOMATO_NOODLE_MIN_BOWL_POINTS = 4;
export const TOMATO_NOODLE_MAX_SCORE = Math.floor(TOMATO_NOODLE_MAX_ATTEMPT_MS / TOMATO_NOODLE_MIN_MS_PER_POINT);
export const TOMATO_NOODLE_MAX_BOWLS = Math.floor(TOMATO_NOODLE_MAX_SCORE / TOMATO_NOODLE_MIN_BOWL_POINTS);

export type TomatoNoodleAchievementMetric = "games" | "bestScore" | "totalScore" | "bestBowls" | "totalBowls";

export interface TomatoNoodleAchievementDefinition {
  code: string;
  title: string;
  description: string;
  icon: string;
  metric: TomatoNoodleAchievementMetric;
  target: number;
}

export interface TomatoNoodleAchievementStats {
  games: number;
  bestScore: number;
  totalScore: number;
  bestBowls: number;
  totalBowls: number;
}

export const TOMATO_NOODLE_ACHIEVEMENTS: readonly TomatoNoodleAchievementDefinition[] = [
  { code: "first_game", title: "开张大吉", description: "完成第一局云端对局", icon: "🍜", metric: "games", target: 1 },
  { code: "bowls_1", title: "第一碗面", description: "单局端出 1 碗面", icon: "🥢", metric: "bestBowls", target: 1 },
  { code: "bowls_3", title: "小有手艺", description: "单局端出 3 碗面", icon: "🍅", metric: "bestBowls", target: 3 },
  { code: "bowls_6", title: "食堂掌勺", description: "单局端出 6 碗面", icon: "🍳", metric: "bestBowls", target: 6 },
  { code: "bowls_10", title: "面馆老板", description: "单局端出 10 碗面", icon: "🧑‍🍳", metric: "bestBowls", target: 10 },
  { code: "score_50", title: "色香味俱全", description: "单局达到 50 分", icon: "✨", metric: "bestScore", target: 50 },
  { code: "score_120", title: "一勺定乾坤", description: "单局达到 120 分", icon: "🔥", metric: "bestScore", target: 120 },
  // 代号沿用最初的 220 分门槛：已有玩家解锁过，改代号会让他们的记录失效。
  { code: "score_220", title: "厨神降临", description: "单局达到 180 分", icon: "🏆", metric: "bestScore", target: 180 },
  { code: "games_5", title: "回头客", description: "完成 5 局云端对局", icon: "🪑", metric: "games", target: 5 },
  { code: "games_20", title: "深夜食堂", description: "完成 20 局云端对局", icon: "🌙", metric: "games", target: 20 },
  { code: "games_50", title: "颠勺不息", description: "完成 50 局云端对局", icon: "💪", metric: "games", target: 50 },
  { code: "total_bowls_20", title: "薄利多销", description: "累计端出 20 碗面", icon: "🧾", metric: "totalBowls", target: 20 },
  { code: "total_bowls_100", title: "百碗老店", description: "累计端出 100 碗面", icon: "🏮", metric: "totalBowls", target: 100 },
  { code: "total_score_1000", title: "千分大厨", description: "累计获得 1000 分", icon: "📚", metric: "totalScore", target: 1000 },
] as const;

export function minimumDurationForNoodleScore(score: number) {
  return Math.max(0, score) * TOMATO_NOODLE_MIN_MS_PER_POINT;
}

export function validateTomatoNoodleResult(input: {
  score: number;
  bowls: number;
  durationMs: number;
  serverElapsedMs: number;
}) {
  const { score, bowls, durationMs, serverElapsedMs } = input;
  if (!Number.isInteger(score) || score < 0 || score > TOMATO_NOODLE_MAX_SCORE) {
    return "分数超出可提交范围";
  }
  if (!Number.isInteger(bowls) || bowls < 0 || bowls > TOMATO_NOODLE_MAX_BOWLS) {
    return "出餐碗数超出可提交范围";
  }
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > TOMATO_NOODLE_MAX_ATTEMPT_MS) {
    return "对局时长无效";
  }
  if (serverElapsedMs < 0 || serverElapsedMs > TOMATO_NOODLE_MAX_ATTEMPT_MS) {
    return "本局已过期，请重新开始";
  }
  if (
    score < bowls * TOMATO_NOODLE_MIN_BOWL_POINTS
    || score > bowls * TOMATO_NOODLE_MAX_BOWL_POINTS + TOMATO_NOODLE_MAX_UNSERVED_POINTS
  ) {
    return "分数与出餐碗数不匹配";
  }
  const minimumDuration = minimumDurationForNoodleScore(score);
  if (durationMs + 1_200 < minimumDuration || serverElapsedMs + 1_500 < minimumDuration) {
    return "分数与对局时长不匹配";
  }
  if (durationMs > serverElapsedMs + 5_000) {
    return "客户端对局时长异常";
  }
  return null;
}

export function tomatoNoodleAchievementProgress(
  achievement: TomatoNoodleAchievementDefinition,
  stats: TomatoNoodleAchievementStats,
) {
  return Math.min(achievement.target, Math.max(0, stats[achievement.metric]));
}

export function earnedTomatoNoodleAchievementCodes(stats: TomatoNoodleAchievementStats) {
  return TOMATO_NOODLE_ACHIEVEMENTS
    .filter((achievement) => tomatoNoodleAchievementProgress(achievement, stats) >= achievement.target)
    .map((achievement) => achievement.code);
}
