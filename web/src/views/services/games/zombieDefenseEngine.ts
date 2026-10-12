// 药大人大战僵尸的对局引擎：五路药圃、僵尸自上而下进攻。
// 只有纯数据和纯逻辑，不碰 DOM；页面负责画面和输入，服务端测试用它核对成绩上限并跑自动对局。

export type ZdUnitKind = "mortar" | "capsule" | "mint" | "cabinet" | "fizz" | "ampoule" | "burner" | "drip";
export type ZdZombieKind = "walker" | "runner" | "beaker" | "giant" | "thesis" | "mentor";
export type ZdShotKind = "capsule" | "mint";
/** 杂交带来的子弹外观：点燃的、带寒气的。 */
export type ZdShotTint = "" | "fire" | "frost";
export type ZdEvent = "place" | "remove" | "upgrade" | "graft" | "shoot" | "beam" | "hit" | "energy" | "boom" | "wave" | "bigWave" | "lost";

export const ZD_RULES = {
  lanes: 5,
  rows: 7,
  startEnergy: 150,
  passiveEnergy: 25,
  passiveSeconds: 8,
  firstWaveAt: 10,
  waveSeconds: 20,
  spawnWindowSeconds: 12,
  spawnY: -0.7,
  shotSpeed: 7,
  shotHitRange: 0.35,
  biteReach: 0.45,
  slowSeconds: 3.5,
  slowFactor: 0.5,
  // 每一波的僵尸预算：base + linear * n + quadratic * n²（以普通僵尸为 1）。
  budgetBase: 1,
  budgetLinear: 1,
  budgetQuadratic: 0.3,
  bigWaveEvery: 5,
  bigWaveFactor: 1.4,
  // 僵尸血量每波递增；到后期改成按比例连涨，药材再怎么升级也终究守不住。
  hpGrowthPerWave: 0.06,
  hpCompoundFromWave: 12,
  hpCompoundRate: 1.1,
  pointsPerBudget: 10,
  /** 杂交药材的血量：两种里高的那个，加上低的那个的这个比例。 */
  hybridHpShare: 0.5,
  // 三级以上每升一级：伤害、产量、回血乘 levelPower，血量乘 levelHp（药柜乘 levelWallHp），花费乘 levelCost。
  // 花费涨得比数值快，所以越往上越不划算，但没有封顶。
  levelPower: 1.45,
  levelHp: 1.25,
  levelWallHp: 1.45,
  levelCost: 1.6,
  /** 泡腾片至少炸掉僵尸血量上限的这个比例，后期照样管用。 */
  fizzShare: 0.4,
  /** 酒精灯够得着的距离（格）。 */
  burnReach: 1.6,
  // 以下是杂交的专属效果。
  /** 杂交了酒精灯：子弹和安瓿被点燃，伤害乘这个数。 */
  igniteFactor: 2,
  /** 杂交了研钵：它击退的僵尸每 1 点预算额外掉这么多药力。 */
  bountyPerCost: 6,
  /** 杂交了药柜：挨啃时攻击和产出快这么多倍。 */
  enrageFactor: 2,
  /** 药柜杂交酒精灯：啃它的僵尸按酒精灯火力的这个倍数被烧。 */
  fireWallFactor: 3,
  /** 药柜杂交输液架：自己回血的倍数。 */
  wallRegenFactor: 3,
  /** 薄荷杂交泡腾片：炸开后僵尸被冻住的秒数。 */
  frostBlastSeconds: 8,
} as const;

export interface ZdUnitDefinition {
  kind: ZdUnitKind;
  name: string;
  summary: string;
  cost: number;
  hp: number;
  /** 再次种植的冷却（秒）。 */
  cooldown: number;
  /** 开局时已经过的冷却比例：1 表示立即可用。 */
  ready: number;
  /** 攻击或产出的间隔（秒）；泡腾片为引爆延时。 */
  interval: number;
  /** 伤害；酒精灯是每秒烧掉的血，输液架是每秒回的血。 */
  damage: number;
}

export const ZD_UNITS: Record<ZdUnitKind, ZdUnitDefinition> = {
  mortar: { kind: "mortar", name: "研钵", summary: "定时研磨出药力", cost: 50, hp: 70, cooldown: 5, ready: 1, interval: 8, damage: 0 },
  capsule: { kind: "capsule", name: "胶囊射手", summary: "向前发射胶囊", cost: 100, hp: 90, cooldown: 5, ready: 1, interval: 1.2, damage: 20 },
  mint: { kind: "mint", name: "薄荷射手", summary: "命中后让僵尸减速", cost: 150, hp: 90, cooldown: 7, ready: 1, interval: 1.5, damage: 15 },
  cabinet: { kind: "cabinet", name: "药柜", summary: "结实，用来挡路", cost: 50, hp: 700, cooldown: 14, ready: 1, interval: 0, damage: 0 },
  fizz: { kind: "fizz", name: "泡腾片", summary: "片刻后炸开周围一圈，至少炸掉四成血", cost: 125, hp: 300, cooldown: 22, ready: 0.5, interval: 0.8, damage: 900 },
  ampoule: { kind: "ampoule", name: "安瓿炮", summary: "一发打穿整路，路上的僵尸全中", cost: 250, hp: 110, cooldown: 9, ready: 1, interval: 3, damage: 90 },
  burner: { kind: "burner", name: "酒精灯", summary: "一直烧前方一格半以内的所有僵尸", cost: 175, hp: 130, cooldown: 7, ready: 1, interval: 0, damage: 32 },
  drip: { kind: "drip", name: "输液架", summary: "给周围一圈药材慢慢回血", cost: 125, hp: 110, cooldown: 9, ready: 1, interval: 0, damage: 22 },
};

export const ZD_UNIT_ORDER: readonly ZdUnitKind[] = ["mortar", "capsule", "mint", "cabinet", "fizz", "ampoule", "burner", "drip"];

