// 合成药大奶的规则和物理：不碰页面，页面、测试和调难度的脚本共用这一份。
// 坐标以罐子内侧左上角为原点，x 向右、y 向下；y = 0 是警戒线，y = height 是罐底。

export const NAI_RULES = {
  width: 400,
  height: 460,
  /** 投放时球心的高度，在警戒线上方。 */
  dropY: -60,
  gravity: 1700,
  stepSeconds: 1 / 240,
  iterations: 8,
  restitution: 0.2,
  /** 相撞速度低于这个数就不反弹，免得堆好的球一直抖。 */
  bounceSpeed: 110,
  /** 每一小步抹掉的接触面相对滑动的比例。 */
  friction: 0.5,
  spinDamping: 0.994,
  maxSpeed: 2400,
  /** 两只球被挤得重叠时，互相推开的速度上限；没有它，刚合成的大球会把旁边的球崩飞。 */
  pushSpeed: 170,
  /** 小球被两只大球夹住会被挤飞；挤出来的速度不超过这个数。 */
  squirtSpeed: 520,
  dropCooldown: 0.5,
  /** 落稳的球顶部越过警戒线累计这么久，对局结束。 */
  overSeconds: 1.5,
  mergePad: 0.8,
  growSeconds: 0.14,
  growFrom: 0.72,
  /** 投放的球只会是前四级，按这组概率抽。 */
  spawnWeights: [0.4, 0.3, 0.2, 0.1],
  /** 两只最高级相撞一起消失的奖励。 */
  clearBonus: 1024,
} as const;

export interface NaiLevel {
  name: string;
  radius: number;
}

export const NAI_LEVELS: readonly NaiLevel[] = [
  { name: "萌新奶", radius: 19 },
  { name: "军训奶", radius: 26 },
  { name: "早八奶", radius: 34 },
  { name: "炸炉奶", radius: 42 },
  { name: "挂科奶", radius: 52 },
  { name: "卷王奶", radius: 63 },
  { name: "熬夜奶", radius: 74 },
  { name: "毕业奶", radius: 87 },
  { name: "博士奶", radius: 101 },
  { name: "药大奶", radius: 117 },
];

export const NAI_MAX_LEVEL = NAI_LEVELS.length;

export interface NaiBody {
  id: number;
  /** 1 到 NAI_MAX_LEVEL。 */
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  age: number;
  /** 合成出来的球从小长到正常大小，投下来的球不用。 */
  born: boolean;
  /** 碰到过罐底或别的球。 */
  landed: boolean;
  /** 顶部越过警戒线的累计秒数。 */
  above: number;
}

export interface NaiEffect {
  kind: "merge" | "clear";
  level: number;
  x: number;
  y: number;
  age: number;
}

export type NaiEvent = { type: "drop" } | { type: "merge"; level: number } | { type: "clear" } | { type: "over" };

export interface NaiState {
  random: number;
  time: number;
  score: number;
  drops: number;
  merges: number;
  /** 这一局出现过的最高等级。 */
  maxLevel: number;
  over: boolean;
  /** 手里这只和下一只的等级。 */
  current: number;
  next: number;
  cooldown: number;
  /** 最接近判负的那只球的进度，0 到 1。 */
  danger: number;
  bodies: NaiBody[];
  effects: NaiEffect[];
  events: NaiEvent[];
  nextId: number;
  carry: number;
}

