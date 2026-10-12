import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  earnedZombieDefenseAchievementCodes,
  maxZombieDefenseScoreThroughWave,
  minimumDurationForZombieWaves,
  validateZombieDefenseResult,
  ZOMBIE_DEFENSE_ACHIEVEMENTS,
  ZOMBIE_DEFENSE_FIRST_WAVE_MS,
  ZOMBIE_DEFENSE_MAX_SCORE,
  ZOMBIE_DEFENSE_MAX_WAVES,
  ZOMBIE_DEFENSE_WAVE_MS,
} from "../src/services/zombieDefensePolicy";
import {
  createZdState,
  zdCooldownRatio,
  zdMaxScoreThroughWave,
  zdNextUpgrade,
  zdPlace,
  zdPlaceBlocker,
  zdRemove,
  zdStep,
  zdUnitAt,
  zdUnitStats,
  zdUpgrade,
  zdUpgradeBlocker,
  zdWaveBudget,
  zdWaveHpScale,
  zdWaveStartSeconds,
  zdZombiePoints,
  ZD_MAX_LEVEL,
  ZD_RULES,
  ZD_UNIT_ORDER,
  ZD_UNITS,
  ZD_UPGRADES,
  ZD_ZOMBIES,
  type ZdState,
  type ZdZombieKind,
} from "../../web/src/views/services/games/zombieDefenseEngine";

const STEP = 1 / 30;

function advance(state: ZdState, seconds: number) {
  for (let elapsed = 0; elapsed < seconds && !state.over; elapsed += STEP) zdStep(state, STEP);
}

/** 一局没有自然刷怪的空场，用来单独检验某条规则。 */
function arena() {
  const state = createZdState(1);
  state.nextWaveAt = Number.POSITIVE_INFINITY;
  state.energy = 9999;
  return state;
}

function addZombie(state: ZdState, kind: ZdZombieKind, lane: number, y: number) {
  const hp = ZD_ZOMBIES[kind].hp;
  const zombie = { id: state.nextId++, kind, lane, y, hp, maxHp: hp, slow: 0, biting: false, hurt: 0 };
  state.zombies.push(zombie);
  return zombie;
}

test("五路七格的药圃和五种药材", () => {
  assert.equal(ZD_RULES.lanes, 5);
  assert.equal(ZD_RULES.rows, 7);
  assert.deepEqual([...ZD_UNIT_ORDER], ["mortar", "capsule", "mint", "cabinet", "fizz"]);
  for (const kind of ZD_UNIT_ORDER) {
    assert.equal(ZD_UNITS[kind].kind, kind);
    assert.ok(ZD_UNITS[kind].cost > 0 && ZD_UNITS[kind].hp > 0 && ZD_UNITS[kind].cooldown > 0, kind);
  }
  // 开局的药力够种下第一株研钵和第一名射手。
  assert.ok(ZD_RULES.startEnergy >= ZD_UNITS.mortar.cost + ZD_UNITS.capsule.cost);
});

test("种植要有空格、药力和冷却，铲子可以腾出格子", () => {
  const state = createZdState(7);
  assert.equal(zdPlaceBlocker(state, "capsule", 5, 0), "这里不能种");
  assert.equal(zdPlaceBlocker(state, "fizz", 0, 0), "还在冷却");
  assert.equal(zdPlace(state, "capsule", 2, 6), true);
  assert.equal(state.energy, ZD_RULES.startEnergy - ZD_UNITS.capsule.cost);
  assert.equal(zdCooldownRatio(state, "capsule"), 1);
  assert.equal(zdPlaceBlocker(state, "mortar", 2, 6), "这一格已经有药材");
  assert.equal(zdPlaceBlocker(state, "capsule", 1, 6), "还在冷却");
  assert.equal(zdPlace(state, "mortar", 1, 6), true);
  assert.equal(zdPlaceBlocker(state, "cabinet", 0, 6), "药力不够");
  assert.equal(zdPlace(state, "cabinet", 0, 6), false);
  assert.equal(zdRemove(state, 2, 6), true);
  assert.equal(zdUnitAt(state, 2, 6), null);
  assert.equal(zdRemove(state, 2, 6), false);
});