/** 前三级的数值是一档一档写死的；再往上不设上限，每升一级数值和花费都按比例涨。 */
export const ZD_TABLE_LEVEL = 3;
/** 只是防止数值溢出的保险，正常对局远远升不到。 */
export const ZD_MAX_LEVEL = 60;
// 三连发里相邻两颗胶囊的间隔（秒）。
const BURST_GAP_SECONDS = 0.12;

export interface ZdUpgrade {
  cost: number;
  summary: string;
}

/** 每种药材升到 2 级、3 级的花费和效果；再往上见 zdUpgradeFor。泡腾片是一次性的，不能升级。 */
export const ZD_UPGRADES: Record<ZdUnitKind, readonly ZdUpgrade[]> = {
  mortar: [{ cost: 50, summary: "每次磨出 50 药力" }, { cost: 100, summary: "每次磨出 85 药力" }],
  capsule: [{ cost: 75, summary: "两连发，胶囊更重" }, { cost: 125, summary: "三连发，胶囊再加重" }],
  mint: [{ cost: 100, summary: "伤害更高，减速更久" }, { cost: 150, summary: "命中时连旁边的僵尸一起打、一起减速" }],
  cabinet: [{ cost: 50, summary: "加厚一倍，升级时顺便修好" }, { cost: 100, summary: "再加厚，啃它的僵尸会受伤" }],
  fizz: [],
  ampoule: [{ cost: 150, summary: "每发伤害提高到 130" }, { cost: 250, summary: "每发伤害提高到 185" }],
  burner: [{ cost: 100, summary: "每秒烧掉 48 血" }, { cost: 175, summary: "每秒烧掉 70 血" }],
  drip: [{ cost: 75, summary: "每秒回 34 血" }, { cost: 125, summary: "每秒回 50 血" }],
};

export interface ZdHybrid {
  name: string;
  /** 这种组合独有的效果；两种药材原有的本事另外都保留。 */
  perk: string;
}

/** 二十八种杂交。键是按药材栏顺序排好的一对，种的先后不影响结果。 */
export const ZD_HYBRIDS: Record<string, ZdHybrid> = {
  "mortar+capsule": { name: "研钵射手", perk: "它击退的僵尸额外掉药力" },
  "mortar+mint": { name: "薄荷研钵", perk: "它击退的僵尸额外掉药力" },
  "mortar+cabinet": { name: "研钵药柜", perk: "挨啃时磨药快一倍" },
  "mortar+fizz": { name: "泡腾研钵", perk: "被啃掉时炸开周围一圈" },
  "mortar+ampoule": { name: "赏金安瓿", perk: "它击退的僵尸额外掉药力" },
  "mortar+burner": { name: "炼药灯", perk: "它烧死的僵尸额外掉药力" },
  "mortar+drip": { name: "养生研钵", perk: "自己也回血" },
  "capsule+mint": { name: "双生射手", perk: "胶囊也带减速" },
  "capsule+cabinet": { name: "铁柜射手", perk: "挨啃时射速快一倍" },
  "capsule+fizz": { name: "泡腾机枪", perk: "每轮最后一颗胶囊会炸开一小圈；被啃掉时炸开周围一圈" },
  "capsule+ampoule": { name: "穿甲射手", perk: "胶囊打穿一只僵尸，再打下一只" },
  "capsule+burner": { name: "火焰射手", perk: "胶囊被点燃，伤害翻倍" },
  "capsule+drip": { name: "输液射手", perk: "自己也回血" },
  "mint+cabinet": { name: "寒冰药柜", perk: "啃它的僵尸一直被减速；挨啃时射速快一倍" },
  "mint+fizz": { name: "冰爆薄荷", perk: "被啃掉时炸开，并把周围的僵尸冻住 8 秒" },
  "mint+ampoule": { name: "冷冻安瓿", perk: "安瓿让整路僵尸减速" },
  "mint+burner": { name: "冰火射手", perk: "薄荷被点燃，伤害翻倍" },
  "mint+drip": { name: "清凉输液", perk: "自己也回血" },
  "cabinet+fizz": { name: "泡腾药柜", perk: "被啃掉时炸开周围一圈" },
  "cabinet+ampoule": { name: "安瓿堡垒", perk: "挨啃时射速快一倍" },
  "cabinet+burner": { name: "火焰药柜", perk: "啃它的僵尸被三倍的火烧" },
  "cabinet+drip": { name: "自愈药柜", perk: "自己也回血，而且快三倍" },
  "fizz+ampoule": { name: "爆破安瓿", perk: "安瓿在最前面的僵尸身上炸开一圈；被啃掉时炸开周围一圈" },
  "fizz+burner": { name: "燃烧泡腾", perk: "被啃掉时炸开周围一圈" },
  "fizz+drip": { name: "急救泡腾", perk: "被啃掉时炸开，并把周围的药材回满血" },
  "ampoule+burner": { name: "喷火安瓿", perk: "安瓿被点燃，伤害翻倍" },
  "ampoule+drip": { name: "输液安瓿", perk: "自己也回血" },
  "burner+drip": { name: "暖炉输液", perk: "自己也回血" },
};

export interface ZdUnitStats {
  hp: number;
  damage: number;
  /** 一次齐射的发数。 */
  shots: number;
  /** 研钵每次磨出的药力。 */
  energy: number;
  slowSeconds: number;
  /** 命中时波及相邻僵尸。 */
  splash: boolean;
  /** 每秒反伤啃咬者。 */
  thorns: number;
  /** 酒精灯每秒烧掉的血。 */
  burn: number;
  /** 输液架每秒给周围药材回的血。 */
  heal: number;
}