function nextRandom(state: NaiState) {
  // mulberry32
  state.random = (state.random + 0x6d2b79f5) | 0;
  let value = state.random;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function drawLevel(state: NaiState) {
  let roll = nextRandom(state);
  for (const [index, weight] of NAI_RULES.spawnWeights.entries()) {
    roll -= weight;
    if (roll < 0) return index + 1;
  }
  return NAI_RULES.spawnWeights.length;
}

export function createNaiState(seed: number): NaiState {
  const state: NaiState = {
    random: seed | 0,
    time: 0,
    score: 0,
    drops: 0,
    merges: 0,
    maxLevel: 0,
    over: false,
    current: 1,
    next: 1,
    cooldown: 0,
    danger: 0,
    bodies: [],
    effects: [],
    events: [],
    nextId: 1,
    carry: 0,
  };
  state.current = drawLevel(state);
  state.next = drawLevel(state);
  return state;
}

export function naiLevelRadius(level: number) {
  return NAI_LEVELS[Math.min(NAI_MAX_LEVEL, Math.max(1, level)) - 1].radius;
}

/** 合成出第 level 级时得到的分数。 */
export function naiMergeScore(level: number) {
  return 2 ** (level - 1);
}

/** 球此刻的碰撞半径（刚合成的球还在长大）。 */
export function naiBodyRadius(body: NaiBody) {
  const full = naiLevelRadius(body.level);
  if (!body.born || body.age >= NAI_RULES.growSeconds) return full;
  return full * (NAI_RULES.growFrom + (1 - NAI_RULES.growFrom) * (body.age / NAI_RULES.growSeconds));
}

/** 把瞄准位置限制在罐子里放得下这只球的范围内。 */
export function naiClampAim(level: number, x: number) {
  const radius = naiLevelRadius(level);
  return Math.min(NAI_RULES.width - radius, Math.max(radius, x));
}

export function naiCanDrop(state: NaiState) {
  return !state.over && state.cooldown <= 0;
}

/** 在 x 处投下手里这只球。冷却中或对局已结束时返回 false。 */
export function naiDrop(state: NaiState, x: number) {
  if (!naiCanDrop(state)) return false;
  const level = state.current;
  state.bodies.push({
    id: state.nextId++,
    level,
    x: naiClampAim(level, x),
    y: NAI_RULES.dropY,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    age: 0,
    born: false,
    landed: false,
    above: 0,
  });
  state.drops += 1;
  state.maxLevel = Math.max(state.maxLevel, level);
  state.current = state.next;
  state.next = drawLevel(state);
  state.cooldown = NAI_RULES.dropCooldown;
  state.events.push({ type: "drop" });
  return true;
}

interface Contact {
  a: NaiBody;
  b: NaiBody | null;
  nx: number;
  ny: number;
}

/** 接触面上的摩擦：抹掉一部分相对滑动，同时带动两只球转起来。b 为 null 表示罐壁或罐底。 */
function applyFriction(contact: Contact, radii: Map<NaiBody, number>, inverseMass: Map<NaiBody, number>) {
  const { a, b, nx, ny } = contact;
  const tx = -ny;
  const ty = nx;
  const ra = radii.get(a)!;
  const wa = inverseMass.get(a)!;
  if (!b) {
    const slip = -(a.vx * tx + a.vy * ty) - a.spin * ra;
    const impulse = (-NAI_RULES.friction * slip) / (3 * wa);
    a.vx -= impulse * wa * tx;
    a.vy -= impulse * wa * ty;
    a.spin -= (2 * impulse * wa) / ra;
    return;
  }
  const rb = radii.get(b)!;
  const wb = inverseMass.get(b)!;
  const slip = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty - b.spin * rb - a.spin * ra;
  const impulse = (-NAI_RULES.friction * slip) / (3 * (wa + wb));
  a.vx -= impulse * wa * tx;
  a.vy -= impulse * wa * ty;
  b.vx += impulse * wb * tx;
  b.vy += impulse * wb * ty;
  a.spin -= (2 * impulse * wa) / ra;
  b.spin -= (2 * impulse * wb) / rb;
}

function substep(state: NaiState, h: number) {
  const { width, height } = NAI_RULES;
  const bodies = state.bodies;
  const count = bodies.length;
  state.time += h;
  state.cooldown = Math.max(0, state.cooldown - h);

  const radii = new Map<NaiBody, number>();
  const inverseMass = new Map<NaiBody, number>();
  const before = new Map<NaiBody, [number, number, number, number]>();
  for (const body of bodies) {
    body.age += h;
    const full = naiLevelRadius(body.level);
    radii.set(body, naiBodyRadius(body));
    inverseMass.set(body, 1 / (full * full));
    body.vy += NAI_RULES.gravity * h;
    before.set(body, [body.x, body.y, body.vx, body.vy]);
    body.x += body.vx * h;
    body.y += body.vy * h;
    body.angle += body.spin * h;
  }

  const contacts: Contact[] = [];
  const merging = new Set<NaiBody>();
  const merges: Array<[NaiBody, NaiBody]> = [];
  for (let iteration = 0; iteration < NAI_RULES.iterations; iteration += 1) {
    for (let i = 0; i < count; i += 1) {
      const a = bodies[i];
      const ra = radii.get(a)!;
      for (let j = i + 1; j < count; j += 1) {
        const b = bodies[j];
        const sum = ra + radii.get(b)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const reach = sum + NAI_RULES.mergePad;
        if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
        const squared = dx * dx + dy * dy;
        if (squared >= reach * reach) continue;
        if (iteration === 0 && a.level === b.level && !merging.has(a) && !merging.has(b)) {
          merging.add(a);
          merging.add(b);
          merges.push([a, b]);
        }
        if (squared >= sum * sum) continue;
        const distance = Math.sqrt(squared) || 0.0001;
        const nx = dx / distance;
        const ny = distance > 0.0001 ? dy / distance : 1;
        const wa = inverseMass.get(a)!;
        const wb = inverseMass.get(b)!;
        const push = (sum - distance) / (wa + wb);
        a.x -= nx * push * wa;
        a.y -= ny * push * wa;
        b.x += nx * push * wb;
        b.y += ny * push * wb;
        if (iteration === 0) {
          contacts.push({ a, b, nx, ny });
          a.landed = true;
          b.landed = true;
        }
      }
    }
    for (const body of bodies) {
      const radius = radii.get(body)!;
      if (body.x < radius) {
        body.x = radius;
        if (iteration === 0) contacts.push({ a: body, b: null, nx: -1, ny: 0 });
      } else if (body.x > width - radius) {
        body.x = width - radius;
        if (iteration === 0) contacts.push({ a: body, b: null, nx: 1, ny: 0 });
      }
      if (body.y > height - radius) {
        body.y = height - radius;
        if (iteration === 0) {
          contacts.push({ a: body, b: null, nx: 0, ny: 1 });
          body.landed = true;
        }
      }
    }
  }

  for (const body of bodies) {
    const [x, y] = before.get(body)!;
    body.vx = (body.x - x) / h;
    body.vy = (body.y - y) / h;
  }
  for (const contact of contacts) {
    const { a, b, nx, ny } = contact;
    const start = before.get(a)!;
    if (b) {
      const other = before.get(b)!;
      const approach = (other[2] - start[2]) * nx + (other[3] - start[3]) * ny;
      const now = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      const bounce = approach < -NAI_RULES.bounceSpeed;
      if (bounce || now > NAI_RULES.pushSpeed) {
        const wa = inverseMass.get(a)!;
        const wb = inverseMass.get(b)!;
        const target = bounce ? -NAI_RULES.restitution * approach : NAI_RULES.pushSpeed;
        const change = (target - now) / (wa + wb);
        a.vx -= nx * change * wa;
        a.vy -= ny * change * wa;
        b.vx += nx * change * wb;
        b.vy += ny * change * wb;
      }
    } else {
      const approach = start[2] * nx + start[3] * ny;
      const now = a.vx * nx + a.vy * ny;
      const bounce = approach > NAI_RULES.bounceSpeed;
      if (bounce || now < -NAI_RULES.pushSpeed) {
        const change = (bounce ? -NAI_RULES.restitution * approach : -NAI_RULES.pushSpeed) - now;
        a.vx += nx * change;
        a.vy += ny * change;
      }
    }
    applyFriction(contact, radii, inverseMass);
  }

  let danger = 0;
  for (const body of bodies) {
    const speed = Math.hypot(body.vx, body.vy);
    const start = before.get(body)!;
    const limit = Math.min(NAI_RULES.maxSpeed, Math.max(NAI_RULES.squirtSpeed, Math.hypot(start[2], start[3])));
    if (speed > limit) {
      body.vx *= limit / speed;
      body.vy *= limit / speed;
    }
    body.spin *= NAI_RULES.spinDamping;
    if (body.landed && body.y - radii.get(body)! < 0) body.above += h;
    else body.above = Math.max(0, body.above - 2 * h);
    danger = Math.max(danger, body.above / NAI_RULES.overSeconds);
  }
  state.danger = Math.min(1, danger);

  for (const [a, b] of merges) {
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    state.bodies = state.bodies.filter((body) => body !== a && body !== b);
    state.merges += 1;
    if (a.level >= NAI_MAX_LEVEL) {
      state.score += NAI_RULES.clearBonus;
      state.effects.push({ kind: "clear", level: a.level, x, y, age: 0 });
      state.events.push({ type: "clear" });
      continue;
    }
    const level = a.level + 1;
    const radius = naiLevelRadius(level) * NAI_RULES.growFrom;
    state.bodies.push({
      id: state.nextId++,
      level,
      x: Math.min(width - radius, Math.max(radius, x)),
      y: Math.min(height - radius, y),
      vx: (a.vx + b.vx) / 2,
      vy: (a.vy + b.vy) / 2,
      angle: (a.angle + b.angle) / 2,
      spin: (a.spin + b.spin) / 2,
      age: 0,
      born: true,
      landed: true,
      above: 0,
    });
    state.score += naiMergeScore(level);
    state.maxLevel = Math.max(state.maxLevel, level);
    state.effects.push({ kind: "merge", level, x, y, age: 0 });
    state.events.push({ type: "merge", level });
  }

  for (const effect of state.effects) effect.age += h;
  if (state.effects.length && state.effects[0].age > 0.6) state.effects = state.effects.filter((effect) => effect.age <= 0.6);

  if (state.danger >= 1) {
    state.over = true;
    state.events.push({ type: "over" });
  }
}

/** 推进 delta 秒。内部按固定的小步长走，同样的种子和同样的投放得到同样的对局。 */
export function naiStep(state: NaiState, delta: number) {
  if (state.over) return;
  state.carry += delta;
  while (state.carry >= NAI_RULES.stepSeconds && !state.over) {
    state.carry -= NAI_RULES.stepSeconds;
    substep(state, NAI_RULES.stepSeconds);
  }
}

/** 投了 drops 只球以后最多能拿到的分数：每只最多是第四级，一路合到最高级再成对消掉。 */
export function naiMaxScoreForDrops(drops: number) {
  const top = NAI_RULES.spawnWeights.length;
  // 一只第 n 级的球相当于 2^(n-1) 只第一级；从第一级合到最高级再消掉，每只第一级最多值 NAI_MAX_LEVEL 分。
  const perDrop = 2 ** (top - 1) * NAI_MAX_LEVEL - (top - 1) * 2 ** (top - 1);
  return Math.max(0, Math.floor(drops)) * perDrop;
}

/** 这一局出现过第 level 级时至少已经拿到的分数。 */
export function naiMinScoreForLevel(level: number) {
  const top = NAI_RULES.spawnWeights.length;
  return level > top ? (level - top) * 2 ** (level - 1) : 0;
}

/** 出现第 level 级至少要投几只球。 */
export function naiMinDropsForLevel(level: number) {
  if (level <= 0) return 0;
  const top = NAI_RULES.spawnWeights.length;
  return Math.max(1, Math.ceil(2 ** (level - 1) / 2 ** (top - 1)));
}

export function naiRank(score: number) {
  if (score >= 3600) return "药大奶本奶";
  if (score >= 2400) return "博士奶";
  if (score >= 1500) return "卷王奶";
  if (score >= 800) return "挂科奶";
  if (score >= 300) return "军训奶";
  return "萌新奶";
}
