export const YAODA_NAI_MAX_ATTEMPT_MS = 45 * 60 * 1000;
// 下面几个数和页面的引擎是同一组，测试会核对两边一致。
/** 两次投放之间的冷却。 */
export const YAODA_NAI_DROP_COOLDOWN_MS = 500;
/** 一共十级。 */
export const YAODA_NAI_MAX_LEVEL = 10;
/** 投下来的球最高是第四级。 */
export const YAODA_NAI_TOP_DROP_LEVEL = 4;
export const YAODA_NAI_MAX_DROPS = Math.floor(YAODA_NAI_MAX_ATTEMPT_MS / YAODA_NAI_DROP_COOLDOWN_MS);

export type YaodaNaiAchievementMetric = "games" | "bestScore" | "totalScore" | "bestLevel" | "totalDrops";

export interface YaodaNaiAchievementDefinition {
  code: string;
  title: string;
  description: string;
  icon: string;
  metric: YaodaNaiAchievementMetric;
  target: number;
}

export interface YaodaNaiAchievementStats {
  games: number;
  bestScore: number;
  totalScore: number;
  bestLevel: number;
  totalDrops: number;
}

export const YAODA_NAI_ACHIEVEMENTS: readonly YaodaNaiAchievementDefinition[] = [
  { code: "first_game", title: "初来乍到", description: "完成第一局云端对局", icon: "🌱", metric: "games", target: 1 },
  { code: "level_5", title: "喜提挂科", description: "单局合成出挂科奶", icon: "😭", metric: "bestLevel", target: 5 },
  { code: "level_7", title: "熬夜冠军", description: "单局合成出熬夜奶", icon: "☕", metric: "bestLevel", target: 7 },
  { code: "level_8", title: "顺利毕业", description: "单局合成出毕业奶", icon: "🎓", metric: "bestLevel", target: 8 },
  { code: "level_9", title: "读到秃头", description: "单局合成出博士奶", icon: "📜", metric: "bestLevel", target: 9 },
  { code: "level_10", title: "原地飞升", description: "单局合成出药大奶", icon: "👑", metric: "bestLevel", target: 10 },
  { code: "score_500", title: "小有收获", description: "单局达到 500 分", icon: "🐸", metric: "bestScore", target: 500 },
  { code: "score_1500", title: "越滚越大", description: "单局达到 1500 分", icon: "🔥", metric: "bestScore", target: 1500 },
  { code: "score_3000", title: "合成大师", description: "单局达到 3000 分", icon: "🏆", metric: "bestScore", target: 3000 },
  { code: "games_5", title: "再来一局", description: "完成 5 局云端对局", icon: "🔁", metric: "games", target: 5 },
  { code: "games_20", title: "停不下来", description: "完成 20 局云端对局", icon: "🌙", metric: "games", target: 20 },
  { code: "games_50", title: "奶蛙饲养员", description: "完成 50 局云端对局", icon: "💪", metric: "games", target: 50 },
  { code: "total_drops_500", title: "勤学苦练", description: "累计投放 500 只", icon: "🧪", metric: "totalDrops", target: 500 },
  { code: "total_score_20000", title: "两万分俱乐部", description: "累计获得 20000 分", icon: "📚", metric: "totalScore", target: 20000 },
] as const;

/**
 * 投了 drops 只以后最多能拿到的分数。合成出第 n 级得 2^(n-1) 分，两只最高级相撞再加 1024 分，
 * 折算下来每只第一级最多值 10 分；一只第四级相当于 8 只第一级，但少了合到第四级的 24 分。
 */
export function maxYaodaNaiScoreForDrops(drops: number) {
  const units = 2 ** (YAODA_NAI_TOP_DROP_LEVEL - 1);
  const perDrop = units * YAODA_NAI_MAX_LEVEL - (YAODA_NAI_TOP_DROP_LEVEL - 1) * units;
  return Math.max(0, Math.floor(drops)) * perDrop;
}

export const YAODA_NAI_MAX_SCORE = maxYaodaNaiScoreForDrops(YAODA_NAI_MAX_DROPS);

/** 这一局出现过第 level 级时至少已经拿到的分数（全用第四级的球合上去最省分）。 */
export function minYaodaNaiScoreForLevel(level: number) {
  return level > YAODA_NAI_TOP_DROP_LEVEL ? (level - YAODA_NAI_TOP_DROP_LEVEL) * 2 ** (level - 1) : 0;
}

/** 出现第 level 级至少要投几只。 */
export function minYaodaNaiDropsForLevel(level: number) {
  if (level <= 0) return 0;
  return Math.max(1, Math.ceil(2 ** (level - 1) / 2 ** (YAODA_NAI_TOP_DROP_LEVEL - 1)));
}

/** 投 drops 只最少要多久：第一只不用等，之后每只隔一个冷却。 */
export function minimumDurationForYaodaNaiDrops(drops: number) {
  return Math.max(0, drops - 1) * YAODA_NAI_DROP_COOLDOWN_MS;
}

export function validateYaodaNaiResult(input: {
  score: number;
  drops: number;
  level: number;
  durationMs: number;
  serverElapsedMs: number;
}) {
  const { score, drops, level, durationMs, serverElapsedMs } = input;
  if (!Number.isInteger(score) || score < 0 || score > YAODA_NAI_MAX_SCORE) {
    return "分数超出可提交范围";
  }
  if (!Number.isInteger(drops) || drops < 0 || drops > YAODA_NAI_MAX_DROPS) {
    return "投放数超出可提交范围";
  }
  if (!Number.isInteger(level) || level < 0 || level > YAODA_NAI_MAX_LEVEL) {
    return "等级超出可提交范围";
  }
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > YAODA_NAI_MAX_ATTEMPT_MS) {
    return "对局时长无效";
  }
  if (serverElapsedMs < 0 || serverElapsedMs > YAODA_NAI_MAX_ATTEMPT_MS) {
    return "本局已过期，请重新开始";
  }
  if (score > maxYaodaNaiScoreForDrops(drops)) {
    return "分数与投放数不匹配";
  }
  if ((level === 0) !== (drops === 0) || drops < minYaodaNaiDropsForLevel(level)) {
    return "等级与投放数不匹配";
  }
  if (score < minYaodaNaiScoreForLevel(level)) {
    return "分数与等级不匹配";
  }
  const minimumDuration = minimumDurationForYaodaNaiDrops(drops);
  if (durationMs + 1_200 < minimumDuration || serverElapsedMs + 1_500 < minimumDuration) {
    return "投放数与对局时长不匹配";
  }
  if (durationMs > serverElapsedMs + 5_000) {
    return "客户端对局时长异常";
  }
  return null;
}

export function yaodaNaiAchievementProgress(
  achievement: YaodaNaiAchievementDefinition,
  stats: YaodaNaiAchievementStats,
) {
  return Math.min(achievement.target, Math.max(0, stats[achievement.metric]));
}

export function earnedYaodaNaiAchievementCodes(stats: YaodaNaiAchievementStats) {
  return YAODA_NAI_ACHIEVEMENTS
    .filter((achievement) => yaodaNaiAchievementProgress(achievement, stats) >= achievement.target)
    .map((achievement) => achievement.code);
}