test("药力会自己涨，研钵磨出更多", () => {
  const idle = createZdState(3);
  idle.nextWaveAt = Number.POSITIVE_INFINITY;
  advance(idle, ZD_RULES.passiveSeconds * 2 + 0.2);
  assert.equal(idle.energy, ZD_RULES.startEnergy + ZD_RULES.passiveEnergy * 2);

  const farm = arena();
  zdPlace(farm, "mortar", 0, 6);
  const before = farm.energy;
  advance(farm, ZD_UNITS.mortar.interval * 2.7);
  const passive = Math.floor((ZD_UNITS.mortar.interval * 2.7) / ZD_RULES.passiveSeconds) * ZD_RULES.passiveEnergy;
  assert.equal(farm.energy - before - passive, ZD_RULES.passiveEnergy * 3);
});

test("射手只打自己前方的僵尸，击退后按僵尸种类计分", () => {
  const state = arena();
  zdPlace(state, "capsule", 2, 5);
  const ahead = addZombie(state, "walker", 2, 1);
  // 已经走到射手身后的僵尸，射手够不着。
  const behind = addZombie(state, "walker", 2, 6);
  const otherLane = addZombie(state, "walker", 3, 1);
  advance(state, 3);
  assert.ok(ahead.hp < ahead.maxHp);
  assert.equal(behind.hp, behind.maxHp);
  assert.equal(otherLane.hp, otherLane.maxHp);
  state.zombies = state.zombies.filter((zombie) => zombie === ahead);
  advance(state, 14);
  assert.equal(state.zombies.length, 0);
  assert.equal(state.kills, 1);
  assert.equal(state.score, zdZombiePoints("walker"));
  assert.deepEqual(
    (["walker", "runner", "beaker", "giant"] as ZdZombieKind[]).map(zdZombiePoints),
    [10, 15, 25, 60],
  );
});

test("没有目标时射手不开火", () => {
  const state = arena();
  zdPlace(state, "capsule", 0, 6);
  zdPlace(state, "mint", 1, 6);
  advance(state, 5);
  assert.equal(state.shots.length, 0);
});

test("薄荷射手让僵尸减速", () => {
  const plain = arena();
  const slowed = arena();
  const free = addZombie(plain, "beaker", 0, 0);
  const chilled = addZombie(slowed, "beaker", 0, 0);
  zdPlace(slowed, "mint", 0, 6);
  advance(plain, 6);
  advance(slowed, 6);
  assert.ok(chilled.slow > 0);
  assert.ok(chilled.y < free.y - 0.3, `${chilled.y} < ${free.y}`);
});

test("药柜挡住僵尸并被慢慢啃掉，僵尸不会穿过去", () => {
  const state = arena();
  zdPlace(state, "cabinet", 0, 3);
  const zombie = addZombie(state, "walker", 0, 2);
  advance(state, 8);
  const cabinet = zdUnitAt(state, 0, 3)!;
  assert.equal(zombie.biting, true);
  assert.ok(zombie.y < 3);
  assert.ok(cabinet.hp < cabinet.maxHp);
  advance(state, ZD_UNITS.cabinet.hp / ZD_ZOMBIES.walker.bite + 2);
  assert.equal(zdUnitAt(state, 0, 3), null);
  assert.ok(zombie.y > 3);
});

test("泡腾片炸开周围一圈，够不着的僵尸不受影响", () => {
  const state = arena();
  state.cooldowns.fizz = 0;
  const near = addZombie(state, "walker", 1, 2.6);
  const side = addZombie(state, "runner", 2, 3.4);
  const farLane = addZombie(state, "walker", 4, 3);
  const farRow = addZombie(state, "walker", 2, 0.2);
  for (const zombie of state.zombies) zombie.slow = 99;
  zdPlace(state, "fizz", 2, 3);
  advance(state, ZD_UNITS.fizz.interval + 0.1);
  assert.equal(zdUnitAt(state, 2, 3), null);
  assert.ok(!state.zombies.includes(near) && !state.zombies.includes(side));
  assert.equal(farLane.hp, farLane.maxHp);
  assert.equal(farRow.hp, farRow.maxHp);
  assert.equal(state.score, zdZombiePoints("walker") + zdZombiePoints("runner"));
});

