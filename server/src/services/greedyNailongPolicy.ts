export const GREEDY_NAILONG_MAX_ATTEMPT_MS = 40 * 60 * 1000;
// 下面几个数和页面的引擎是同一组，测试会核对两边一致。
/** 最快时走一格的间隔。 */
export const GREEDY_NAILONG_MIN_STEP_MS = 85;
export const GREEDY_NAILONG_START_LENGTH = 3;
/** 场地 13 × 20 格，身子最长占满全场。 */
export const GREEDY_NAILONG_MAX_LENGTH = 13 * 20;
/** 零食每份 10 分；每吃 6 份零食出一锅火锅（最多 50 分、长两节）；每吃 10 份零食出一份消食片（15 分）。 */
export const GREEDY_NAILONG_SNACK_SCORE = 10;
export const GREEDY_NAILONG_FEAST_EVERY = 6;
export const GREEDY_NAILONG_FEAST_SCORE_MAX = 50;
export const GREEDY_NAILONG_FEAST_GROW = 2;
export const GREEDY_NAILONG_PILL_EVERY = 10;
export const GREEDY_NAILONG_PILL_SCORE = 15;
export const GREEDY_NAILONG_MAX_FOODS = Math.floor(GREEDY_NAILONG_MAX_ATTEMPT_MS / GREEDY_NAILONG_MIN_STEP_MS);

export type GreedyNailongAchievementMetric = "games" | "bestScore" | "totalScore" | "bestLength" | "totalFoods";

export interface GreedyNailongAchievementDefinition {
  code: string;
  title: string;
  description: string;
  icon: string;
  metric: GreedyNailongAchievementMetric;
  target: number;
}

export interface GreedyNailongAchievementStats {
  games: number;
  bestScore: number;
  totalScore: number;
  bestLength: number;
  totalFoods: number;
}

export const GREEDY_NAILONG_ACHIEVEMENTS: readonly GreedyNailongAchievementDefinition[] = [
  { code: "first_game", title: "初来乍到", description: "完成第一局云端对局", icon: "🌱", metric: "games", target: 1 },
  { code: "length_10", title: "初具规模", description: "单局长到 10 节", icon: "🥟", metric: "bestLength", target: 10 },
  { code: "length_20", title: "越吃越长", description: "单局长到 20 节", icon: "🍜", metric: "bestLength", target: 20 },
  { code: "length_35", title: "一条长龙", description: "单局长到 35 节", icon: "🐉", metric: "bestLength", target: 35 },
  { code: "length_50", title: "塞满食堂", description: "单局长到 50 节", icon: "🏮", metric: "bestLength", target: 50 },
  { code: "score_200", title: "开胃小菜", description: "单局达到 200 分", icon: "🍗", metric: "bestScore", target: 200 },
  { code: "score_500", title: "饭量见长", description: "单局达到 500 分", icon: "🍔", metric: "bestScore", target: 500 },
  { code: "score_900", title: "自助餐杀手", description: "单局达到 900 分", icon: "🔥", metric: "bestScore", target: 900 },
  { code: "score_1400", title: "贪吃之王", description: "单局达到 1400 分", icon: "👑", metric: "bestScore", target: 1400 },
  { code: "games_5", title: "再来一局", description: "完成 5 局云端对局", icon: "🔁", metric: "games", target: 5 },
  { code: "games_20", title: "停不下来", description: "完成 20 局云端对局", icon: "🌙", metric: "games", target: 20 },
  { code: "games_50", title: "奶龙饲养员", description: "完成 50 局云端对局", icon: "💪", metric: "games", target: 50 },
  { code: "total_foods_500", title: "光盘行动", description: "累计吃掉 500 样东西", icon: "🥢", metric: "totalFoods", target: 500 },
  { code: "total_score_20000", title: "两万分俱乐部", description: "累计获得 20000 分", icon: "📚", metric: "totalScore", target: 20000 },
] as const;

/**
 * 一共吃了 foods 样东西时分数的上限：全是零食是每样 10 分，其中最多每七样里有一锅满分的火锅，
 * 每十一样里有一份消食片。
 */
