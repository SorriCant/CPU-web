import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  earnedTomatoNoodleAchievementCodes,
  minimumDurationForNoodleScore,
  validateTomatoNoodleResult,
  TOMATO_NOODLE_ACHIEVEMENTS,
  TOMATO_NOODLE_MAX_BOWL_POINTS,
  TOMATO_NOODLE_MAX_SCORE,
  TOMATO_NOODLE_MAX_UNSERVED_POINTS,
  TOMATO_NOODLE_MIN_BOWL_POINTS,
  TOMATO_NOODLE_MIN_MS_PER_POINT,
} from "../src/services/tomatoNoodlePolicy";
import {
  noodleBowlBonus,
  noodleBowlRating,
  noodleFillSeconds,
  noodleGaugePosition,
  noodleGrade,
  noodleGradePoints,
  noodleSweepSeconds,
  noodleTargetCenter,
  noodleZones,
  TOMATO_NOODLE_MAX_BOWL_POINTS as CLIENT_MAX_BOWL_POINTS,
  TOMATO_NOODLE_MIN_BOWL_MS,
  TOMATO_NOODLE_RULES,
  TOMATO_NOODLE_STEPS,
  TOMATO_NOODLE_STEPS_PER_BOWL,
  type NoodleGrade,
} from "../../web/src/views/services/games/tomatoNoodleRules";

const step = (id: string) => TOMATO_NOODLE_STEPS.find((item) => item.id === id)!;

test("番茄鸡蛋面按固定六道工序做完一碗", () => {
  assert.deepEqual(
    TOMATO_NOODLE_STEPS.map((item) => item.id),
    ["cut", "egg", "scramble", "tomato", "boil", "season"],
  );
  assert.equal(TOMATO_NOODLE_STEPS_PER_BOWL, 6);
  for (const item of TOMATO_NOODLE_STEPS) {
    assert.ok(item.targetMin < item.targetMax, item.id);
    // 工序一开始指针在 0，目标区的最外沿必须离开起点，否则进场就点也能得分。
    assert.ok(item.targetMin - TOMATO_NOODLE_RULES.okHalf > 0.05, item.id);
    assert.ok(item.targetMax + TOMATO_NOODLE_RULES.okHalf < 1, item.id);
  }
});

test("往复条来回摆动并在走满来回后判定超时", () => {
  const cut = step("cut");
  const pass = noodleSweepSeconds(0);
  assert.equal(pass, 1.25);
  assert.deepEqual(noodleGaugePosition(cut, 0, 0), { position: 0, expired: false });
  assert.equal(noodleGaugePosition(cut, 0, pass / 2).position, 0.5);
  assert.equal(noodleGaugePosition(cut, 0, pass).position, 1);
  assert.equal(noodleGaugePosition(cut, 0, pass * 1.5).position, 0.5);
  assert.equal(noodleGaugePosition(cut, 0, pass * 3.9).expired, false);
  assert.equal(noodleGaugePosition(cut, 0, pass * 4).expired, true);
});

test("火候条只走一遍、越烧越快，烧到头即失误", () => {
  const boil = step("boil");
  const total = noodleFillSeconds(0);
  assert.equal(total, 2.3);
  assert.equal(noodleGaugePosition(boil, 0, 0).position, 0);
  // 走到一半时间时指针还不到三成，后半程明显更急。
  const half = noodleGaugePosition(boil, 0, total / 2).position;
  assert.ok(Math.abs(half - 0.5 ** TOMATO_NOODLE_RULES.fillCurve) < 1e-9);
  assert.ok(half < 0.3);
  const speed = (seconds: number) => (noodleGaugePosition(boil, 0, seconds + 0.01).position - noodleGaugePosition(boil, 0, seconds).position) / 0.01;
  assert.ok(speed(total * 0.8) > speed(total * 0.3) * 2);
  assert.deepEqual(noodleGaugePosition(boil, 0, total), { position: 1, expired: true });
  assert.deepEqual(noodleGaugePosition(boil, 0, total * 2), { position: 1, expired: true });
});

