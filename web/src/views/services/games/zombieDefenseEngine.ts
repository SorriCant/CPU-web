// 药大人大战僵尸的对局引擎：五路药圃、僵尸自上而下进攻。
// 只有纯数据和纯逻辑，不碰 DOM；页面负责画面和输入，服务端测试用它核对成绩上限并跑自动对局。

export type ZdUnitKind = "mortar" | "capsule" | "mint" | "cabinet" | "fizz";
export type ZdZombieKind = "walker" | "runner" | "beaker" | "giant";
export type ZdShotKind = "capsule" | "mint";
export type ZdEvent = "place" | "remove" | "shoot" | "hit" | "energy" | "boom" | "wave" | "bigWave" | "lost";

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
  // 僵尸血量每波递增，摆满药圃也终究守不住。
  hpGrowthPerWave: 0.06,
  pointsPerBudget: 10,
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
  damage: number;
}

export const ZD_UNITS: Record<ZdUnitKind, ZdUnitDefinition> = {
  mortar: { kind: "mortar", name: "研钵", summary: "定时研磨出药力", cost: 50, hp: 70, cooldown: 5, ready: 1, interval: 8, damage: 0 },
  capsule: { kind: "capsule", name: "胶囊射手", summary: "向前发射胶囊", cost: 100, hp: 90, cooldown: 5, ready: 1, interval: 1.2, damage: 20 },
  mint: { kind: "mint", name: "薄荷射手", summary: "命中后让僵尸减速", cost: 150, hp: 90, cooldown: 7, ready: 1, interval: 1.5, damage: 15 },
  cabinet: { kind: "cabinet", name: "药柜", summary: "结实，用来挡路", cost: 50, hp: 700, cooldown: 14, ready: 1, interval: 0, damage: 0 },
  fizz: { kind: "fizz", name: "泡腾片", summary: "片刻后炸开周围一圈", cost: 125, hp: 300, cooldown: 22, ready: 0.5, interval: 0.8, damage: 900 },
};

export const ZD_UNIT_ORDER: readonly ZdUnitKind[] = ["mortar", "capsule", "mint", "cabinet", "fizz"];

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

export interface ZdUnit {
  id: number;
  kind: ZdUnitKind;
  lane: number;
  row: number;
  hp: number;
  maxHp: number;
  /** 距离下一次攻击、产出或引爆的秒数。 */
  timer: number;
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
}

export interface ZdEffect {
  kind: "boom" | "energy" | "puff";
  lane: number;
  y: number;
  age: number;
  life: number;
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
  return 1 + ZD_RULES.hpGrowthPerWave * Math.max(0, wave - 1);
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
  if (score >= 2000) return "药圃战神";
  if (score >= 1200) return "防线统帅";
  if (score >= 500) return "护圃能手";
  if (score >= 150) return "见习园丁";
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
    lane,
    row,
    hp: definition.hp,
    maxHp: definition.hp,
    // 研钵先磨半轮再出第一份药力；射手落地后稍等一拍再开火。
    timer: kind === "mortar" ? definition.interval * 0.55 : kind === "fizz" ? definition.interval : 0.4,
    pulse: 0,
    hurt: 0,
  });
  state.events.push("place");
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