export function maxGreedyNailongScoreForFoods(foods: number) {
  const count = Math.max(0, Math.floor(foods));
  return count * GREEDY_NAILONG_SNACK_SCORE
    + Math.ceil(count / (GREEDY_NAILONG_FEAST_EVERY + 1)) * (GREEDY_NAILONG_FEAST_SCORE_MAX - GREEDY_NAILONG_SNACK_SCORE)
    + Math.ceil(count / (GREEDY_NAILONG_PILL_EVERY + 1)) * (GREEDY_NAILONG_PILL_SCORE - GREEDY_NAILONG_SNACK_SCORE);
}

export const GREEDY_NAILONG_MAX_SCORE = maxGreedyNailongScoreForFoods(GREEDY_NAILONG_MAX_FOODS);

/** 吃了 foods 样东西最少也有这么多分：最不值钱的零食每份 10 分。 */
export function minGreedyNailongScoreForFoods(foods: number) {
  return Math.max(0, Math.floor(foods)) * GREEDY_NAILONG_SNACK_SCORE;
}

/** 吃了 foods 样东西最长能有多长：一样最多长两节。 */
export function maxGreedyNailongLengthForFoods(foods: number) {
  return Math.min(GREEDY_NAILONG_MAX_LENGTH, GREEDY_NAILONG_START_LENGTH + Math.max(0, Math.floor(foods)) * GREEDY_NAILONG_FEAST_GROW);
}

/** 吃 foods 样东西最少要多久：每吃一样至少要走一格。 */
export function minimumDurationForGreedyNailongFoods(foods: number) {
  return Math.max(0, Math.floor(foods)) * GREEDY_NAILONG_MIN_STEP_MS;
}

export function validateGreedyNailongResult(input: {
  score: number;
  foods: number;
  length: number;
  durationMs: number;
  serverElapsedMs: number;
}) {
  const { score, foods, length, durationMs, serverElapsedMs } = input;
  if (!Number.isInteger(score) || score < 0 || score > GREEDY_NAILONG_MAX_SCORE) {
    return "分数超出可提交范围";
  }
  if (!Number.isInteger(foods) || foods < 0 || foods > GREEDY_NAILONG_MAX_FOODS) {
    return "进食数超出可提交范围";
  }
  if (!Number.isInteger(length) || length < GREEDY_NAILONG_START_LENGTH || length > GREEDY_NAILONG_MAX_LENGTH) {
    return "长度超出可提交范围";
  }
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > GREEDY_NAILONG_MAX_ATTEMPT_MS) {
    return "对局时长无效";
  }
  if (serverElapsedMs < 0 || serverElapsedMs > GREEDY_NAILONG_MAX_ATTEMPT_MS) {
    return "本局已过期，请重新开始";
  }
  if (score > maxGreedyNailongScoreForFoods(foods) || score < minGreedyNailongScoreForFoods(foods)) {
    return "分数与进食数不匹配";
  }
  if (length > maxGreedyNailongLengthForFoods(foods)) {
    return "长度与进食数不匹配";
  }
  const minimumDuration = minimumDurationForGreedyNailongFoods(foods);
  if (durationMs + 1_200 < minimumDuration || serverElapsedMs + 1_500 < minimumDuration) {
    return "进食数与对局时长不匹配";
  }
  if (durationMs > serverElapsedMs + 5_000) {
    return "客户端对局时长异常";
  }
  return null;
}

export function greedyNailongAchievementProgress(
  achievement: GreedyNailongAchievementDefinition,
  stats: GreedyNailongAchievementStats,
) {
  return Math.min(achievement.target, Math.max(0, stats[achievement.metric]));
}

export function earnedGreedyNailongAchievementCodes(stats: GreedyNailongAchievementStats) {
  return GREEDY_NAILONG_ACHIEVEMENTS
    .filter((achievement) => greedyNailongAchievementProgress(achievement, stats) >= achievement.target)
    .map((achievement) => achievement.code);
}