function buildStats(kind: ZdUnitKind, level: number): ZdUnitStats {
  const tier = Math.min(ZD_TABLE_LEVEL, Math.max(1, level)) - 1;
  const base = ZD_UNITS[kind];
  const stats: ZdUnitStats = { hp: base.hp, damage: base.damage, shots: 1, energy: 0, slowSeconds: 0, splash: false, thorns: 0, burn: 0, heal: 0 };
  if (kind === "mortar") {
    stats.energy = [ZD_RULES.passiveEnergy, 50, 85][tier];
    stats.hp = [base.hp, 100, 130][tier];
  } else if (kind === "capsule") {
    stats.shots = tier + 1;
    stats.damage = [base.damage, 22, 26][tier];
    stats.hp = [base.hp, 120, 150][tier];
  } else if (kind === "mint") {
    stats.damage = [base.damage, 25, 35][tier];
    stats.slowSeconds = [ZD_RULES.slowSeconds, 5, 5][tier];
    stats.splash = tier === 2;
    stats.hp = [base.hp, 120, 150][tier];
  } else if (kind === "cabinet") {
    stats.hp = [base.hp, 1400, 2400][tier];
    stats.thorns = tier === 2 ? 30 : 0;
  } else if (kind === "ampoule") {
    stats.damage = [base.damage, 130, 185][tier];
    stats.hp = [base.hp, 140, 170][tier];
  } else if (kind === "burner") {
    stats.damage = 0;
    stats.burn = [base.damage, 48, 70][tier];
    stats.hp = [base.hp, 170, 210][tier];
  } else if (kind === "drip") {
    stats.damage = 0;
    stats.heal = [base.damage, 34, 50][tier];
    stats.hp = [base.hp, 140, 170][tier];
  }
  // 三级以上：每级按比例往上涨，没有封顶。
  const extra = Math.max(0, level - ZD_TABLE_LEVEL);
  if (extra > 0) {
    const power = ZD_RULES.levelPower ** extra;
    stats.damage = Math.round(stats.damage * power);
    stats.energy = Math.round(stats.energy * power);
    stats.thorns = Math.round(stats.thorns * power);
    stats.burn = Math.round(stats.burn * power);
    stats.heal = Math.round(stats.heal * power);
    stats.hp = Math.round(stats.hp * (kind === "cabinet" ? ZD_RULES.levelWallHp : ZD_RULES.levelHp) ** extra);
  }
  return Object.freeze(stats);
}

// 每一步都要查很多次，算过的存起来。
const STATS = new Map<string, ZdUnitStats>();

/** 某种药材在某一级的数值。 */
export function zdUnitStats(kind: ZdUnitKind, level: number): ZdUnitStats {
  const bounded = Math.min(ZD_MAX_LEVEL, Math.max(1, Math.floor(level)));
  const key = `${kind}:${bounded}`;
  let stats = STATS.get(key);
  if (!stats) {
    stats = buildStats(kind, bounded);
    STATS.set(key, stats);
  }
  return stats;
}

/** 某种药材从 level 级升到下一级的花费和效果；不能再升时返回 null。 */
export function zdUpgradeFor(kind: ZdUnitKind, level: number): ZdUpgrade | null {
  const table = ZD_UPGRADES[kind];
  if (!table.length || level >= ZD_MAX_LEVEL) return null;
  if (level - 1 < table.length) return table[level - 1];
  const last = table[table.length - 1];
  const cost = Math.round((last.cost * ZD_RULES.levelCost ** (level - table.length)) / 5) * 5;
  const next = zdUnitStats(kind, level + 1);
  const summary = kind === "mortar" ? `每次磨出 ${next.energy} 药力`
    : kind === "cabinet" ? `血量加到 ${next.hp}，反伤每秒 ${next.thorns}`
      : kind === "burner" ? `每秒烧掉 ${next.burn} 血`
        : kind === "drip" ? `每秒回 ${next.heal} 血`
          : kind === "capsule" ? `每颗伤害提高到 ${next.damage}`
            : `每发伤害提高到 ${next.damage}`;
  return { cost, summary };
}

export interface ZdZombieDefinition {
  kind: ZdZombieKind;
  name: string;
  hp: number;
  /** 每秒前进的格数。 */
  speed: number;
  /** 每秒啃咬伤害。 */
  bite: number;
  /** 占用的波次预算；击退得分 = cost * pointsPerBudget。 */
  cost: number;
  fromWave: number;
  weight: number;
}

export const ZD_ZOMBIES: Record<ZdZombieKind, ZdZombieDefinition> = {
  walker: { kind: "walker", name: "挂科僵尸", hp: 190, speed: 0.2, bite: 35, cost: 1, fromWave: 1, weight: 5 },
  runner: { kind: "runner", name: "早八僵尸", hp: 150, speed: 0.44, bite: 35, cost: 1.5, fromWave: 3, weight: 2 },
  beaker: { kind: "beaker", name: "烧杯僵尸", hp: 520, speed: 0.2, bite: 35, cost: 2.5, fromWave: 4, weight: 2 },
  giant: { kind: "giant", name: "延毕巨尸", hp: 1500, speed: 0.15, bite: 90, cost: 6, fromWave: 8, weight: 1 },
  // 后期才出场的两种：一只顶很多只，场上不至于挤成一片。
  thesis: { kind: "thesis", name: "论文僵尸", hp: 4200, speed: 0.17, bite: 140, cost: 14, fromWave: 14, weight: 1.2 },
  mentor: { kind: "mentor", name: "导师僵尸", hp: 13000, speed: 0.13, bite: 320, cost: 40, fromWave: 22, weight: 0.5 },
};

/** 一种本事自己的计时：距离下一次攻击或产出的秒数，连发时还没打出去的发数和间隔。 */
export interface ZdOrgan {
  timer: number;
  burst: number;
  burstTimer: number;
}

export interface ZdUnit extends ZdOrgan {
  id: number;
  kind: ZdUnitKind;
  /** 杂交进来的另一种药材；没有杂交过为 null。 */
  graft: ZdUnitKind | null;
  /** 杂交进来的那一半的计时；它不需要计时（药柜、泡腾片、酒精灯、输液架）或没有杂交时为 null。 */
  second: ZdOrgan | null;
  lane: number;
  row: number;
  /** 从 1 级起，不设上限。 */
  level: number;
  hp: number;
  maxHp: number;
  /** 刚开火或刚产出后的动画余量（秒）。 */
  pulse: number;
  hurt: number;
}

