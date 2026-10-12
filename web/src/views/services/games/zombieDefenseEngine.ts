// 药大人大战僵尸的对局引擎：五路药圃、僵尸自上而下进攻。
// 只有纯数据和纯逻辑，不碰 DOM；页面负责画面和输入，服务端测试用它核对成绩上限并跑自动对局。

export type ZdUnitKind = "mortar" | "capsule" | "mint" | "cabinet" | "fizz";
export type ZdZombieKind = "walker" | "runner" | "beaker" | "giant";
export type ZdShotKind = "capsule" | "mint";
export type ZdEvent = "place" | "remove" | "upgrade" | "graft" | "shoot" | "hit" | "energy" | "boom" | "wave" | "bigWave" | "lost";

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
  // 僵尸血量每波递增；到后期改成按比例连涨，升满的药圃也终究守不住。
  hpGrowthPerWave: 0.06,
  hpCompoundFromWave: 12,
  hpCompoundRate: 1.1,
  pointsPerBudget: 10,
  /** 杂交药材的血量：两种里高的那个，加上低的那个的这个比例。 */
  hybridHpShare: 0.5,
} as const;

export interface ZdUnitDefinition {
  kind: ZdUnitKind;
  name: string;
  summary: string;
  /** 杂交到别的药材上时带过去的本事。 */
  trait: string;
  cost: number;
  hp: number;
  /** 再次种植的冷却（秒）。 */
  cooldown: number;
  /** 开局时已经过的冷却比例：1 表示立即可用。 */
  ready: number;
  /** 攻击或产出的间隔（秒）；泡腾片为引爆延时。 */
  interval: number;
  damage: number;
}

export const ZD_UNITS: Record<ZdUnitKind, ZdUnitDefinition> = {
  mortar: { kind: "mortar", name: "研钵", summary: "定时研磨出药力", trait: "也会磨出药力", cost: 50, hp: 70, cooldown: 5, ready: 1, interval: 8, damage: 0 },
  capsule: { kind: "capsule", name: "胶囊射手", summary: "向前发射胶囊", trait: "也会发射胶囊", cost: 100, hp: 90, cooldown: 5, ready: 1, interval: 1.2, damage: 20 },
  mint: { kind: "mint", name: "薄荷射手", summary: "命中后让僵尸减速", trait: "也会发射减速的薄荷", cost: 150, hp: 90, cooldown: 7, ready: 1, interval: 1.5, damage: 15 },
  cabinet: { kind: "cabinet", name: "药柜", summary: "结实，用来挡路", trait: "变得结实", cost: 50, hp: 700, cooldown: 14, ready: 1, interval: 0, damage: 0 },
  fizz: { kind: "fizz", name: "泡腾片", summary: "片刻后炸开周围一圈", trait: "被啃掉时炸开周围一圈", cost: 125, hp: 300, cooldown: 22, ready: 0.5, interval: 0.8, damage: 900 },
};

export const ZD_UNIT_ORDER: readonly ZdUnitKind[] = ["mortar", "capsule", "mint", "cabinet", "fizz"];

export const ZD_MAX_LEVEL = 3;
// 三连发里相邻两颗胶囊的间隔（秒）。
const BURST_GAP_SECONDS = 0.12;

export interface ZdUpgrade {
  cost: number;
  summary: string;
}

/** 每种药材升到 2 级、3 级的花费和效果；泡腾片是一次性的，不能升级。 */
export const ZD_UPGRADES: Record<ZdUnitKind, readonly ZdUpgrade[]> = {
  mortar: [{ cost: 50, summary: "每次磨出 50 药力" }, { cost: 100, summary: "每次磨出 85 药力" }],
  capsule: [{ cost: 75, summary: "两连发，胶囊更重" }, { cost: 125, summary: "三连发，胶囊再加重" }],
  mint: [{ cost: 100, summary: "伤害更高，减速更久" }, { cost: 150, summary: "命中时连旁边的僵尸一起打、一起减速" }],
  cabinet: [{ cost: 50, summary: "加厚一倍，升级时顺便修好" }, { cost: 100, summary: "再加厚，啃它的僵尸会受伤" }],
  fizz: [],
};