test("点已种下的药材可以升级，最高三级，泡腾片不能升", () => {
  const state = arena();
  assert.equal(zdUpgradeBlocker(state, 0, 0), "这一格没有药材");
  zdPlace(state, "capsule", 0, 6);
  const unit = zdUnitAt(state, 0, 6)!;
  assert.equal(unit.level, 1);
  assert.deepEqual(zdNextUpgrade(unit), ZD_UPGRADES.capsule[0]);
  state.energy = ZD_UPGRADES.capsule[0].cost - 1;
  assert.equal(zdUpgradeBlocker(state, 0, 6), "药力不够");
  assert.equal(zdUpgrade(state, 0, 6), false);
  state.energy = 1000;
  assert.equal(zdUpgrade(state, 0, 6), true);
  assert.equal(unit.level, 2);
  assert.equal(state.energy, 1000 - ZD_UPGRADES.capsule[0].cost);
  assert.equal(unit.maxHp, zdUnitStats("capsule", 2).hp);
  // 升级不占种植冷却，可以连着升。
  assert.equal(zdUpgrade(state, 0, 6), true);
  assert.equal(unit.level, ZD_MAX_LEVEL);
  assert.equal(zdNextUpgrade(unit), null);
  assert.equal(zdUpgradeBlocker(state, 0, 6), "已经满级");
  assert.ok(state.events.includes("upgrade"));

  state.cooldowns.fizz = 0;
  zdPlace(state, "fizz", 1, 6);
  assert.equal(zdUpgradeBlocker(state, 1, 6), "泡腾片不能升级");
  for (const kind of ZD_UNIT_ORDER) {
    assert.equal(ZD_UPGRADES[kind].length, kind === "fizz" ? 0 : ZD_MAX_LEVEL - 1, kind);
    for (const upgrade of ZD_UPGRADES[kind]) assert.ok(upgrade.cost > 0 && upgrade.summary.length > 0, kind);
  }
});

test("升级后的胶囊射手连发，击退同一只僵尸明显更快", () => {
  const killTime = (level: number) => {
    const state = arena();
    zdPlace(state, "capsule", 0, 6);
    for (let index = 1; index < level; index += 1) zdUpgrade(state, 0, 6);
    addZombie(state, "walker", 0, 0);
    const start = state.time;
    while (state.zombies.length && !state.over) zdStep(state, STEP);
    assert.equal(state.over, false);
    return state.time - start;
  };
  const [one, two, three] = [1, 2, 3].map(killTime);
  assert.ok(two < one * 0.6, `${two} < ${one}`);
  assert.ok(three < one * 0.4, `${three} < ${one}`);
  assert.deepEqual([1, 2, 3].map((level) => zdUnitStats("capsule", level).shots), [1, 2, 3]);
});

test("研钵升级增产，药柜升级加厚、修好，三级会扎伤啃它的僵尸", () => {
  const farm = arena();
  zdPlace(farm, "mortar", 0, 6);
  zdUpgrade(farm, 0, 6);
  zdUpgrade(farm, 0, 6);
  const before = farm.energy;
  advance(farm, ZD_UNITS.mortar.interval * 0.6);
  assert.equal(farm.energy - before, zdUnitStats("mortar", 3).energy);
  assert.ok(zdUnitStats("mortar", 3).energy > zdUnitStats("mortar", 2).energy && zdUnitStats("mortar", 2).energy > ZD_RULES.passiveEnergy);

  const wall = arena();
  zdPlace(wall, "cabinet", 0, 3);
  const zombie = addZombie(wall, "giant", 0, 2.6);
  advance(wall, 3);
  const cabinet = zdUnitAt(wall, 0, 3)!;
  assert.ok(cabinet.hp < cabinet.maxHp);
  const untouched = zombie.hp;
  assert.equal(untouched, zombie.maxHp);
  zdUpgrade(wall, 0, 3);
  assert.equal(cabinet.hp, zdUnitStats("cabinet", 2).hp);
  zdUpgrade(wall, 0, 3);
  assert.equal(cabinet.maxHp, zdUnitStats("cabinet", 3).hp);
  advance(wall, 2);
  assert.ok(zombie.hp < untouched, "三级药柜反伤");
});