export interface ZdZombie {
  id: number;
  kind: ZdZombieKind;
  lane: number;
  y: number;
  hp: number;
  maxHp: number;
  slow: number;
  biting: boolean;
  hurt: number;
  /** 最后一下是杂交了研钵的药材打的：击退时额外掉药力。 */
  loot?: boolean;
}

export interface ZdShot {
  id: number;
  kind: ZdShotKind;
  tint: ZdShotTint;
  lane: number;
  y: number;
  damage: number;
  slowSeconds: number;
  /** 命中时波及相邻僵尸，按这个比例算伤害；0 表示不波及。 */
  splash: number;
  /** 还能再打穿几只。 */
  pierce: number;
  /** 刚打穿的那只僵尸，下一步不再打它。 */
  lastHit: number;
  /** 击退僵尸时额外掉药力。 */
  bounty: boolean;
}

export interface ZdEffect {
  kind: "boom" | "energy" | "puff" | "level" | "beam";
  lane: number;
  y: number;
  age: number;
  life: number;
  /** 飘出的药力数字。 */
  amount?: number;
  /** 安瓿的光束：点燃的、带寒气的。 */
  tint?: ZdShotTint;
}

export interface ZdSpawn {
  at: number;
  kind: ZdZombieKind;
  lane: number;
  wave: number;
}

export interface ZdState {
  time: number;
  energy: number;
  score: number;
  kills: number;
  /** 已经开始的波次数。 */
  wave: number;
  nextWaveAt: number;
  passiveTimer: number;
  over: boolean;
  units: ZdUnit[];
  zombies: ZdZombie[];
  shots: ZdShot[];
  effects: ZdEffect[];
  spawns: ZdSpawn[];
  /** 每种药材距离可再次种植的秒数。 */
  cooldowns: Record<ZdUnitKind, number>;
  /** 本次推进产生的提示音事件；页面读完后清空。 */
  events: ZdEvent[];
  seed: number;
  nextId: number;
}