/** 两种药材杂交出来的名字；键是按药材栏顺序排好的一对。 */
export const ZD_HYBRID_NAMES: Record<string, string> = {
  "mortar+capsule": "研钵射手",
  "mortar+mint": "薄荷研钵",
  "mortar+cabinet": "研钵药柜",
  "mortar+fizz": "泡腾研钵",
  "capsule+mint": "双生射手",
  "capsule+cabinet": "铁柜射手",
  "capsule+fizz": "泡腾射手",
  "mint+cabinet": "薄荷药柜",
  "mint+fizz": "泡腾薄荷",
  "cabinet+fizz": "泡腾药柜",
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
}

function buildStats(kind: ZdUnitKind, tier: number): ZdUnitStats {
  const base = ZD_UNITS[kind];
  const stats: ZdUnitStats = { hp: base.hp, damage: base.damage, shots: 1, energy: 0, slowSeconds: 0, splash: false, thorns: 0 };
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
  }
  return Object.freeze(stats);
}

// 每一步都要查很多次，先算好存起来。
const STATS = {} as Record<ZdUnitKind, readonly ZdUnitStats[]>;
for (const kind of ZD_UNIT_ORDER) STATS[kind] = [0, 1, 2].map((tier) => buildStats(kind, tier));

/** 某种药材在某一级的数值。 */
export function zdUnitStats(kind: ZdUnitKind, level: number): ZdUnitStats {
  return STATS[kind][Math.min(ZD_MAX_LEVEL, Math.max(1, level)) - 1];
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
  /** 杂交进来的那一半的计时；它不需要计时（药柜、泡腾片）或没有杂交时为 null。 */
  second: ZdOrgan | null;
  lane: number;
  row: number;
  /** 1 到 3 级。 */
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
}

export interface ZdShot {
  id: number;
  kind: ZdShotKind;
  lane: number;
  y: number;
  damage: number;
  slowSeconds: number;
  splash: boolean;
}