function stepUnits(state: ZdState, delta: number) {
  for (const unit of state.units) {
    unit.pulse = Math.max(0, unit.pulse - delta);
    unit.hurt = Math.max(0, unit.hurt - delta);
    const definition = ZD_UNITS[unit.kind];
    if (unit.kind === "cabinet") continue;
    unit.timer -= delta;
    if (unit.timer > 0) continue;
    if (unit.kind === "mortar") {
      state.energy += ZD_RULES.passiveEnergy;
      unit.timer += definition.interval;
      unit.pulse = 0.5;
      state.effects.push({ kind: "energy", lane: unit.lane, y: unit.row + 0.3, age: 0, life: 0.9 });
      state.events.push("energy");
    } else if (unit.kind === "fizz") {
      for (const zombie of state.zombies) {
        if (Math.abs(zombie.lane - unit.lane) <= 1 && Math.abs(zombie.y - (unit.row + 0.5)) <= 1.6) damageZombie(zombie, definition.damage);
      }
      unit.hp = 0;
      state.effects.push({ kind: "boom", lane: unit.lane, y: unit.row + 0.5, age: 0, life: 0.5 });
      state.events.push("boom");
    } else {
      // 只打自己前方（上方）已经进场的僵尸。
      const hasTarget = state.zombies.some((zombie) => zombie.lane === unit.lane && zombie.y > -0.4 && zombie.y < unit.row + 0.5);
      if (!hasTarget) {
        unit.timer = 0;
        continue;
      }
      unit.timer += definition.interval;
      unit.pulse = 0.18;
      state.shots.push({ id: state.nextId++, kind: unit.kind === "mint" ? "mint" : "capsule", lane: unit.lane, y: unit.row + 0.2, damage: definition.damage });
      state.events.push("shoot");
    }
  }
}

function stepShots(state: ZdState, delta: number) {
  const travel = ZD_RULES.shotSpeed * delta;
  for (const shot of state.shots) {
    const from = shot.y;
    shot.y -= travel;
    let target: ZdZombie | null = null;
    for (const zombie of state.zombies) {
      if (zombie.lane !== shot.lane || zombie.hp <= 0) continue;
      // 这一步扫过的区间内，取离射手最近的那只。
      if (zombie.y <= from + ZD_RULES.shotHitRange && zombie.y >= shot.y - ZD_RULES.shotHitRange && (!target || zombie.y > target.y)) target = zombie;
    }
    if (!target) continue;
    damageZombie(target, shot.damage);
    if (shot.kind === "mint") target.slow = ZD_RULES.slowSeconds;
    shot.damage = 0;
    state.events.push("hit");
  }
  state.shots = state.shots.filter((shot) => shot.damage > 0 && shot.y > -1);
}

function stepZombies(state: ZdState, delta: number) {
  for (const zombie of state.zombies) {
    zombie.hurt = Math.max(0, zombie.hurt - delta);
    zombie.slow = Math.max(0, zombie.slow - delta);
    const definition = ZD_ZOMBIES[zombie.kind];
    const factor = zombie.slow > 0 ? ZD_RULES.slowFactor : 1;
    const blocker = state.units.find((unit) => unit.lane === zombie.lane && unit.hp > 0
      && zombie.y >= unit.row - ZD_RULES.biteReach && zombie.y < unit.row + 0.9);
    zombie.biting = Boolean(blocker);
    if (blocker) {
      blocker.hp -= definition.bite * factor * delta;
      blocker.hurt = 0.12;
      continue;
    }
    zombie.y += definition.speed * factor * delta;
    // 只要有一只僵尸走出药圃，这一局就结束。
    if (zombie.y >= ZD_RULES.rows) {
      zombie.y = ZD_RULES.rows;
      state.over = true;
    }
  }
}

function sweep(state: ZdState) {
  for (const zombie of state.zombies) {
    if (zombie.hp > 0) continue;
    state.score += zdZombiePoints(zombie.kind);
    state.kills += 1;
    state.effects.push({ kind: "puff", lane: zombie.lane, y: zombie.y, age: 0, life: 0.4 });
  }
  state.zombies = state.zombies.filter((zombie) => zombie.hp > 0);
  state.units = state.units.filter((unit) => unit.hp > 0);
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
  for (const effect of state.effects) effect.age += delta;
  state.effects = state.effects.filter((effect) => effect.age < effect.life);
  if (state.over) state.events.push("lost");
}

export function zdCooldownRatio(state: ZdState, kind: ZdUnitKind) {
  return unitInterval(state.cooldowns[kind] / ZD_UNITS[kind].cooldown);
}
