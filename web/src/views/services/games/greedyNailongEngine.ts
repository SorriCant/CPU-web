// 贪吃奶龙的规则：一条在格子里走的奶龙，吃零食变长，撞墙或咬到自己就结束。
// 只有数据和规则，不碰画布和页面；同一个种子、同样的操作会得到同样的一局，服务端的校验和测试都靠它。

export const NL_RULES = {
  columns: 13,
  rows: 20,
  /** 开局的长度（含头）。 */
  startLength: 3,
  /** 走一格要多久（秒）：开局最慢，每吃一口快一点，逐渐贴近最快的间隔。 */
  stepStart: 0.2,
  stepMin: 0.085,
  stepEase: 0.966,
  /** 提前按下的转向最多记三个，拐急弯时不会丢。 */
  queueLimit: 3,
  /** 零食：场上一直有一份。 */
  snackScore: 10,
  /** 火锅：每吃够这么多份零食出一锅，过时不候。越早吃分越高，吃了长两节。 */
  feastEvery: 6,
  feastSeconds: 7,
  feastScoreMin: 20,
  feastScoreMax: 50,
  feastGrow: 2,
  /** 消食片：身子够长以后，每吃够这么多份零食出一份。吃了瘦三节。 */
  pillEvery: 10,
  pillFromLength: 12,
  pillSeconds: 9,
  pillScore: 15,
  pillShrink: 3,
} as const;

export type NlDirection = "up" | "down" | "left" | "right";
export type NlItemKind = "snack" | "feast" | "pill";
export type NlCause = "wall" | "self" | "full";

export interface NlCell {
  x: number;
  y: number;
}

export interface NlItem extends NlCell {
  kind: NlItemKind;
  /** 零食的花样（画面用，不影响规则）。 */
  look: number;
  /** 还剩多少秒；零食不会过期，一直是 0。 */
  left: number;
}

export type NlEvent =
  | { type: "eat"; kind: NlItemKind; score: number; x: number; y: number }
  | { type: "spawn"; kind: NlItemKind }
  | { type: "expire"; kind: NlItemKind }
  | { type: "turn" }
  | { type: "die"; cause: NlCause };

export interface NlState {
  random: number;
  time: number;
  /** 离下一步已经过了多久；画面用它在两格之间补间。 */
  stepTimer: number;
  direction: NlDirection;
  queue: NlDirection[];
  /** 身体各节所在的格子，头在最前。 */
  snake: NlCell[];
  /** 上一步尾巴让出来的格子；这一步长了一节（尾巴没动）时是 null。 */
  tailGhost: NlCell | null;
  /** 还欠着没长出来的节数。 */
  growth: number;
  items: NlItem[];
  score: number;
  /** 吃掉的东西总数（零食、火锅、消食片都算）。 */
  foods: number;
  snacks: number;
  /** 这一局到过的最长长度。 */
  maxLength: number;
  /** 刚吃完东西，还在嚼（秒）。 */
  chewing: number;
  over: boolean;
  cause: NlCause | null;
  events: NlEvent[];
}

export const NL_SNACK_LOOKS = 8;
const VECTORS: Record<NlDirection, NlCell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE: Record<NlDirection, NlDirection> = { up: "down", down: "up", left: "right", right: "left" };

export function nlVector(direction: NlDirection) {
  return VECTORS[direction];
}