export interface ZdEffect {
  kind: "boom" | "energy" | "puff" | "level";
  lane: number;
  y: number;
  age: number;
  life: number;
  /** 飘出的药力数字。 */
  amount?: number;
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

/** 这株药材的名字；杂交过的用两种药材合起来的名字。 */
export function zdUnitName(unit: Genes) {
  if (!unit.graft) return ZD_UNITS[unit.kind].name;
  const pair = [unit.kind, unit.graft].sort((left, right) => ZD_UNIT_ORDER.indexOf(left) - ZD_UNIT_ORDER.indexOf(right));
  return ZD_HYBRID_NAMES[pair.join("+")] ?? ZD_UNITS[unit.kind].name;
}

/** 这株药材在某一级的血量上限。杂交药材取两种里高的，再加上低的一部分。 */
export function zdUnitMaxHp(unit: Genes, level: number) {
  const own = zdUnitStats(unit.kind, level).hp;
  if (!unit.graft) return own;
  const other = zdUnitStats(unit.graft, level).hp;
  return Math.round(Math.max(own, other) + Math.min(own, other) * ZD_RULES.hybridHpShare);
}

/** 一种本事刚种下时的计时：研钵先磨半轮再出第一份药力，射手落地后稍等一拍再开火。 */
function freshOrgan(kind: ZdUnitKind): ZdOrgan {
  const definition = ZD_UNITS[kind];
  return { timer: kind === "mortar" ? definition.interval * 0.55 : kind === "fizz" ? definition.interval : 0.4, burst: 0, burstTimer: 0 };
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
  for (const upgrade of ZD_UPGRADES[kind].slice(0, Math.max(0, level - 1))) cost += upgrade.cost;
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

/** 把选中的药材种到另一种药材上：一格里同时有两种本事。 */
export function zdGraft(state: ZdState, kind: ZdUnitKind, lane: number, row: number) {
  if (zdGraftBlocker(state, kind, lane, row)) return false;
  const unit = zdUnitAt(state, lane, row)!;
  state.energy -= zdGraftCost(kind, unit.level);
  state.cooldowns[kind] = ZD_UNITS[kind].cooldown;
  unit.graft = kind;
  unit.second = kind === "cabinet" || kind === "fizz" ? null : freshOrgan(kind);
  const maxHp = zdUnitMaxHp(unit, unit.level);
  unit.hp += maxHp - unit.maxHp;
  unit.maxHp = maxHp;
  unit.pulse = 0.3;
  state.effects.push({ kind: "level", lane: unit.lane, y: unit.row + 0.5, age: 0, life: 0.6 });
  state.events.push("graft");
  return true;
}

/** 这株药材的下一级；已经满级或不能升级时返回 null。杂交药材两种本事一起升，花费相加。 */
export function zdNextUpgrade(unit: Pick<ZdUnit, "kind" | "level"> & { graft?: ZdUnitKind | null }): ZdUpgrade | null {
  const own = ZD_UPGRADES[unit.kind][unit.level - 1] ?? null;
  const other = unit.graft ? ZD_UPGRADES[unit.graft][unit.level - 1] ?? null : null;
  if (!own || !other) return own ?? other;
  return { cost: own.cost + other.cost, summary: `${own.summary}；${other.summary}` };
}

/** 不能升级时返回原因；可以升级返回 null。 */
export function zdUpgradeBlocker(state: ZdState, lane: number, row: number) {
  if (state.over) return "对局已结束";
  const unit = zdUnitAt(state, lane, row);
  if (!unit) return "这一格没有药材";
  const next = zdNextUpgrade(unit);
  if (!next) return unit.kind === "fizz" ? "泡腾片不能升级" : "已经满级";
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

function damageZombie(zombie: ZdZombie, amount: number) {
  zombie.hp -= amount;
  zombie.hurt = 0.12;
}

/** 泡腾片炸开：相邻三路、上下一格半以内的僵尸都挨一下。 */
function explode(state: ZdState, lane: number, y: number) {
  const damage = ZD_UNITS.fizz.damage;
  for (const zombie of state.zombies) {
    if (Math.abs(zombie.lane - lane) <= 1 && Math.abs(zombie.y - y) <= 1.6) damageZombie(zombie, damage);
  }
  state.effects.push({ kind: "boom", lane, y, age: 0, life: 0.5 });
  state.events.push("boom");
}

function fire(state: ZdState, unit: ZdUnit, kind: ZdUnitKind, stats: ZdUnitStats) {
  unit.pulse = 0.18;
  state.shots.push({
    id: state.nextId++,
    kind: kind === "mint" ? "mint" : "capsule",
    lane: unit.lane,
    y: unit.row + 0.2,
    damage: stats.damage,
    slowSeconds: stats.slowSeconds,
    splash: stats.splash,
  });
  state.events.push("shoot");
}

/** 推进一种本事的计时：研钵产出、射手开火、泡腾片引爆。nearest 是每一路最靠上的已进场僵尸的位置。 */
function runOrgan(state: ZdState, unit: ZdUnit, kind: ZdUnitKind, organ: ZdOrgan, delta: number, nearest: number[]) {
  if (kind === "cabinet") return;
  const definition = ZD_UNITS[kind];
  const stats = zdUnitStats(kind, unit.level);
  if (organ.burst > 0) {
    organ.burstTimer -= delta;
    if (organ.burstTimer <= 0) {
      fire(state, unit, kind, stats);
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
  } else if (nearest[unit.lane] < unit.row + 0.5) {
    // 只打自己前方（上方）已经进场的僵尸。
    organ.timer += definition.interval;
    fire(state, unit, kind, stats);
    organ.burst = stats.shots - 1;
    organ.burstTimer = BURST_GAP_SECONDS;
  } else {
    organ.timer = 0;
  }
}

function stepUnits(state: ZdState, delta: number) {
  const nearest: number[] = [];
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) nearest.push(Number.POSITIVE_INFINITY);
  for (const zombie of state.zombies) {
    if (zombie.y > -0.4 && zombie.y < nearest[zombie.lane]) nearest[zombie.lane] = zombie.y;
  }
  for (const unit of state.units) {
    unit.pulse = Math.max(0, unit.pulse - delta);
    unit.hurt = Math.max(0, unit.hurt - delta);
    runOrgan(state, unit, unit.kind, unit, delta, nearest);
    if (unit.graft && unit.second) runOrgan(state, unit, unit.graft, unit.second, delta, nearest);
  }
}

function stepShots(state: ZdState, delta: number) {
  if (!state.shots.length) return;
  // 先把僵尸按路分好，每颗子弹只看自己那一路。
  const lanes: ZdZombie[][] = [];
  for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) lanes.push([]);
  for (const zombie of state.zombies) lanes[zombie.lane].push(zombie);
  const travel = ZD_RULES.shotSpeed * delta;
  const range = ZD_RULES.shotHitRange;
  let spent = false;
  for (const shot of state.shots) {
    const from = shot.y;
    shot.y -= travel;
    let target: ZdZombie | null = null;
    for (const zombie of lanes[shot.lane]) {
      if (zombie.hp <= 0) continue;
      // 这一步扫过的区间内，取离射手最近的那只。
      if (zombie.y <= from + range && zombie.y >= shot.y - range && (!target || zombie.y > target.y)) target = zombie;
    }
    if (!target) {
      if (shot.y <= -1) spent = true;
      continue;
    }
    damageZombie(target, shot.damage);
    if (shot.slowSeconds > 0) target.slow = Math.max(target.slow, shot.slowSeconds);
    if (shot.splash) {
      for (let lane = Math.max(0, target.lane - 1); lane <= Math.min(ZD_RULES.lanes - 1, target.lane + 1); lane += 1) {
        for (const zombie of lanes[lane]) {
          if (zombie === target || zombie.hp <= 0 || Math.abs(zombie.y - target.y) > 0.8) continue;
          damageZombie(zombie, shot.damage * 0.4);
          zombie.slow = Math.max(zombie.slow, shot.slowSeconds);
        }
      }
    }
    shot.damage = 0;
    spent = true;
    state.events.push("hit");
  }
  if (spent) state.shots = state.shots.filter((shot) => shot.damage > 0 && shot.y > -1);
}

function stepZombies(state: ZdState, delta: number) {
  const { rows, lanes, biteReach } = ZD_RULES;
  // 每一格里的药材，僵尸只看自己脚下和前面一格。
  const grid: Array<ZdUnit | undefined> = new Array(lanes * rows);
  for (const unit of state.units) {
    if (unit.hp > 0) grid[unit.lane * rows + unit.row] = unit;
  }
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
      if (hasGene(blocker, "cabinet")) zombie.hp -= zdUnitStats("cabinet", blocker.level).thorns * delta;
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
    if (unit.graft === "fizz") explode(state, unit.lane, unit.row + 0.5);
  }
  let lostZombie = false;
  for (const zombie of state.zombies) {
    if (zombie.hp > 0) continue;
    lostZombie = true;
    state.score += zdZombiePoints(zombie.kind);
    state.kills += 1;
    state.effects.push({ kind: "puff", lane: zombie.lane, y: zombie.y, age: 0, life: 0.4 });
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
  stepUnits(state, delta);
  stepShots(state, delta);
  stepZombies(state, delta);
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