test("开局的判定窗口按指针速度折算在可反应的范围内", () => {
  // 往复条匀速；火候条取指针经过目标区中心时的瞬时速度。
  const zones = noodleZones(0);
  const sweepSpeed = 1 / noodleSweepSeconds(0);
  const windowMs = (half: number, speed: number) => Math.round((half * 2 / speed) * 1000);
  assert.equal(windowMs(zones.perfect, sweepSpeed), 100);
  assert.equal(windowMs(zones.good, sweepSpeed), 225);
  assert.equal(windowMs(zones.ok, sweepSpeed), 375);
  const boil = step("boil");
  const center = (boil.targetMin + boil.targetMax) / 2;
  const at = center ** (1 / TOMATO_NOODLE_RULES.fillCurve) * noodleFillSeconds(0);
  const fillSpeed = (noodleGaugePosition(boil, 0, at + 0.001).position - noodleGaugePosition(boil, 0, at - 0.001).position) / 0.002;
  assert.ok(windowMs(zones.perfect, fillSpeed) > 90 && windowMs(zones.perfect, fillSpeed) < 140);
  assert.ok(windowMs(zones.ok, fillSpeed) > 350 && windowMs(zones.ok, fillSpeed) < 500);
  // 第七碗起，往复条的“还行”窗口已经压到 0.15 秒以内。
  assert.ok(windowMs(noodleZones(6).ok, 1 / noodleSweepSeconds(6)) < 150);
});

test("出餐越多节奏越快、判定越窄，并且有下限", () => {
  assert.ok(noodleSweepSeconds(5) < noodleSweepSeconds(0));
  assert.ok(noodleFillSeconds(5) < noodleFillSeconds(0));
  assert.ok(noodleZones(5).perfect < noodleZones(0).perfect);
  assert.equal(noodleSweepSeconds(200), TOMATO_NOODLE_RULES.sweepSecondsMin);
  assert.equal(noodleFillSeconds(200), TOMATO_NOODLE_RULES.fillSecondsMin);
  assert.deepEqual(noodleZones(200), {
    perfect: TOMATO_NOODLE_RULES.perfectHalfMin,
    good: TOMATO_NOODLE_RULES.goodHalfMin,
    ok: TOMATO_NOODLE_RULES.okHalfMin,
  });
});

test("按离目标的距离分四档判定并计分", () => {
  assert.equal(noodleGrade(0.5, 0.5, 0), "perfect");
  assert.equal(noodleGrade(0.53, 0.5, 0), "perfect");
  assert.equal(noodleGrade(0.54, 0.5, 0), "good");
  assert.equal(noodleGrade(0.57, 0.5, 0), "good");
  assert.equal(noodleGrade(0.38, 0.5, 0), "ok");
  assert.equal(noodleGrade(0.66, 0.5, 0), "miss");
  assert.deepEqual(
    (["perfect", "good", "ok", "miss"] as NoodleGrade[]).map(noodleGradePoints),
    [3, 2, 1, 0],
  );
  assert.equal(noodleTargetCenter(step("cut"), 0), 0.28);
  assert.equal(noodleTargetCenter(step("cut"), 1), 0.72);
  assert.equal(noodleTargetCenter(step("cut"), 7), 0.72);
});

test("整碗没有失误才有出锅加分，全程完美加分最高", () => {
  const perfect = Array<NoodleGrade>(6).fill("perfect");
  assert.equal(noodleBowlBonus(perfect), 5);
  assert.equal(noodleBowlBonus([...perfect.slice(0, 5), "ok"]), 2);
  assert.equal(noodleBowlBonus([...perfect.slice(0, 5), "miss"]), 0);
  assert.equal(noodleBowlBonus(perfect.slice(0, 5)), 0);
  assert.equal(noodleBowlRating(23).stars, 3);
  // 三道完美、三道不错的零失误一碗也算三星。
  assert.equal(noodleBowlRating(17).stars, 3);
  assert.equal(noodleBowlRating(16).stars, 2);
  assert.equal(noodleBowlRating(10).stars, 2);
  assert.equal(noodleBowlRating(9).stars, 1);
});