test("三级薄荷射手命中时波及旁边的僵尸", () => {
  const state = arena();
  zdPlace(state, "mint", 2, 6);
  zdUpgrade(state, 2, 6);
  zdUpgrade(state, 2, 6);
  const target = addZombie(state, "beaker", 2, 3);
  const neighbour = addZombie(state, "beaker", 3, 3.2);
  const far = addZombie(state, "beaker", 4, 3);
  for (const zombie of state.zombies) zombie.slow = 0;
  advance(state, 2.5);
  assert.ok(target.hp < target.maxHp && target.slow > 0);
  assert.ok(neighbour.hp < neighbour.maxHp && neighbour.slow > 0);
  assert.equal(far.hp, far.maxHp);
  assert.equal(far.slow, 0);
});

test("只要一只僵尸走出药圃，对局立即结束，之后不再推进", () => {
  const state = arena();
  addZombie(state, "walker", 3, ZD_RULES.rows - 0.05);
  advance(state, 1);
  assert.equal(state.over, true);
  assert.ok(state.events.includes("lost"));
  const time = state.time;
  zdStep(state, 1);
  assert.equal(state.time, time);
  assert.equal(zdPlace(state, "capsule", 0, 0), false);
});

test("波次按固定时间表开始，同一个种子得到同一局", () => {
  assert.equal(zdWaveStartSeconds(1), ZD_RULES.firstWaveAt);
  assert.equal(zdWaveStartSeconds(4), ZD_RULES.firstWaveAt + 3 * ZD_RULES.waveSeconds);
  const first = createZdState(20261012);
  const second = createZdState(20261012);
  const other = createZdState(99);
  for (const state of [first, second, other]) {
    state.energy = 99999;
    for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
      for (const kind of ZD_UNIT_ORDER) state.cooldowns[kind] = 0;
      zdPlace(state, "cabinet", lane, 6);
    }
    advance(state, zdWaveStartSeconds(3) + 1);
  }
  assert.equal(first.wave, 3);
  const lineup = (state: ZdState) => state.zombies.map((zombie) => `${zombie.kind}${zombie.lane}`).join(",");
  assert.equal(lineup(first), lineup(second));
  assert.notEqual(lineup(first), lineup(other));
});

test("每波的僵尸不超过预算，血量逐波上涨，每五波来一大波", () => {
  for (let wave = 1; wave < 30; wave += 1) {
    if ((wave + 1) % ZD_RULES.bigWaveEvery !== 0 && wave % ZD_RULES.bigWaveEvery !== 0) {
      assert.ok(zdWaveBudget(wave + 1) > zdWaveBudget(wave), `第 ${wave + 1} 波`);
    }
    assert.ok(zdWaveHpScale(wave + 1) > zdWaveHpScale(wave));
  }
  assert.ok(zdWaveBudget(5) > zdWaveBudget(6));
  assert.equal(zdWaveHpScale(1), 1);
  // 后期血量按比例连涨，涨幅比前期大得多。
  assert.ok(zdWaveHpScale(20) / zdWaveHpScale(19) > zdWaveHpScale(8) / zdWaveHpScale(7) + 0.05);

  const state = createZdState(5);
  const seen = new Map<number, number>();
  const record = (wave: number, kind: ZdZombieKind) => {
    seen.set(wave, (seen.get(wave) ?? 0) + ZD_ZOMBIES[kind].cost);
    assert.ok(ZD_ZOMBIES[kind].fromWave <= wave, `${kind} 出现在第 ${wave} 波`);
  };
  while (state.wave < 12) {
    zdStep(state, STEP);
    // 每一步都把排队和刚进场的僵尸清走并记账；刚进场的一定属于当前这一波。
    for (const spawn of state.spawns) record(spawn.wave, spawn.kind);
    for (const zombie of state.zombies) record(state.wave, zombie.kind);
    state.spawns = [];
    state.zombies = [];
  }
  for (const [wave, cost] of seen) {
    assert.ok(cost <= zdWaveBudget(wave) + 1e-9, `第 ${wave} 波`);
    assert.ok(cost > zdWaveBudget(wave) - 1, `第 ${wave} 波没有留空`);
  }
});