function unitInterval(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** mulberry32：同一个种子得到同一局僵尸。 */
function nextRandom(state: ZdState) {
  state.seed = (state.seed + 0x6d2b79f5) | 0;
  let value = state.seed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function zdWaveBudget(wave: number) {
  const rules = ZD_RULES;
  const base = rules.budgetBase + rules.budgetLinear * wave + rules.budgetQuadratic * wave * wave;
  return wave > 0 && wave % rules.bigWaveEvery === 0 ? base * rules.bigWaveFactor : base;
}

export function zdWaveHpScale(wave: number) {
  const rules = ZD_RULES;
  return (1 + rules.hpGrowthPerWave * Math.max(0, wave - 1)) * rules.hpCompoundRate ** Math.max(0, wave - rules.hpCompoundFromWave);
}

/** 第 wave 波开始的对局时间（秒）。 */
export function zdWaveStartSeconds(wave: number) {
  return ZD_RULES.firstWaveAt + Math.max(0, wave - 1) * ZD_RULES.waveSeconds;
}

/** 打到第 wave 波为止最多能拿到的分数：每波得分不超过预算乘以单价。 */
export function zdMaxScoreThroughWave(wave: number) {
  let budget = 0;
  for (let index = 1; index <= wave; index += 1) budget += zdWaveBudget(index);
  return Math.floor(budget * ZD_RULES.pointsPerBudget);
}

export function zdZombiePoints(kind: ZdZombieKind) {
  return Math.round(ZD_ZOMBIES[kind].cost * ZD_RULES.pointsPerBudget);
}

export function zdCommanderRank(score: number) {
  if (score >= 40000) return "神农再世";
  if (score >= 15000) return "药圃传说";
  if (score >= 4000) return "药圃战神";
  if (score >= 2200) return "防线统帅";
  if (score >= 900) return "护圃能手";
  if (score >= 200) return "见习园丁";
  return "新手药童";
}

export function createZdState(seed: number): ZdState {
  const cooldowns = {} as Record<ZdUnitKind, number>;
  for (const kind of ZD_UNIT_ORDER) cooldowns[kind] = ZD_UNITS[kind].cooldown * (1 - ZD_UNITS[kind].ready);
  return {
    time: 0,
    energy: ZD_RULES.startEnergy,
    score: 0,
    kills: 0,
    wave: 0,
    nextWaveAt: ZD_RULES.firstWaveAt,
    passiveTimer: ZD_RULES.passiveSeconds,
    over: false,
    units: [],
    zombies: [],
    shots: [],
    effects: [],
    spawns: [],
    cooldowns,
    events: [],
    seed: seed | 0,
    nextId: 1,
  };
}

export function zdUnitAt(state: ZdState, lane: number, row: number) {
  return state.units.find((unit) => unit.lane === lane && unit.row === row) ?? null;
}

type Genes = Pick<ZdUnit, "kind" | "graft">;

function hasGene(unit: Genes, kind: ZdUnitKind) {
  return unit.kind === kind || unit.graft === kind;
}

/** 两种药材杂交出来的是什么；同一种药材不能杂交，返回 null。 */
export function zdHybridOf(first: ZdUnitKind, second: ZdUnitKind): ZdHybrid | null {
  const pair = [first, second].sort((left, right) => ZD_UNIT_ORDER.indexOf(left) - ZD_UNIT_ORDER.indexOf(right));
  return ZD_HYBRIDS[pair.join("+")] ?? null;
}

/** 这株药材的名字；杂交过的用杂交品种的名字。 */
export function zdUnitName(unit: Genes) {
  return (unit.graft ? zdHybridOf(unit.kind, unit.graft)?.name : null) ?? ZD_UNITS[unit.kind].name;
}

/** 这株药材在某一级的血量上限。杂交药材取两种里高的，再加上低的一部分。 */
export function zdUnitMaxHp(unit: Genes, level: number) {
  const own = zdUnitStats(unit.kind, level).hp;
  if (!unit.graft) return own;
  const other = zdUnitStats(unit.graft, level).hp;
  return Math.round(Math.max(own, other) + Math.min(own, other) * ZD_RULES.hybridHpShare);
}

/** 这种本事要不要自己的计时。药柜、酒精灯、输液架一直生效，不用。 */
function needsOrgan(kind: ZdUnitKind) {
  return kind === "mortar" || kind === "capsule" || kind === "mint" || kind === "ampoule";
}

/** 一种本事刚种下时的计时：研钵先磨半轮再出第一份药力，射手落地后稍等一拍再开火。 */
function freshOrgan(kind: ZdUnitKind): ZdOrgan {
  const definition = ZD_UNITS[kind];
  return { timer: kind === "mortar" ? definition.interval * 0.55 : kind === "fizz" ? definition.interval : kind === "ampoule" ? 0.8 : 0.4, burst: 0, burstTimer: 0 };
}

/** 不能种植时返回原因；可以种植返回 null。 */
export function zdPlaceBlocker(state: ZdState, kind: ZdUnitKind, lane: number, row: number) {
  if (state.over) return "对局已结束";
  if (lane < 0 || lane >= ZD_RULES.lanes || row < 0 || row >= ZD_RULES.rows) return "这里不能种";
  if (zdUnitAt(state, lane, row)) return "这一格已经有药材";
  if (state.cooldowns[kind] > 0) return "还在冷却";
  if (state.energy < ZD_UNITS[kind].cost) return "药力不够";
  return null;
}

export function zdPlace(state: ZdState, kind: ZdUnitKind, lane: number, row: number) {
  if (zdPlaceBlocker(state, kind, lane, row)) return false;
  const definition = ZD_UNITS[kind];
  state.energy -= definition.cost;
  state.cooldowns[kind] = definition.cooldown;
  state.units.push({
    id: state.nextId++,
    kind,
    graft: null,
    second: null,
    lane,
    row,
    level: 1,
    hp: definition.hp,
    maxHp: definition.hp,
    ...freshOrgan(kind),
    pulse: 0,
    hurt: 0,
  });
  state.events.push("place");
  return true;
}

/**
 * 把一种药材杂交到一株等级为 level 的药材上要花的药力：它本身的价钱，
 * 加上把它升到同一级的升级费。杂交出来的药材两种本事同级。
 */
export function zdGraftCost(kind: ZdUnitKind, level: number) {
  let cost = ZD_UNITS[kind].cost;
  for (let from = 1; from < level; from += 1) cost += zdUpgradeFor(kind, from)?.cost ?? 0;
  return cost;
}

/** 不能杂交时返回原因；可以杂交返回 null。 */
export function zdGraftBlocker(state: ZdState, kind: ZdUnitKind, lane: number, row: number) {
  if (state.over) return "对局已结束";
  const unit = zdUnitAt(state, lane, row);
  if (!unit) return "这一格没有药材";
  if (unit.kind === "fizz") return "泡腾片马上就炸，不能杂交";
  if (unit.graft) return "这株已经杂交过了";
  if (unit.kind === kind) return "同一种药材不能杂交，点它可以升级";
  if (state.cooldowns[kind] > 0) return "还在冷却";
  const cost = zdGraftCost(kind, unit.level);
  if (state.energy < cost) return `药力不够，杂交要 ${cost}`;
  return null;
}

/** 把选中的药材种到另一种药材上：两种本事都在，再多一样这个组合独有的效果。 */
export function zdGraft(state: ZdState, kind: ZdUnitKind, lane: number, row: number) {
  if (zdGraftBlocker(state, kind, lane, row)) return false;
  const unit = zdUnitAt(state, lane, row)!;
  state.energy -= zdGraftCost(kind, unit.level);
  state.cooldowns[kind] = ZD_UNITS[kind].cooldown;
  unit.graft = kind;
  unit.second = needsOrgan(kind) ? freshOrgan(kind) : null;
  const maxHp = zdUnitMaxHp(unit, unit.level);
  unit.hp += maxHp - unit.maxHp;
  unit.maxHp = maxHp;
  unit.pulse = 0.3;
  state.effects.push({ kind: "level", lane: unit.lane, y: unit.row + 0.5, age: 0, life: 0.6 });
  state.events.push("graft");
  return true;
}

/** 这株药材的下一级；不能升级时返回 null。杂交药材两种本事一起升，花费相加。 */
export function zdNextUpgrade(unit: Pick<ZdUnit, "kind" | "level"> & { graft?: ZdUnitKind | null }): ZdUpgrade | null {
  const own = zdUpgradeFor(unit.kind, unit.level);
  const other = unit.graft ? zdUpgradeFor(unit.graft, unit.level) : null;
  if (!own || !other) return own ?? other;
  return { cost: own.cost + other.cost, summary: `${own.summary}；${other.summary}` };
}

/** 不能升级时返回原因；可以升级返回 null。 */
export function zdUpgradeBlocker(state: ZdState, lane: number, row: number) {
  if (state.over) return "对局已结束";
  const unit = zdUnitAt(state, lane, row);
  if (!unit) return "这一格没有药材";
  const next = zdNextUpgrade(unit);
  if (!next) return unit.kind === "fizz" ? "泡腾片不能升级" : "已经升到头了";
  if (state.energy < next.cost) return "药力不够";
  return null;
}

export function zdUpgrade(state: ZdState, lane: number, row: number) {
  if (zdUpgradeBlocker(state, lane, row)) return false;
  const unit = zdUnitAt(state, lane, row)!;
  state.energy -= zdNextUpgrade(unit)!.cost;
  unit.level += 1;
  const maxHp = zdUnitMaxHp(unit, unit.level);
  // 带药柜的升级时修好；其他药材只加上新增的那部分血量。
  unit.hp = hasGene(unit, "cabinet") ? maxHp : unit.hp + (maxHp - unit.maxHp);
  unit.maxHp = maxHp;
  unit.pulse = 0.3;
  state.effects.push({ kind: "level", lane: unit.lane, y: unit.row + 0.5, age: 0, life: 0.6 });
  state.events.push("upgrade");
  return true;
}

export function zdRemove(state: ZdState, lane: number, row: number) {
  const index = state.units.findIndex((unit) => unit.lane === lane && unit.row === row);
  if (index < 0 || state.over) return false;
  state.units.splice(index, 1);
  state.events.push("remove");
  return true;
}

function startWave(state: ZdState) {
  state.wave += 1;
  const wave = state.wave;
  const big = wave % ZD_RULES.bigWaveEvery === 0;
  state.events.push(big ? "bigWave" : "wave");
  let remaining = zdWaveBudget(wave);
  const kinds = (Object.values(ZD_ZOMBIES) as ZdZombieDefinition[]).filter((zombie) => zombie.fromWave <= wave);
  while (remaining >= 1) {
    const affordable = kinds.filter((zombie) => zombie.cost <= remaining);
    let pick = nextRandom(state) * affordable.reduce((total, zombie) => total + zombie.weight, 0);
    let chosen = affordable[0];
    for (const zombie of affordable) {
      pick -= zombie.weight;
      if (pick < 0) {
        chosen = zombie;
        break;
      }
    }
    remaining -= chosen.cost;
    state.spawns.push({
      at: state.nextWaveAt + nextRandom(state) * ZD_RULES.spawnWindowSeconds,
      kind: chosen.kind,
      lane: Math.floor(nextRandom(state) * ZD_RULES.lanes),
      wave,
    });
  }
  state.spawns.sort((left, right) => left.at - right.at);
  state.nextWaveAt += ZD_RULES.waveSeconds;
}

function spawnDue(state: ZdState) {
  while (state.spawns.length && state.spawns[0].at <= state.time) {
    const spawn = state.spawns.shift()!;
    const definition = ZD_ZOMBIES[spawn.kind];
    const hp = Math.round(definition.hp * zdWaveHpScale(spawn.wave));
    state.zombies.push({
      id: state.nextId++,
      kind: spawn.kind,
      lane: spawn.lane,
      y: ZD_RULES.spawnY,
      hp,
      maxHp: hp,
      slow: 0,
      biting: false,
      hurt: 0,
    });
  }
}

/** 打一下僵尸。bounty 为真且这一下打死了它，击退时额外掉药力。 */
function damageZombie(zombie: ZdZombie, amount: number, bounty = false) {
  const alive = zombie.hp > 0;
  zombie.hp -= amount;
  zombie.hurt = 0.12;
  if (bounty && alive && zombie.hp <= 0) zombie.loot = true;
}

/**
 * 泡腾片炸开：相邻三路、上下一格半以内的僵尸都挨一下，至少炸掉四成血。
 * frost 把炸到的僵尸冻住（减速）若干秒。
 */
function explode(state: ZdState, lane: number, y: number, frost = 0) {
  const damage = ZD_UNITS.fizz.damage;
  for (const zombie of state.zombies) {
    if (Math.abs(zombie.lane - lane) > 1 || Math.abs(zombie.y - y) > 1.6) continue;
    damageZombie(zombie, Math.max(damage, zombie.maxHp * ZD_RULES.fizzShare));
    if (frost > 0) zombie.slow = Math.max(zombie.slow, frost);
  }
  state.effects.push({ kind: "boom", lane, y, age: 0, life: 0.5 });
  state.events.push("boom");
}

/** 一小圈波及：相邻三路、上下 0.8 格以内，除了 except 那一只。 */
function splashAround(lanes: ZdZombie[][], target: ZdZombie, damage: number, slowSeconds: number, bounty: boolean) {
  for (let lane = Math.max(0, target.lane - 1); lane <= Math.min(ZD_RULES.lanes - 1, target.lane + 1); lane += 1) {
    for (const zombie of lanes[lane]) {
      if (zombie === target || zombie.hp <= 0 || Math.abs(zombie.y - target.y) > 0.8) continue;
      damageZombie(zombie, damage, bounty);
      if (slowSeconds > 0) zombie.slow = Math.max(zombie.slow, slowSeconds);
    }
  }
}

/** 开一枪。last 表示这是这一轮齐射的最后一颗。杂交的专属效果在这里加到子弹上。 */
function fire(state: ZdState, unit: ZdUnit, kind: ZdUnitKind, stats: ZdUnitStats, last: boolean) {
  unit.pulse = 0.18;
  const ignited = hasGene(unit, "burner");
  const chilled = kind === "capsule" && hasGene(unit, "mint");
  // 泡腾机枪：每轮最后一颗胶囊炸开一小圈。
  const bomb = kind === "capsule" && last && hasGene(unit, "fizz");
  state.shots.push({
    id: state.nextId++,
    kind: kind === "mint" ? "mint" : "capsule",
    tint: ignited ? "fire" : chilled ? "frost" : "",
    lane: unit.lane,
    y: unit.row + 0.2,
    damage: stats.damage * (ignited ? ZD_RULES.igniteFactor : 1),
    slowSeconds: chilled ? zdUnitStats("mint", unit.level).slowSeconds : stats.slowSeconds,
    splash: bomb ? 1 : stats.splash ? 0.4 : 0,
    pierce: kind === "capsule" && hasGene(unit, "ampoule") ? 1 : 0,
    lastHit: 0,
    bounty: hasGene(unit, "mortar"),
  });
  state.events.push("shoot");
}

/** 推进一种本事的计时：研钵产出、射手开火、安瓿炮齐射、泡腾片引爆。nearest 是每一路最靠上的已进场僵尸的位置。 */
function runOrgan(state: ZdState, unit: ZdUnit, kind: ZdUnitKind, organ: ZdOrgan, delta: number, nearest: number[], lanes: ZdZombie[][]) {
  if (!needsOrgan(kind) && kind !== "fizz") return;
  const definition = ZD_UNITS[kind];
  const stats = zdUnitStats(kind, unit.level);
  if (organ.burst > 0) {
    organ.burstTimer -= delta;
    if (organ.burstTimer <= 0) {
      fire(state, unit, kind, stats, organ.burst === 1);
      organ.burst -= 1;
      organ.burstTimer += BURST_GAP_SECONDS;
    }
  }
  organ.timer -= delta;
  if (organ.timer > 0) return;
  if (kind === "mortar") {
    state.energy += stats.energy;
    organ.timer += definition.interval;
    unit.pulse = 0.5;
    state.effects.push({ kind: "energy", lane: unit.lane, y: unit.row + 0.3, age: 0, life: 0.9, amount: stats.energy });
    state.events.push("energy");
  } else if (kind === "fizz") {
    explode(state, unit.lane, unit.row + 0.5);
    unit.hp = 0;
  } else if (nearest[unit.lane] >= unit.row + 0.5) {
    // 只打自己前方（上方）已经进场的僵尸。
    organ.timer = 0;
  } else if (kind === "ampoule") {
    // 一发打穿整路：前方已进场的僵尸全中。
    organ.timer += definition.interval;
    unit.pulse = 0.25;
    const ignited = hasGene(unit, "burner");
    const damage = stats.damage * (ignited ? ZD_RULES.igniteFactor : 1);
    const slow = hasGene(unit, "mint") ? zdUnitStats("mint", unit.level).slowSeconds : 0;
    const bounty = hasGene(unit, "mortar");
    let front: ZdZombie | null = null;
    for (const zombie of lanes[unit.lane]) {
      if (zombie.hp <= 0 || zombie.y <= -0.4 || zombie.y >= unit.row + 0.5) continue;
      damageZombie(zombie, damage, bounty);
      if (slow > 0) zombie.slow = Math.max(zombie.slow, slow);
      if (!front || zombie.y > front.y) front = zombie;
    }
    // 爆破安瓿：在最前面那只僵尸身上炸开一小圈。
    if (front && hasGene(unit, "fizz")) splashAround(lanes, front, damage, slow, bounty);
    state.effects.push({ kind: "beam", lane: unit.lane, y: unit.row + 0.2, age: 0, life: 0.28, tint: ignited ? "fire" : slow > 0 ? "frost" : "" });
    state.events.push("beam");
  } else {
    organ.timer += definition.interval;
    fire(state, unit, kind, stats, stats.shots === 1);
    organ.burst = stats.shots - 1;
    organ.burstTimer = BURST_GAP_SECONDS;
  }
}

function stepUnits(state: ZdState, delta: number, lanes: ZdZombie[][], grid: Array<ZdUnit | undefined>) {
  const nearest: number[] = [];
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
    let top = Number.POSITIVE_INFINITY;
    for (const zombie of lanes[lane]) {
      if (zombie.y > -0.4 && zombie.y < top) top = zombie.y;
    }
    nearest.push(top);
  }
  const { rows } = ZD_RULES;
  for (const unit of state.units) {
    // 杂交了药柜：挨啃的时候攻击和产出都加快。
    const pace = unit.graft && unit.hurt > 0 && hasGene(unit, "cabinet") ? delta * ZD_RULES.enrageFactor : delta;
    unit.pulse = Math.max(0, unit.pulse - delta);
    unit.hurt = Math.max(0, unit.hurt - delta);
    runOrgan(state, unit, unit.kind, unit, pace, nearest, lanes);
    if (unit.graft && unit.second) runOrgan(state, unit, unit.graft, unit.second, pace, nearest, lanes);
    if (hasGene(unit, "burner")) {
      // 酒精灯：前方一格半以内的僵尸一起烧。
      const burn = zdUnitStats("burner", unit.level).burn * delta;
      const bounty = hasGene(unit, "mortar");
      let burning = false;
      for (const zombie of lanes[unit.lane]) {
        if (zombie.hp <= 0 || zombie.y <= -0.4 || zombie.y >= unit.row + 0.5 || zombie.y < unit.row - ZD_RULES.burnReach) continue;
        zombie.hp -= burn;
        if (bounty && zombie.hp <= 0) zombie.loot = true;
        burning = true;
      }
      if (burning) unit.pulse = Math.max(unit.pulse, 0.15);
    }
    if (hasGene(unit, "drip")) {
      // 输液架：周围一圈（含斜角）的药材慢慢回血。单独的输液架不给自己回，杂交过的自己也回。
      const heal = zdUnitStats("drip", unit.level).heal * delta;
      for (let lane = Math.max(0, unit.lane - 1); lane <= Math.min(ZD_RULES.lanes - 1, unit.lane + 1); lane += 1) {
        for (let row = Math.max(0, unit.row - 1); row <= Math.min(rows - 1, unit.row + 1); row += 1) {
          const other = grid[lane * rows + row];
          if (other && other !== unit && other.hp > 0 && other.hp < other.maxHp) other.hp = Math.min(other.maxHp, other.hp + heal);
        }
      }
      if (unit.graft && unit.hp > 0 && unit.hp < unit.maxHp) {
        unit.hp = Math.min(unit.maxHp, unit.hp + heal * (hasGene(unit, "cabinet") ? ZD_RULES.wallRegenFactor : 1));
      }
    }
  }
}

function stepShots(state: ZdState, delta: number, lanes: ZdZombie[][]) {
  if (!state.shots.length) return;
  const travel = ZD_RULES.shotSpeed * delta;
  const range = ZD_RULES.shotHitRange;
  let spent = false;
  for (const shot of state.shots) {
    const from = shot.y;
    shot.y -= travel;
    let target: ZdZombie | null = null;
    for (const zombie of lanes[shot.lane]) {
      if (zombie.hp <= 0 || zombie.id === shot.lastHit) continue;
      // 这一步扫过的区间内，取离射手最近的那只。
      if (zombie.y <= from + range && zombie.y >= shot.y - range && (!target || zombie.y > target.y)) target = zombie;
    }
    if (!target) {
      if (shot.y <= -1) spent = true;
      continue;
    }
    damageZombie(target, shot.damage, shot.bounty);
    if (shot.slowSeconds > 0) target.slow = Math.max(target.slow, shot.slowSeconds);
    if (shot.splash > 0) splashAround(lanes, target, shot.damage * shot.splash, shot.slowSeconds, shot.bounty);
    state.events.push("hit");
    if (shot.pierce > 0) {
      // 穿甲：打穿这一只，接着往前飞。
      shot.pierce -= 1;
      shot.lastHit = target.id;
      continue;
    }
    shot.damage = 0;
    spent = true;
  }
  if (spent) state.shots = state.shots.filter((shot) => shot.damage > 0 && shot.y > -1);
}

function stepZombies(state: ZdState, delta: number, grid: Array<ZdUnit | undefined>) {
  const { rows, biteReach } = ZD_RULES;
  for (const zombie of state.zombies) {
    zombie.hurt = Math.max(0, zombie.hurt - delta);
    zombie.slow = Math.max(0, zombie.slow - delta);
    const definition = ZD_ZOMBIES[zombie.kind];
    const factor = zombie.slow > 0 ? ZD_RULES.slowFactor : 1;
    // 能啃到第 row 格的条件是 row - biteReach <= y < row + 0.9；先碰到的（靠上的）那一格优先。
    let blocker: ZdUnit | undefined;
    for (let row = Math.max(0, Math.floor(zombie.y - 0.9) + 1); row <= Math.min(rows - 1, Math.floor(zombie.y + biteReach)); row += 1) {
      const unit = grid[zombie.lane * rows + row];
      if (unit && unit.hp > 0 && zombie.y >= row - biteReach && zombie.y < row + 0.9) {
        blocker = unit;
        break;
      }
    }
    zombie.biting = Boolean(blocker);
    if (blocker) {
      blocker.hp -= definition.bite * factor * delta;
      blocker.hurt = 0.12;
      if (hasGene(blocker, "cabinet")) {
        let thorns = zdUnitStats("cabinet", blocker.level).thorns;
        // 火焰药柜：啃它的僵尸被加倍的火烧。寒冰药柜：啃它的僵尸一直被减速。
        if (hasGene(blocker, "burner")) thorns += zdUnitStats("burner", blocker.level).burn * ZD_RULES.fireWallFactor;
        if (hasGene(blocker, "mint")) zombie.slow = Math.max(zombie.slow, 1);
        zombie.hp -= thorns * delta;
      }
      continue;
    }
    zombie.y += definition.speed * factor * delta;
    // 只要有一只僵尸走出药圃，这一局就结束。
    if (zombie.y >= rows) {
      zombie.y = rows;
      state.over = true;
    }
  }
}

function sweep(state: ZdState) {
  let lostUnit = false;
  for (const unit of state.units) {
    if (unit.hp > 0) continue;
    lostUnit = true;
    // 杂交了泡腾片的药材被啃掉时炸开。自己就是泡腾片的已经在引爆时炸过了。
    if (unit.graft !== "fizz") continue;
    explode(state, unit.lane, unit.row + 0.5, unit.kind === "mint" ? ZD_RULES.frostBlastSeconds : 0);
    if (unit.kind === "drip") {
      // 急救泡腾：把周围一圈药材回满血。
      for (const other of state.units) {
        if (other.hp > 0 && Math.abs(other.lane - unit.lane) <= 1 && Math.abs(other.row - unit.row) <= 1) other.hp = other.maxHp;
      }
    }
  }
  let lostZombie = false;
  for (const zombie of state.zombies) {
    if (zombie.hp > 0) continue;
    lostZombie = true;
    state.score += zdZombiePoints(zombie.kind);
    state.kills += 1;
    state.effects.push({ kind: "puff", lane: zombie.lane, y: zombie.y, age: 0, life: 0.4 });
    if (zombie.loot) {
      const amount = Math.round(ZD_ZOMBIES[zombie.kind].cost * ZD_RULES.bountyPerCost);
      state.energy += amount;
      state.effects.push({ kind: "energy", lane: zombie.lane, y: zombie.y, age: 0, life: 0.9, amount });
    }
  }
  if (lostZombie) state.zombies = state.zombies.filter((zombie) => zombie.hp > 0);
  if (lostUnit) state.units = state.units.filter((unit) => unit.hp > 0);
}

/** 推进一小段时间；delta 较大时页面应分多次调用。 */
export function zdStep(state: ZdState, delta: number) {
  if (state.over || delta <= 0) return;
  state.time += delta;
  for (const kind of ZD_UNIT_ORDER) state.cooldowns[kind] = Math.max(0, state.cooldowns[kind] - delta);
  state.passiveTimer -= delta;
  if (state.passiveTimer <= 0) {
    state.passiveTimer += ZD_RULES.passiveSeconds;
    state.energy += ZD_RULES.passiveEnergy;
  }
  while (state.time >= state.nextWaveAt) startWave(state);
  spawnDue(state);
  // 僵尸按路分好、药材按格子摆好，这一步里几处都要用。
  const lanes: ZdZombie[][] = [];
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) lanes.push([]);
  for (const zombie of state.zombies) lanes[zombie.lane].push(zombie);
  const grid: Array<ZdUnit | undefined> = new Array(ZD_RULES.lanes * ZD_RULES.rows);
  for (const unit of state.units) {
    if (unit.hp > 0) grid[unit.lane * ZD_RULES.rows + unit.row] = unit;
  }
  stepUnits(state, delta, lanes, grid);
  stepShots(state, delta, lanes);
  stepZombies(state, delta, grid);
  sweep(state);
  if (state.effects.length) {
    let expired = false;
    for (const effect of state.effects) {
      effect.age += delta;
      if (effect.age >= effect.life) expired = true;
    }
    if (expired) state.effects = state.effects.filter((effect) => effect.age < effect.life);
  }
  if (state.over) state.events.push("lost");
}

export function zdCooldownRatio(state: ZdState, kind: ZdUnitKind) {
  return unitInterval(state.cooldowns[kind] / ZD_UNITS[kind].cooldown);
}
