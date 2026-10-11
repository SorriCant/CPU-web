// 番茄鸡蛋面的玩法规则：工序、火候条走位、判定与计分。
// 页面和服务端测试共用这份常量，服务端的成绩校验（tomatoNoodlePolicy）按这里的节奏推最低用时。

export type NoodleGaugeKind = "sweep" | "fill";
export type NoodleGrade = "perfect" | "good" | "ok" | "miss";
export type NoodleStepId = "cut" | "egg" | "scramble" | "tomato" | "boil" | "season";

export interface NoodleStep {
  id: NoodleStepId;
  title: string;
  hint: string;
  gauge: NoodleGaugeKind;
  /** 目标区中心的取值范围。 */
  targetMin: number;
  targetMax: number;
  /** 火候条两端与目标区的说明。 */
  lowLabel: string;
  highLabel: string;
  /** 四档判定各自的反馈。 */
  feedback: Record<NoodleGrade, string>;
}

export const TOMATO_NOODLE_RULES = {
  hearts: 3,
  stepIntroMs: 450,
  stepResultMs: 650,
  serveMs: 900,
  sweepPasses: 6,
  sweepSecondsBase: 1.5,
  sweepSecondsDecay: 0.93,
  sweepSecondsMin: 0.62,
  fillSecondsBase: 3.4,
  fillSecondsDecay: 0.94,
  fillSecondsMin: 1.5,
  zoneDecay: 0.96,
  perfectHalf: 0.045,
  perfectHalfMin: 0.022,
  goodHalf: 0.1,
  goodHalfMin: 0.045,
  okHalf: 0.17,
  okHalfMin: 0.075,
  perfectPoints: 3,
  goodPoints: 2,
  okPoints: 1,
  cleanBowlBonus: 2,
  flawlessBowlBonus: 5,
} as const;

export const TOMATO_NOODLE_STEPS: readonly NoodleStep[] = [
  {
    id: "cut",
    title: "切番茄",
    hint: "刀光划到亮区时落刀",
    gauge: "sweep",
    targetMin: 0.28,
    targetMax: 0.72,
    lowLabel: "偏左",
    highLabel: "偏右",
    feedback: { perfect: "块块均匀", good: "切得不错", ok: "大小不一", miss: "切歪了" },
  },
  {
    id: "egg",
    title: "打鸡蛋",
    hint: "对准碗沿，一磕即开",
    gauge: "sweep",
    targetMin: 0.3,
    targetMax: 0.7,
    lowLabel: "太轻",
    highLabel: "太重",
    feedback: { perfect: "蛋液金黄", good: "打得顺手", ok: "掉了点壳", miss: "蛋磕碎了" },
  },
  {
    id: "scramble",
    title: "炒鸡蛋",
    hint: "蛋块刚凝固就盛出",
    gauge: "fill",
    targetMin: 0.6,
    targetMax: 0.78,
    lowLabel: "还生",
    highLabel: "炒老",
    feedback: { perfect: "嫩滑蓬松", good: "火候不错", ok: "差点火候", miss: "炒糊了" },
  },
  {
    id: "tomato",
    title: "炒番茄",
    hint: "炒出红汤就加水",
    gauge: "fill",
    targetMin: 0.58,
    targetMax: 0.8,
    lowLabel: "没出汁",
    highLabel: "粘锅",
    feedback: { perfect: "红汤浓郁", good: "汤色不错", ok: "汁水偏少", miss: "粘锅了" },
  },
  {
    id: "boil",
    title: "煮面条",
    hint: "面条刚熟透就捞",
    gauge: "fill",
    targetMin: 0.62,
    targetMax: 0.8,
    lowLabel: "夹生",
    highLabel: "煮烂",
    feedback: { perfect: "筋道爽滑", good: "软硬适中", ok: "口感一般", miss: "煮成面糊" },
  },
  {
    id: "season",
    title: "调味出锅",
    hint: "盐量走到亮区时收手",
    gauge: "sweep",
    targetMin: 0.3,
    targetMax: 0.7,
    lowLabel: "太淡",
    highLabel: "太咸",
    feedback: { perfect: "咸淡正好", good: "味道不错", ok: "差点意思", miss: "调砸了" },
  },
] as const;