function nextRandom(state: NlState) {
  // mulberry32
  state.random = (state.random + 0x6d2b79f5) >>> 0;
  let value = state.random;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

/** 走一格要多久：吃得越多越快。 */
export function nlStepSeconds(foods: number) {
  return NL_RULES.stepMin + (NL_RULES.stepStart - NL_RULES.stepMin) * NL_RULES.stepEase ** Math.max(0, foods);
}

/** 火锅还剩 left 秒时吃掉能得多少分。 */
export function nlFeastScore(left: number) {
  const share = Math.min(1, Math.max(0, left / NL_RULES.feastSeconds));
  return Math.round(NL_RULES.feastScoreMin + (NL_RULES.feastScoreMax - NL_RULES.feastScoreMin) * share);
}

/**
 * 一共吃了 foods 样东西时分数的上限：全是零食是每样 10 分，其中最多每七样里有一锅满分的火锅，
 * 每十一样里有一份消食片。服务端按它校验提交的成绩。
 */
export function nlMaxScoreForFoods(foods: number) {
  const count = Math.max(0, Math.floor(foods));
  return count * NL_RULES.snackScore
    + Math.ceil(count / (NL_RULES.feastEvery + 1)) * (NL_RULES.feastScoreMax - NL_RULES.snackScore)
    + Math.ceil(count / (NL_RULES.pillEvery + 1)) * (NL_RULES.pillScore - NL_RULES.snackScore);
}

/** 吃了 foods 样东西最长能有多长。 */
export function nlMaxLengthForFoods(foods: number) {
  return Math.min(NL_RULES.columns * NL_RULES.rows, NL_RULES.startLength + Math.max(0, Math.floor(foods)) * NL_RULES.feastGrow);
}

export function nlRank(score: number) {
  if (score >= 1400) return "贪吃奶龙本龙";
  if (score >= 900) return "饭桶奶龙";
  if (score >= 500) return "食堂扫荡者";
  if (score >= 250) return "自助餐常客";
  if (score >= 100) return "干饭龙";
  return "小馋龙";
}

function occupied(state: NlState, x: number, y: number) {
  for (const cell of state.snake) if (cell.x === x && cell.y === y) return true;
  for (const item of state.items) if (item.x === x && item.y === y) return true;
  return false;
}

/** 找一个空格子放东西；一个空格都没有时返回 false。 */
function spawn(state: NlState, kind: NlItemKind) {
  const free: NlCell[] = [];
  for (let y = 0; y < NL_RULES.rows; y += 1) {
    for (let x = 0; x < NL_RULES.columns; x += 1) {
      if (!occupied(state, x, y)) free.push({ x, y });
    }
  }
  if (!free.length) return false;
  const cell = free[Math.floor(nextRandom(state) * free.length)];
  const look = kind === "snack" ? Math.floor(nextRandom(state) * NL_SNACK_LOOKS) : 0;
  const left = kind === "feast" ? NL_RULES.feastSeconds : kind === "pill" ? NL_RULES.pillSeconds : 0;
  state.items.push({ kind, look, left, x: cell.x, y: cell.y });
  if (kind !== "snack") state.events.push({ type: "spawn", kind });
  return true;
}

export function createNlState(seed: number): NlState {
  const centerX = Math.floor(NL_RULES.columns / 2);
  const headY = Math.floor(NL_RULES.rows / 2) + 1;
  const state: NlState = {
    random: seed >>> 0,
    time: 0,
    // 一开局就迈出第一步：画面在两格之间补间，从零开始等的话，开局那一下奶龙会先往后缩一格。
    stepTimer: nlStepSeconds(0),
    direction: "up",
    queue: [],
    snake: Array.from({ length: NL_RULES.startLength }, (_, index) => ({ x: centerX, y: headY + index })),
    tailGhost: null,
    growth: 0,
    items: [],
    score: 0,
    foods: 0,
    snacks: 0,
    maxLength: NL_RULES.startLength,
    chewing: 0,
    over: false,
    cause: null,
    events: [],
  };
  spawn(state, "snack");
  return state;
}

/**
 * 转向。和最后一次定下的方向相同的不算，掉头不行，记满了也不再记。
 * 刚按了一边、还没来得及拐又按了反方向（比如先左后右），以后按的为准。返回这一下有没有记上。
 */
export function nlTurn(state: NlState, direction: NlDirection) {
  if (state.over) return false;
  const queue = state.queue;
  const last = queue.length ? queue[queue.length - 1] : state.direction;
  if (direction === last) return false;
  if (direction === OPPOSITE[last]) {
    // 和正在走的方向相反是掉头；和还没拐的那一下相反，就是改主意了，换成新的。
    if (!queue.length) return false;
    queue[queue.length - 1] = direction;
  } else if (queue.length >= NL_RULES.queueLimit) return false;
  else queue.push(direction);
  state.events.push({ type: "turn" });
  return true;
}

function finish(state: NlState, cause: NlCause) {
  state.over = true;
  state.cause = cause;
  state.events.push({ type: "die", cause });
}

function eat(state: NlState, index: number) {
  const item = state.items[index];
  state.items.splice(index, 1);
  state.foods += 1;
  state.chewing = 0.32;
  let gained: number = NL_RULES.snackScore;
  if (item.kind === "snack") {
    state.snacks += 1;
    state.growth += 1;
  } else if (item.kind === "feast") {
    gained = nlFeastScore(item.left);
    state.growth += NL_RULES.feastGrow;
  } else {
    gained = NL_RULES.pillScore;
    // 瘦下来：先抵掉还没长出来的，再从尾巴上去掉，最短留开局那么长。
    let shrink: number = NL_RULES.pillShrink;
    const waived = Math.min(shrink, state.growth);
    state.growth -= waived;
    shrink -= waived;
    while (shrink > 0 && state.snake.length > NL_RULES.startLength) {
      state.snake.pop();
      shrink -= 1;
    }
    state.tailGhost = null;
  }
  state.score += gained;
  state.events.push({ type: "eat", kind: item.kind, score: gained, x: item.x, y: item.y });
  if (item.kind !== "snack") return;
  // 零食吃掉立刻再来一份；攒够数了再加一锅火锅或者一份消食片。
  if (!spawn(state, "snack")) {
    finish(state, "full");
    return;
  }
  if (state.snacks % NL_RULES.feastEvery === 0 && !state.items.some((other) => other.kind === "feast")) spawn(state, "feast");
  if (state.snacks % NL_RULES.pillEvery === 0 && state.snake.length + state.growth >= NL_RULES.pillFromLength && !state.items.some((other) => other.kind === "pill")) {
    spawn(state, "pill");
  }
}

/** 往前走一格。 */
function advance(state: NlState) {
  const turn = state.queue.shift();
  if (turn) state.direction = turn;
  const vector = VECTORS[state.direction];
  const head = state.snake[0];
  const x = head.x + vector.x;
  const y = head.y + vector.y;
  if (x < 0 || x >= NL_RULES.columns || y < 0 || y >= NL_RULES.rows) {
    finish(state, "wall");
    return;
  }
  // 这一步不长的话尾巴会让开，所以头可以走进尾巴现在占着的那一格。
  const growing = state.growth > 0;
  const bodyEnd = growing ? state.snake.length : state.snake.length - 1;
  for (let index = 0; index < bodyEnd; index += 1) {
    if (state.snake[index].x === x && state.snake[index].y === y) {
      finish(state, "self");
      return;
    }
  }
  state.snake.unshift({ x, y });
  if (growing) {
    state.growth -= 1;
    state.tailGhost = null;
  } else {
    state.tailGhost = state.snake.pop() ?? null;
  }
  const found = state.items.findIndex((item) => item.x === x && item.y === y);
  if (found >= 0) eat(state, found);
  if (state.snake.length > state.maxLength) state.maxLength = state.snake.length;
}

/** 推进 delta 秒。 */
export function nlStep(state: NlState, delta: number) {
  if (state.over || delta <= 0) return;
  state.time += delta;
  state.chewing = Math.max(0, state.chewing - delta);
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item.kind === "snack") continue;
    item.left -= delta;
    if (item.left <= 0) {
      state.items.splice(index, 1);
      state.events.push({ type: "expire", kind: item.kind });
    }
  }
  // 有转向等着的时候，脚下这一格按最快的速度走完再拐：开局走得慢，要是照常走完这一格，拐弯会显得不跟手。
  // 最快也就是 stepMin 走一格，和后期的速度一样。
  let remaining = delta;
  while (remaining > 0 && !state.over) {
    const interval = nlStepSeconds(state.foods);
    const rate = state.queue.length ? Math.max(1, interval / NL_RULES.stepMin) : 1;
    const need = Math.max(0, interval - state.stepTimer) / rate;
    if (remaining < need) {
      state.stepTimer += remaining * rate;
      break;
    }
    remaining -= need;
    state.stepTimer = 0;
    advance(state);
  }
  if (state.over) state.stepTimer = nlStepSeconds(state.foods);
}