test("服务端的分数上限与页面的计分规则一致", () => {
  assert.equal(CLIENT_MAX_BOWL_POINTS, TOMATO_NOODLE_MAX_BOWL_POINTS);
  assert.equal(
    (TOMATO_NOODLE_STEPS_PER_BOWL - 1) * TOMATO_NOODLE_RULES.perfectPoints,
    TOMATO_NOODLE_MAX_UNSERVED_POINTS,
  );
  // 三次失误结束对局，所以做完的一碗里最多两次失误。
  assert.equal(
    (TOMATO_NOODLE_STEPS_PER_BOWL - (TOMATO_NOODLE_RULES.hearts - 1)) * TOMATO_NOODLE_RULES.okPoints,
    TOMATO_NOODLE_MIN_BOWL_POINTS,
  );
  // 页面上最快的满分碗，也比服务端要求的最低用时慢。
  assert.equal(TOMATO_NOODLE_MIN_BOWL_MS, 7_500);
  assert.ok(TOMATO_NOODLE_MIN_BOWL_MS / CLIENT_MAX_BOWL_POINTS > TOMATO_NOODLE_MIN_MS_PER_POINT);
});

test("正常对局成绩通过服务端校验", () => {
  assert.equal(validateTomatoNoodleResult({ score: 0, bowls: 0, durationMs: 9_000, serverElapsedMs: 9_400 }), null);
  assert.equal(validateTomatoNoodleResult({ score: 23, bowls: 1, durationMs: 7_500, serverElapsedMs: 8_000 }), null);
  assert.equal(validateTomatoNoodleResult({ score: 96, bowls: 6, durationMs: 95_000, serverElapsedMs: 97_000 }), null);
  assert.equal(TOMATO_NOODLE_MAX_SCORE, 10_800);
  assert.equal(minimumDurationForNoodleScore(40), 10_000);
});

test("异常高分、伪造时长和对不上的碗数会被拒绝", () => {
  assert.match(validateTomatoNoodleResult({ score: 120, bowls: 6, durationMs: 9_000, serverElapsedMs: 9_500 }) || "", /时长不匹配/);
  assert.match(validateTomatoNoodleResult({ score: 60, bowls: 1, durationMs: 60_000, serverElapsedMs: 61_000 }) || "", /碗数不匹配/);
  assert.match(validateTomatoNoodleResult({ score: 10, bowls: 4, durationMs: 60_000, serverElapsedMs: 61_000 }) || "", /碗数不匹配/);
  assert.match(validateTomatoNoodleResult({ score: TOMATO_NOODLE_MAX_SCORE + 1, bowls: 600, durationMs: 300_000, serverElapsedMs: 300_000 }) || "", /范围/);
  assert.match(validateTomatoNoodleResult({ score: 3, bowls: 0, durationMs: 30_000, serverElapsedMs: 4_000 }) || "", /客户端/);
  assert.match(validateTomatoNoodleResult({ score: 3, bowls: 0, durationMs: 4_000, serverElapsedMs: 46 * 60 * 1000 }) || "", /过期/);
});

test("云端成就覆盖局数、单局分数、单局碗数与累计", () => {
  const codes = earnedTomatoNoodleAchievementCodes({ games: 20, bestScore: 130, totalScore: 900, bestBowls: 7, totalBowls: 40 });
  for (const code of ["first_game", "bowls_6", "score_120", "games_20", "total_bowls_20"]) assert.ok(codes.includes(code), code);
  for (const code of ["bowls_10", "score_220", "games_50", "total_bowls_100", "total_score_1000"]) assert.ok(!codes.includes(code), code);
  assert.deepEqual(earnedTomatoNoodleAchievementCodes({ games: 0, bestScore: 0, totalScore: 0, bestBowls: 0, totalBowls: 0 }), []);
  assert.equal(TOMATO_NOODLE_ACHIEVEMENTS.length, 14);
  assert.equal(new Set(TOMATO_NOODLE_ACHIEVEMENTS.map((item) => item.code)).size, 14);
});

test("云端对局接口挂在小游戏自己的路径下，账号注销时一并清理", () => {
  const routes = readFileSync(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  const deletion = readFileSync(new URL("../src/services/accountDeletion.ts", import.meta.url), "utf8");
  assert.match(routes, /router\.use\("\/tools\/tomato-egg-noodles", tomatoNoodleRouter\);[\s\S]*router\.use\("\/tools", toolsRouter\);/u);
  assert.match(deletion, /\["tomatoNoodleAttempt", "userId"\], \["tomatoNoodleAchievement", "userId"\]/u);
});