export const TOMATO_NOODLE_STEPS_PER_BOWL = TOMATO_NOODLE_STEPS.length;
export const TOMATO_NOODLE_MAX_BOWL_POINTS = TOMATO_NOODLE_STEPS_PER_BOWL * TOMATO_NOODLE_RULES.perfectPoints
  + TOMATO_NOODLE_RULES.flawlessBowlBonus;
// 一碗做完至少要走完全部工序的入场与结算停顿；服务端据此估算每分的最低用时。
export const TOMATO_NOODLE_MIN_BOWL_MS = TOMATO_NOODLE_STEPS_PER_BOWL
  * (TOMATO_NOODLE_RULES.stepIntroMs + TOMATO_NOODLE_RULES.stepResultMs)
  + TOMATO_NOODLE_RULES.serveMs;

function unitInterval(value: number) {
  return Math.min(1, Math.max(0, value));
}

function decayed(base: number, decay: number, minimum: number, level: number) {
  return Math.max(minimum, base * decay ** Math.max(0, level));
}

/** 往复条单程用时（秒），出餐越多越快。 */
export function noodleSweepSeconds(level: number) {
  const rules = TOMATO_NOODLE_RULES;
  return decayed(rules.sweepSecondsBase, rules.sweepSecondsDecay, rules.sweepSecondsMin, level);
}

/** 火候条从头走到尾的用时（秒）。 */
export function noodleFillSeconds(level: number) {
  const rules = TOMATO_NOODLE_RULES;
  return decayed(rules.fillSecondsBase, rules.fillSecondsDecay, rules.fillSecondsMin, level);
}

export function noodleZones(level: number) {
  const rules = TOMATO_NOODLE_RULES;
  return {
    perfect: decayed(rules.perfectHalf, rules.zoneDecay, rules.perfectHalfMin, level),
    good: decayed(rules.goodHalf, rules.zoneDecay, rules.goodHalfMin, level),
    ok: decayed(rules.okHalf, rules.zoneDecay, rules.okHalfMin, level),
  };
}

export function noodleTargetCenter(step: NoodleStep, random: number) {
  return step.targetMin + unitInterval(random) * (step.targetMax - step.targetMin);
}

/**
 * 指针位置。返回 expired 表示这道工序没等到操作：往复条走满来回，或火候条烧到头。
 */
export function noodleGaugePosition(step: NoodleStep, level: number, seconds: number) {
  const elapsed = Math.max(0, seconds);
  if (step.gauge === "fill") {
    const progress = elapsed / noodleFillSeconds(level);
    return { position: Math.min(1, progress), expired: progress >= 1 };
  }
  const passes = elapsed / noodleSweepSeconds(level);
  const phase = passes % 2;
  return {
    position: phase <= 1 ? phase : 2 - phase,
    expired: passes >= TOMATO_NOODLE_RULES.sweepPasses,
  };
}

export function noodleGrade(position: number, center: number, level: number): NoodleGrade {
  const distance = Math.abs(position - center);
  const zones = noodleZones(level);
  if (distance <= zones.perfect) return "perfect";
  if (distance <= zones.good) return "good";
  if (distance <= zones.ok) return "ok";
  return "miss";
}

export function noodleGradePoints(grade: NoodleGrade) {
  const rules = TOMATO_NOODLE_RULES;
  if (grade === "perfect") return rules.perfectPoints;
  if (grade === "good") return rules.goodPoints;
  if (grade === "ok") return rules.okPoints;
  return 0;
}

/** 一碗面出锅时的加分：全程完美最高，没有失误次之。 */
export function noodleBowlBonus(grades: readonly NoodleGrade[]) {
  if (grades.length < TOMATO_NOODLE_STEPS_PER_BOWL || grades.includes("miss")) return 0;
  return grades.every((grade) => grade === "perfect")
    ? TOMATO_NOODLE_RULES.flawlessBowlBonus
    : TOMATO_NOODLE_RULES.cleanBowlBonus;
}

export function noodleBowlRating(points: number) {
  if (points >= 17) return { stars: 3, title: "招牌好面" };
  if (points >= 10) return { stars: 2, title: "家常好味" };
  return { stars: 1, title: "勉强能吃" };
}

export function noodleChefRank(score: number) {
  if (score >= 220) return "厨神";
  if (score >= 120) return "金牌主厨";
  if (score >= 50) return "熟练掌勺";
  if (score >= 15) return "厨房新秀";
  return "切菜学徒";
}