test("什么都不种撑不过一分钟，摆满射手且药力无限、全部升满也终究守不住", () => {
  const idle = createZdState(11);
  advance(idle, 120);
  assert.equal(idle.over, true);
  assert.ok(idle.time > 40 && idle.time < 65, String(idle.time));
  assert.equal(idle.score, 0);

  const full = createZdState(11);
  while (!full.over && full.time < 20 * 60) {
    full.energy = 99999;
    for (const kind of ZD_UNIT_ORDER) full.cooldowns[kind] = 0;
    for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
      for (let row = 0; row < ZD_RULES.rows; row += 1) zdPlace(full, row === 0 ? "cabinet" : row === 3 ? "mint" : "capsule", lane, row);
    }
    zdStep(full, STEP);
    full.events.length = 0;
  }
  assert.equal(full.over, true);
  assert.ok(full.wave >= 15 && full.wave <= 32, String(full.wave));

  // 同样的作弊条件再把每一株都升满：撑得更久，但仍然会输。
  const maxed = createZdState(11);
  while (!maxed.over && maxed.time < 30 * 60) {
    maxed.energy = 999999;
    for (const kind of ZD_UNIT_ORDER) maxed.cooldowns[kind] = 0;
    for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
      for (let row = 0; row < ZD_RULES.rows; row += 1) {
        zdPlace(maxed, row === 0 ? "cabinet" : row === 3 ? "mint" : "capsule", lane, row);
        while (zdUpgrade(maxed, lane, row));
      }
    }
    zdStep(maxed, STEP);
    maxed.events.length = 0;
  }
  assert.equal(maxed.over, true);
  assert.ok(maxed.wave > full.wave && maxed.wave <= 60, String(maxed.wave));
});

test("服务端的波次时间表和分数上限与页面引擎一致", () => {
  assert.equal(ZOMBIE_DEFENSE_FIRST_WAVE_MS, ZD_RULES.firstWaveAt * 1000);
  assert.equal(ZOMBIE_DEFENSE_WAVE_MS, ZD_RULES.waveSeconds * 1000);
  for (let wave = 0; wave <= 60; wave += 1) {
    assert.equal(maxZombieDefenseScoreThroughWave(wave), zdMaxScoreThroughWave(wave), `第 ${wave} 波`);
    if (wave > 0) assert.equal(minimumDurationForZombieWaves(wave), zdWaveStartSeconds(wave) * 1000);
  }
  assert.equal(ZOMBIE_DEFENSE_MAX_WAVES, 135);
  assert.equal(ZOMBIE_DEFENSE_MAX_SCORE, maxZombieDefenseScoreThroughWave(135));

  // 一整局打下来，分数始终不超过当时波次的上限。
  const state = createZdState(42);
  while (!state.over && state.time < 10 * 60) {
    state.energy = 99999;
    for (const kind of ZD_UNIT_ORDER) state.cooldowns[kind] = 0;
    for (let lane = 0; lane < ZD_RULES.lanes; lane += 1) {
      for (let row = 1; row < ZD_RULES.rows; row += 1) zdPlace(state, "capsule", lane, row);
    }
    zdStep(state, STEP);
    assert.ok(state.score <= zdMaxScoreThroughWave(state.wave));
    assert.ok(state.time >= zdWaveStartSeconds(state.wave) || state.wave === 0);
  }
  assert.ok(state.score > 500);
});

test("正常对局成绩通过服务端校验", () => {
  assert.equal(validateZombieDefenseResult({ score: 0, waves: 2, durationMs: 52_000, serverElapsedMs: 53_000 }), null);
  assert.equal(validateZombieDefenseResult({ score: 0, waves: 0, durationMs: 4_000, serverElapsedMs: 4_500 }), null);
  assert.equal(validateZombieDefenseResult({ score: 1_500, waves: 11, durationMs: 215_000, serverElapsedMs: 240_000 }), null);
  assert.equal(validateZombieDefenseResult({
    score: maxZombieDefenseScoreThroughWave(9),
    waves: 9,
    durationMs: minimumDurationForZombieWaves(9),
    serverElapsedMs: minimumDurationForZombieWaves(9),
  }), null);
});

test("对不上波次的分数、伪造的时长会被拒绝", () => {
  assert.match(validateZombieDefenseResult({ score: 900, waves: 4, durationMs: 80_000, serverElapsedMs: 81_000 }) || "", /分数与波次不匹配/);
  assert.match(validateZombieDefenseResult({ score: 10, waves: 0, durationMs: 9_000, serverElapsedMs: 9_500 }) || "", /分数与波次不匹配/);
  assert.match(validateZombieDefenseResult({ score: 1_500, waves: 11, durationMs: 60_000, serverElapsedMs: 61_000 }) || "", /时长不匹配/);
  assert.match(validateZombieDefenseResult({ score: 100, waves: 5, durationMs: 200_000, serverElapsedMs: 30_000 }) || "", /时长不匹配/);
  assert.match(validateZombieDefenseResult({ score: 100, waves: 3, durationMs: 90_000, serverElapsedMs: 60_000 }) || "", /客户端/);
  assert.match(validateZombieDefenseResult({ score: ZOMBIE_DEFENSE_MAX_SCORE + 1, waves: 135, durationMs: 300_000, serverElapsedMs: 300_000 }) || "", /范围/);
  assert.match(validateZombieDefenseResult({ score: 0, waves: 136, durationMs: 300_000, serverElapsedMs: 300_000 }) || "", /范围/);
  assert.match(validateZombieDefenseResult({ score: 0, waves: 1, durationMs: 12_000, serverElapsedMs: 46 * 60 * 1000 }) || "", /过期/);
});

test("云端成就覆盖局数、单局分数、单局波次与累计", () => {
  const codes = earnedZombieDefenseAchievementCodes({ games: 20, bestScore: 1_200, totalScore: 9_000, bestWaves: 9, totalWaves: 40 });
  for (const code of ["first_game", "waves_9", "score_1000", "games_20", "total_waves_30"]) assert.ok(codes.includes(code), code);
  for (const code of ["waves_12", "score_2000", "games_50", "total_waves_150", "total_score_10000"]) assert.ok(!codes.includes(code), code);
  assert.deepEqual(earnedZombieDefenseAchievementCodes({ games: 0, bestScore: 0, totalScore: 0, bestWaves: 0, totalWaves: 0 }), []);
  assert.equal(ZOMBIE_DEFENSE_ACHIEVEMENTS.length, 14);
  assert.equal(new Set(ZOMBIE_DEFENSE_ACHIEVEMENTS.map((item) => item.code)).size, 14);
  // 每一档成就都在分数和波次的可提交范围内。
  for (const item of ZOMBIE_DEFENSE_ACHIEVEMENTS) {
    if (item.metric === "bestWaves") assert.ok(item.target <= ZOMBIE_DEFENSE_MAX_WAVES);
    if (item.metric === "bestScore") assert.ok(item.target <= maxZombieDefenseScoreThroughWave(12));
  }
});

test("云端对局接口挂在小游戏自己的路径下，账号注销时一并清理，游戏页受小游戏隐藏规则约束", () => {
  const routes = readFileSync(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../src/services/accountDeletion.ts", import.meta.url), "utf8");
  const router = readFileSync(new URL("../../web/src/router/index.ts", import.meta.url), "utf8");
  assert.match(routes, /router\.use\("\/tools\/zombie-defense", zombieDefenseRouter\);[\s\S]*router\.use\("\/tools", toolsRouter\);/u);
  assert.match(deletion, /\["zombieDefenseAttempt", "userId"\], \["zombieDefenseAchievement", "userId"\]/u);
  const route = router.split("\n").find((line) => line.includes('name: "service-zombie-defense"')) || "";
  assert.match(route, /path: "services\/tools\/yaoda-can-fly\/zombie-defense"/u);
  assert.match(route, /nativeChrome: "page"/u);
  assert.match(route, /miniGame: true/u);
});
