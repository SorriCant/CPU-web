<template>
  <main class="flight-shell noodle-shell">
    <section ref="phoneEl" class="game-phone">
      <canvas
        v-show="screen === 'game'"
        ref="canvasEl"
        class="game-canvas"
        role="img"
        aria-label="番茄鸡蛋面游戏区域"
        tabindex="0"
        @pointerdown="handleCanvasPointer"
      ></canvas>

      <section v-if="screen === 'menu'" class="menu-screen">
        <button data-cpu-button="surface" type="button" class="corner-back" aria-label="返回小游戏" @click="router.push(MINI_GAMES_PATH)">←</button>
        <canvas ref="menuArtEl" class="menu-emblem" width="248" height="248" role="img" aria-label="一碗番茄鸡蛋面"></canvas>
        <h1>番茄鸡蛋面</h1>
        <p class="menu-tagline">🍅 看准火候 · 一碗好面 · 人间烟火</p>
        <div class="best-score-box">
          <span>最高分</span>
          <strong>{{ displayBest }}</strong>
        </div>
        <div class="menu-actions">
          <button data-cpu-button="surface" type="button" class="game-button game-button--start" @click="startGame">开始做面</button>
          <button data-cpu-button="surface" type="button" class="game-button game-button--achievement" @click="openScreen('achievements')">🏆 成就</button>
          <button data-cpu-button="surface" type="button" class="game-button game-button--ranking" @click="openScreen('ranking')">📊 全校排行</button>
          <button data-cpu-button="surface" type="button" class="game-button game-button--secondary" @click="openScreen('history')">📜 历史战绩</button>
          <button data-cpu-button="surface" type="button" class="game-button game-button--secondary" @click="openScreen('settings')">⚙ 设置</button>
        </div>
        <p class="menu-footnote">{{ isLoggedIn ? "云端排行与成就已开启" : "本机记录 · 登录后同步云端" }}</p>
      </section>

      <section v-else-if="screen === 'game'" class="game-layer">
        <div class="score-board">
          <span>得分</span>
          <strong>{{ score }}</strong>
          <small>最高 {{ displayBest }}</small>
        </div>
        <div class="noodle-status" :aria-label="`剩余 ${hearts} 次失误机会，已出餐 ${bowls} 碗`">
          <span class="noodle-hearts" aria-hidden="true">
            <i v-for="index in NOODLE_RULES.hearts" :key="index" :class="{ lost: index > hearts }">♥</i>
          </span>
          <b aria-hidden="true">🍜 × {{ bowls }}</b>
        </div>
        <div class="game-controls">
          <button data-cpu-button="surface"
            v-if="gamePhase === 'playing' || gamePhase === 'paused'"
            type="button"
            :aria-label="gamePhase === 'paused' ? '继续游戏' : '暂停游戏'"
            @click.stop="togglePause"
          >{{ gamePhase === "paused" ? "▶" : "Ⅱ" }}</button>
          <button data-cpu-button="surface" type="button" aria-label="返回主页" @click.stop="returnToMenu">×</button>
        </div>

        <div v-if="gamePhase === 'ready'" class="ready-hint">
          <span class="ready-flight-mark" aria-hidden="true">👆</span>
          <h2>点击屏幕或空格开始备菜</h2>
          <p>指针走进亮区时点一下，越靠近中心分越高</p>
        </div>

        <template v-else>
          <div class="noodle-step">
            <small>第 {{ serving ? bowls : bowls + 1 }} 碗 · {{ serving ? "出锅" : `${stepIndex + 1}/${NOODLE_STEPS.length}` }}</small>
            <b>{{ serving ? "出锅啦" : currentStep.title }}</b>
            <span class="noodle-dots" aria-hidden="true">
              <i v-for="(step, index) in NOODLE_STEPS" :key="step.id" :class="dotClass(index)"></i>
            </span>
          </div>

          <div v-if="feedback" :key="feedback.id" class="noodle-feedback" :class="`is-${feedback.tone}`" role="status">
            <b>{{ feedback.title }}</b>
            <small>{{ feedback.detail }}</small>
          </div>

          <div v-show="!serving" class="noodle-gauge" :class="`is-${currentStep.gauge}`">
            <p><span>{{ currentStep.lowLabel }}</span><b>{{ currentStep.hint }}</b><span>{{ currentStep.highLabel }}</span></p>
            <div class="noodle-track">
              <i v-if="currentStep.gauge === 'fill'" class="noodle-zone noodle-zone--over" :style="{ left: `${(target + zones.ok) * 100}%` }"></i>
              <i class="noodle-zone noodle-zone--ok" :style="zoneStyle(zones.ok)"></i>
              <i class="noodle-zone noodle-zone--good" :style="zoneStyle(zones.good)"></i>
              <i class="noodle-zone noodle-zone--perfect" :style="zoneStyle(zones.perfect)"></i>
              <i ref="pointerEl" class="noodle-pointer"></i>
            </div>
            <small>点击屏幕 / 空格</small>
          </div>
        </template>

        <div v-if="gamePhase === 'paused'" class="modal-shade">
          <div class="game-modal">
            <span class="modal-icon">⏸</span>
            <h2>灶台暂停</h2>
            <p>当前 {{ score }} 分 · 已出餐 {{ bowls }} 碗</p>
            <button data-cpu-button="surface" type="button" class="game-button game-button--start" @click.stop="togglePause">继续做面</button>
            <button data-cpu-button="surface" type="button" class="plain-button" @click.stop="returnToMenu">返回主页</button>
          </div>
        </div>

        <div v-if="gamePhase === 'over'" class="modal-shade">
          <div class="game-modal result-modal">
            <span class="result-label">{{ isNewRecord ? "新纪录！" : resultTitle }}</span>
            <strong class="final-score">{{ score }}</strong>
            <span class="final-unit">分</span>
            <div class="result-stats">
              <span><small>历史最高</small><b>{{ displayBest }}</b></span>
              <span><small>本局出餐</small><b>{{ bowls }} 碗</b></span>
              <span><small>厨艺等级</small><b>{{ chefRank }}</b></span>
            </div>
            <p class="cloud-result" :class="{ success: cloudSubmitState === 'success' }">{{ cloudResultMessage }}</p>
            <div v-if="newlyUnlocked.length" class="new-unlocks">
              <b v-for="item in newlyUnlocked" :key="item.code">{{ item.icon }} {{ item.title }}</b>
            </div>
            <button data-cpu-button="surface" type="button" class="game-button game-button--start" @click.stop="startGame">再来一局</button>
            <button data-cpu-button="surface" type="button" class="plain-button" @click.stop="returnToMenu">返回主页</button>
          </div>
        </div>
      </section>

      <section v-else class="panel-screen">
        <header class="panel-header">
          <h2>{{ panelTitle }}</h2>
          <button data-cpu-button="surface" type="button" @click="returnToMenu">返回主页</button>
        </header>

        <div v-if="screen === 'ranking'" class="panel-scroll ranking-panel">
          <div class="ranking-summary">
            <div><span>全校玩家</span><strong>{{ totalPlayers }}</strong></div>
            <div v-if="cloudMe"><span>我的排名</span><strong>#{{ cloudMe.rank }}</strong></div>
            <button data-cpu-button="surface" type="button" :disabled="leaderboardLoading" @click="loadLeaderboard(true)">
              {{ leaderboardLoading ? "刷新中..." : "刷新榜单" }}
            </button>
          </div>
          <ol v-if="leaderboard.length" class="ranking-list">
            <li v-for="entry in leaderboard" :key="entry.userId" :class="{ me: cloudMe?.userId === entry.userId }">
              <span class="rank-number">{{ entry.rank }}</span>
              <UserAvatar :size="44" :src="entry.avatar" :name="entry.name" :seed="entry.userId" :alt="entry.name + '的头像'" />
              <span class="rank-user">
                <b>{{ entry.name }}</b>
                <small>{{ entry.games }} 局 · {{ entry.achievementCount }} 枚成就 · 累计 {{ entry.totalBowls }} 碗</small>
              </span>
              <strong>{{ entry.bestScore }}</strong>
            </li>
          </ol>
          <div v-else class="empty-panel">{{ leaderboardLoading ? "正在读取云端战绩..." : "还没有云端战绩，等你拿下第一名！" }}</div>
          <button data-cpu-button="surface" v-if="!isLoggedIn" type="button" class="panel-login" @click="goToLogin">登录并加入全校排行</button>
          <p v-if="leaderboardError" class="panel-error">{{ leaderboardError }}</p>
        </div>

        <div v-else-if="screen === 'achievements'" class="panel-scroll achievement-panel">
          <p class="panel-counter">已解锁 <b>{{ unlockedAchievementCount }}/{{ achievements.length }}</b></p>
          <div v-if="achievements.length" class="achievement-list">
            <article v-for="achievement in achievements" :key="achievement.code" :class="{ unlocked: achievement.unlocked }">
              <span class="achievement-icon">{{ achievement.icon }}</span>
              <span class="achievement-copy">
                <b>{{ achievement.title }}</b>
                <small>{{ achievement.description }}</small>
                <i><em :style="{ width: achievementPercent(achievement) + '%' }"></em></i>
              </span>
              <strong>{{ achievement.unlocked ? "已达成" : achievement.progress + "/" + achievement.target }}</strong>
            </article>
          </div>
          <div v-else class="empty-panel">{{ leaderboardLoading ? "正在读取云端成就..." : "成就册暂时没有连接上" }}</div>
          <button data-cpu-button="surface" v-if="!isLoggedIn" type="button" class="panel-login" @click="goToLogin">登录并保存成就进度</button>
        </div>

        <div v-else-if="screen === 'history'" class="panel-scroll">
          <ol v-if="history.length" class="history-list">
            <li v-for="(item, index) in history" :key="item.playedAt + '-' + index">
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
              <b>{{ item.score }} 分</b>
              <small>{{ formatHistoryDate(item.playedAt) }} · {{ item.bowls }} 碗</small>
              <em>{{ noodleChefRank(item.score) }}</em>
            </li>
          </ol>
          <div v-else class="empty-panel">暂无历史战绩，快去做一碗面吧！</div>
        </div>

        <div v-else class="panel-scroll flight-settings-panel">
          <div class="setting-row">
            <span><b>游戏音效</b><small>落刀、起锅与出餐提示音</small></span>
            <button data-cpu-button="surface" type="button" :class="{ active: soundEnabled }" @click="toggleSound">{{ soundEnabled ? "开启" : "关闭" }}</button>
          </div>
          <div class="setting-row">
            <span><b>云端档案</b><small>{{ isLoggedIn ? "排行榜、局数和成就自动保存" : "当前成绩仅保存在这台设备" }}</small></span>
            <button data-cpu-button="surface" v-if="!isLoggedIn" type="button" @click="goToLogin">登录</button>
            <b v-else class="cloud-online">已连接</b>
          </div>
          <p>玩法：每碗面有切番茄、打鸡蛋、炒鸡蛋、炒番茄、煮面条、调味六道工序。指针越靠近亮区中心得分越高，整碗没有失误还有出锅加分；失误三次收摊，全程完美的一碗能补回一次机会。炒和煮的火候条越走越快；出餐越多，整体节奏也越快。</p>
          <p>操作：点击 / 触摸 / 空格 下手，P 暂停，Esc 返回主页。</p>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { getToken } from "@/api/request";
import { useAuthStore } from "@/stores/auth";
import {
  tomatoNoodleApi,
  type TomatoNoodleAchievement,
  type TomatoNoodleLeaderboard,
  type TomatoNoodleRankingEntry,
} from "@/api/tomatoNoodle";
import UserAvatar from "@/components/common/UserAvatar.vue";
import { MINI_GAMES_PATH } from "@/data/miniGames";
import {
  noodleBowlBonus,
  noodleBowlRating,
  noodleChefRank,
  noodleGaugePosition,
  noodleGrade,
  noodleGradePoints,
  noodleTargetCenter,
  noodleZones,
  TOMATO_NOODLE_RULES as NOODLE_RULES,
  TOMATO_NOODLE_STEPS as NOODLE_STEPS,
  type NoodleGrade,
} from "./tomatoNoodleRules";
import { drawNoodleBowl, drawNoodleScene } from "./tomatoNoodleScene";

type Screen = "menu" | "game" | "ranking" | "achievements" | "history" | "settings";
type GamePhase = "ready" | "playing" | "paused" | "over";
type StepPhase = "intro" | "active" | "result" | "serve";
type HistoryItem = { score: number; bowls: number; playedAt: string };
type Feedback = { id: number; tone: NoodleGrade | "serve"; title: string; detail: string };

const router = useRouter();
const auth = useAuthStore();
const phoneEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const menuArtEl = ref<HTMLCanvasElement | null>(null);
const pointerEl = ref<HTMLElement | null>(null);
const screen = ref<Screen>("menu");
const gamePhase = ref<GamePhase>("ready");
const score = ref(0);
const bowls = ref(0);
const hearts = ref<number>(NOODLE_RULES.hearts);
const stepIndex = ref(0);
const stepGrades = ref<NoodleGrade[]>([]);
const target = ref(0.5);
const serving = ref(false);
const feedback = ref<Feedback | null>(null);
const bestScore = ref(0);
const history = ref<HistoryItem[]>([]);
const soundEnabled = ref(true);
const isNewRecord = ref(false);
const leaderboard = ref<TomatoNoodleRankingEntry[]>([]);
const cloudMe = ref<TomatoNoodleRankingEntry | null>(null);
const totalPlayers = ref(0);
const leaderboardLoading = ref(false);
const leaderboardError = ref("");
const achievements = ref<TomatoNoodleAchievement[]>([]);
const newlyUnlocked = ref<TomatoNoodleLeaderboard["newlyUnlocked"]>([]);
const cloudSubmitState = ref<"idle" | "syncing" | "success" | "error" | "guest">("idle");
const cloudSubmitDetail = ref("");

const WORLD_WIDTH = 420;
const STORAGE_PREFIX = "cpu-web:tomato-egg-noodles:v1";
const GRADE_TITLES: Record<NoodleGrade, string> = { perfect: "完美", good: "不错", ok: "还行", miss: "失误" };

let worldHeight = 680;
let stepPhase: StepPhase = "intro";
let phaseSeconds = 0;
let gaugePosition = 0;
let stepGrade: NoodleGrade | null = null;
let bowlStars = 0;
let elapsed = 0;
let lastFrameAt = 0;
let animationFrame = 0;
let feedbackSeq = 0;
let resizeObserver: ResizeObserver | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;
let audioContext: AudioContext | null = null;
let cloudAttemptPromise: Promise<number | null> = Promise.resolve(null);
let cloudSettlementPromise: Promise<void> = Promise.resolve();
let gameGeneration = 0;

const isLoggedIn = computed(() => Boolean(getToken()));
const displayBest = computed(() => Math.max(bestScore.value, cloudMe.value?.bestScore ?? 0));
const currentStep = computed(() => NOODLE_STEPS[stepIndex.value]);
const zones = computed(() => noodleZones(bowls.value));
const chefRank = computed(() => noodleChefRank(score.value));
const resultTitle = computed(() => bowls.value >= 6 ? "生意兴隆" : bowls.value >= 2 ? "渐入佳境" : "再练练手");
const unlockedAchievementCount = computed(() => achievements.value.filter((item) => item.unlocked).length);
const panelTitle = computed(() => {
  if (screen.value === "ranking") return "📊 全校排行";
  if (screen.value === "achievements") return "🏆 成就";
  if (screen.value === "history") return "📜 历史战绩";
  return "⚙ 设置";
});
const cloudResultMessage = computed(() => {
  if (cloudSubmitState.value === "syncing") return "正在校验并同步云端战绩...";
  if (cloudSubmitState.value === "success") return "已计入全校榜" + (cloudMe.value ? " · 当前第 " + cloudMe.value.rank + " 名" : "");
  if (cloudSubmitState.value === "error") return cloudSubmitDetail.value || "本局已保存在本机，云端同步失败";
  if (cloudSubmitState.value === "guest") return "登录后，下一局可加入全校榜并解锁成就";
  return "";
});

onMounted(() => {
  document.documentElement.classList.add("yaoda-flight-open");
  bestScore.value = readNumber(STORAGE_PREFIX + ":best");
  history.value = readHistory();
  soundEnabled.value = readBoolean(STORAGE_PREFIX + ":sound", true);
  window.addEventListener("keydown", handleKeydown);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (phoneEl.value) resizeObserver.observe(phoneEl.value);
  void initializeCloud();
  nextTick(() => {
    resizeCanvas();
    drawMenuArt();
  });
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("yaoda-flight-open");
  if (gamePhase.value === "playing" || gamePhase.value === "paused") {
    cloudSettlementPromise = abandonCloudAttempt(cloudAttemptPromise);
  }
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  window.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  void audioContext?.close();
});

function openScreen(value: Screen) {
  screen.value = value;
  if (value === "ranking" || value === "achievements") void loadLeaderboard(true);
}

function startGame() {
  cancelAnimationFrame(animationFrame);
  screen.value = "game";
  gamePhase.value = "ready";
  score.value = 0;
  bowls.value = 0;
  hearts.value = NOODLE_RULES.hearts;
  stepIndex.value = 0;
  stepGrades.value = [];
  serving.value = false;
  feedback.value = null;
  isNewRecord.value = false;
  newlyUnlocked.value = [];
  cloudSubmitState.value = isLoggedIn.value ? "idle" : "guest";
  cloudSubmitDetail.value = "";
  elapsed = 0;
  stepGrade = null;
  gaugePosition = 0;
  nextTick(() => {
    resizeCanvas();
    canvasEl.value?.focus({ preventScroll: true });
  });
}

function beginCooking() {
  if (gamePhase.value !== "ready") return;
  gameGeneration += 1;
  const generation = gameGeneration;
  gamePhase.value = "playing";
  elapsed = 0;
  beginStep(0);
  cloudAttemptPromise = cloudSettlementPromise.then(() => beginCloudAttempt(generation));
  lastFrameAt = performance.now();
  ensureAudio();
  playTone(540, 0.055, 0.035);
  animationFrame = requestAnimationFrame(gameLoop);
}

function returnToMenu() {
  const shouldAbandon = screen.value === "game" && (gamePhase.value === "playing" || gamePhase.value === "paused");
  const pendingAttempt = cloudAttemptPromise;
  gameGeneration += 1;
  if (shouldAbandon) cloudSettlementPromise = abandonCloudAttempt(pendingAttempt);
  cancelAnimationFrame(animationFrame);
  screen.value = "menu";
  gamePhase.value = "ready";
  nextTick(drawMenuArt);
}

function togglePause() {
  if (gamePhase.value === "playing") {
    gamePhase.value = "paused";
    cancelAnimationFrame(animationFrame);
    drawScene();
  } else if (gamePhase.value === "paused") {
    gamePhase.value = "playing";
    // 暂停时指针停在半路；继续后这道工序重新入场，不能借暂停瞄准。
    if (stepPhase === "active") beginStep(stepIndex.value);
    lastFrameAt = performance.now();
    animationFrame = requestAnimationFrame(gameLoop);
  }
}

function beginStep(index: number) {
  stepIndex.value = index;
  if (index === 0) stepGrades.value = [];
  target.value = noodleTargetCenter(NOODLE_STEPS[index], Math.random());
  serving.value = false;
  stepPhase = "intro";
  phaseSeconds = 0;
  gaugePosition = 0;
  stepGrade = null;
  feedback.value = null;
}

function act() {
  if (gamePhase.value !== "playing" || stepPhase !== "active") return;
  judge(noodleGrade(gaugePosition, target.value, bowls.value));
}

function judge(grade: NoodleGrade) {
  stepGrade = grade;
  stepPhase = "result";
  phaseSeconds = 0;
  stepGrades.value = [...stepGrades.value, grade];
  const points = noodleGradePoints(grade);
  score.value += points;
  if (grade === "miss") hearts.value -= 1;
  showFeedback(grade, grade === "miss" ? GRADE_TITLES.miss : `${GRADE_TITLES[grade]} +${points}`, currentStep.value.feedback[grade]);
  if (grade === "perfect") {
    playTone(880, 0.07, 0.04);
    window.setTimeout(() => playTone(1175, 0.09, 0.035), 70);
  } else if (grade === "good") playTone(740, 0.08, 0.04);
  else if (grade === "ok") playTone(520, 0.08, 0.035);
  else playTone(170, 0.18, 0.06);
}

function advance() {
  if (hearts.value <= 0) {
    finishGame();
    return;
  }
  if (stepIndex.value < NOODLE_STEPS.length - 1) {
    beginStep(stepIndex.value + 1);
    return;
  }
  const grades = stepGrades.value;
  const bonus = noodleBowlBonus(grades);
  const rating = noodleBowlRating(grades.reduce((total, grade) => total + noodleGradePoints(grade), bonus));
  const flawless = bonus === NOODLE_RULES.flawlessBowlBonus;
  score.value += bonus;
  bowls.value += 1;
  bowlStars = rating.stars;
  if (flawless && hearts.value < NOODLE_RULES.hearts) hearts.value += 1;
  serving.value = true;
  stepPhase = "serve";
  phaseSeconds = 0;
  showFeedback(
    "serve",
    `${"★".repeat(rating.stars)} ${rating.title}`,
    flawless ? `全程完美 +${bonus}` : bonus ? `零失误出锅 +${bonus}` : `第 ${bowls.value} 碗出锅`,
  );
  playTone(660, 0.08, 0.04);
  window.setTimeout(() => playTone(880, 0.08, 0.04), 90);
  window.setTimeout(() => playTone(1320, 0.14, 0.035), 180);
}

function showFeedback(tone: Feedback["tone"], title: string, detail: string) {
  feedbackSeq += 1;
  feedback.value = { id: feedbackSeq, tone, title, detail };
}

function handleCanvasPointer(event: PointerEvent) {
  event.preventDefault();
  if (screen.value !== "game") return;
  if (gamePhase.value === "ready") beginCooking();
  else act();
}

function handleKeydown(event: KeyboardEvent) {
  if (["Space", "ArrowUp"].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    if (screen.value === "menu") startGame();
    else if (screen.value === "game" && gamePhase.value === "ready") beginCooking();
    else if (screen.value === "game" && gamePhase.value === "over") startGame();
    else if (screen.value === "game") act();
    return;
  }
  if (event.code === "Enter" && screen.value === "menu") {
    event.preventDefault();
    startGame();
  } else if (event.code === "KeyP" && screen.value === "game" && (gamePhase.value === "playing" || gamePhase.value === "paused")) {
    event.preventDefault();
    togglePause();
  } else if (event.code === "Escape" && screen.value !== "menu") {
    event.preventDefault();
    returnToMenu();
  }
}

function handleVisibilityChange() {
  if (document.hidden && gamePhase.value === "playing") togglePause();
}

function gameLoop(now: number) {
  if (gamePhase.value !== "playing") return;
  const delta = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;
  updateGame(delta);
  drawScene();
  if (gamePhase.value === "playing") animationFrame = requestAnimationFrame(gameLoop);
}

function updateGame(delta: number) {
  elapsed += delta;
  phaseSeconds += delta;
  if (stepPhase === "intro") {
    if (phaseSeconds * 1000 >= NOODLE_RULES.stepIntroMs) {
      stepPhase = "active";
      phaseSeconds = 0;
    }
  } else if (stepPhase === "active") {
    const gauge = noodleGaugePosition(currentStep.value, bowls.value, phaseSeconds);
    gaugePosition = gauge.position;
    if (gauge.expired) judge("miss");
  } else if (stepPhase === "result") {
    if (phaseSeconds * 1000 >= NOODLE_RULES.stepResultMs) advance();
  } else if (phaseSeconds * 1000 >= NOODLE_RULES.serveMs) {
    beginStep(0);
  }
}

function finishGame() {
  if (gamePhase.value !== "playing") return;
  gamePhase.value = "over";
  isNewRecord.value = score.value > bestScore.value;
  if (isNewRecord.value) {
    bestScore.value = score.value;
    writeStorage(STORAGE_PREFIX + ":best", String(bestScore.value));
  }
  const item: HistoryItem = { score: score.value, bowls: bowls.value, playedAt: new Date().toISOString() };
  history.value = [item, ...history.value].slice(0, 30);
  writeStorage(STORAGE_PREFIX + ":history", JSON.stringify(history.value));
  const generation = gameGeneration;
  const result = { score: score.value, bowls: bowls.value, durationMs: Math.max(0, Math.round(elapsed * 1000)) };
  cloudSettlementPromise = finishCloudAttempt(cloudAttemptPromise, generation, result);
  playTone(180, 0.16, 0.06);
  window.setTimeout(() => playTone(130, 0.2, 0.045), 110);
}

function zoneStyle(half: number) {
  const left = Math.max(0, target.value - half);
  const right = Math.min(1, target.value + half);
  return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
}

function dotClass(index: number) {
  const grade = stepGrades.value[index];
  if (grade) return `is-${grade}`;
  return index === stepIndex.value && !serving.value ? "is-current" : "";
}

function resizeCanvas() {
  const canvas = canvasEl.value;
  const phone = phoneEl.value;
  if (!canvas || !phone || !phone.clientWidth || !phone.clientHeight) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const scale = phone.clientWidth / WORLD_WIDTH;
  worldHeight = phone.clientHeight / scale;
  canvas.width = Math.round(phone.clientWidth * ratio);
  canvas.height = Math.round(phone.clientHeight * ratio);
  canvasContext = canvas.getContext("2d");
  canvasContext?.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
  drawScene();
}

function drawScene() {
  const context = canvasContext;
  if (!context) return;
  const cooking = gamePhase.value !== "ready";
  drawNoodleScene(context, {
    width: WORLD_WIDTH,
    height: worldHeight,
    stage: !cooking ? "idle" : serving.value ? "serve" : currentStep.value.id,
    position: gaugePosition,
    target: target.value,
    grade: stepGrade,
    time: cooking ? elapsed : 0,
    stars: bowlStars,
  });
  if (pointerEl.value) pointerEl.value.style.left = `${gaugePosition * 100}%`;
}

function drawMenuArt() {
  const context = menuArtEl.value?.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, 248, 248);
  drawNoodleBowl(context, 124, 92, 1);
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value;
  writeStorage(STORAGE_PREFIX + ":sound", String(soundEnabled.value));
  if (soundEnabled.value) {
    ensureAudio();
    playTone(620, 0.07, 0.035);
  }
}

function ensureAudio() {
  if (!soundEnabled.value || audioContext) return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextClass) audioContext = new AudioContextClass();
}

function playTone(frequency: number, duration: number, volume: number) {
  if (!soundEnabled.value) return;
  ensureAudio();
  if (!audioContext) return;
  if (audioContext.state === "suspended") void audioContext.resume();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(volume * 1.6, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

async function loadLeaderboard(force = false) {
  if (leaderboardLoading.value) return;
  leaderboardLoading.value = true;
  leaderboardError.value = "";
  try {
    applyLeaderboard(await tomatoNoodleApi.leaderboard({ cacheTtlMs: force ? 0 : 15_000 }));
  } catch {
    leaderboardError.value = "云端排行暂时没有连接上";
  } finally {
    leaderboardLoading.value = false;
  }
}

async function initializeCloud() {
  if (!auth.ready) await auth.fetchMe({ probe: true }).catch(() => undefined);
  await loadLeaderboard();
}

async function beginCloudAttempt(generation: number) {
  if (!isLoggedIn.value) return null;
  try {
    const attempt = await tomatoNoodleApi.startAttempt({
      suppressAuthRedirect: true,
      suppressAuthMessage: true,
      suppressErrorMessage: true,
    });
    return attempt.id;
  } catch (error) {
    if (generation === gameGeneration) {
      cloudSubmitState.value = "error";
      cloudSubmitDetail.value = cloudFailureMessage(error, "云端未能创建本局记录，本局仅保存在本机");
    }
    return null;
  }
}

async function abandonCloudAttempt(attemptPromise: Promise<number | null>) {
  const attemptId = await attemptPromise;
  if (!attemptId) return;
  try {
    await tomatoNoodleApi.abandonAttempt(attemptId, {
      suppressAuthRedirect: true,
      suppressAuthMessage: true,
      suppressErrorMessage: true,
    });
  } catch {
    // The next start also closes unfinished attempts.
  }
}

async function finishCloudAttempt(
  attemptPromise: Promise<number | null>,
  generation: number,
  result: { score: number; bowls: number; durationMs: number },
) {
  if (!isLoggedIn.value) {
    if (generation === gameGeneration) cloudSubmitState.value = "guest";
    return;
  }
  if (generation === gameGeneration) cloudSubmitState.value = "syncing";
  const attemptId = await attemptPromise;
  if (!attemptId) {
    if (generation === gameGeneration) {
      cloudSubmitState.value = "error";
      if (!cloudSubmitDetail.value) cloudSubmitDetail.value = "云端未能创建本局记录，本局仅保存在本机";
    }
    return;
  }
  try {
    const board = await tomatoNoodleApi.finishAttempt(attemptId, result, {
      suppressAuthRedirect: true,
      suppressAuthMessage: true,
      suppressErrorMessage: true,
    });
    applyLeaderboard(board);
    if (generation === gameGeneration) cloudSubmitState.value = "success";
  } catch (error) {
    if (generation === gameGeneration) {
      cloudSubmitState.value = "error";
      cloudSubmitDetail.value = cloudFailureMessage(error, "成绩校验未完成，本局仅保存在本机");
    }
  }
}

function cloudFailureMessage(error: unknown, fallback: string) {
  const failure = error as {
    response?: { status?: number; data?: { message?: unknown } };
  };
  const status = failure?.response?.status;
  const message = typeof failure?.response?.data?.message === "string"
    ? failure.response.data.message.trim()
    : "";
  if (status === 401) return "登录已过期，本局仅保存在本机";
  if (status === 429) return message || "操作太频繁，请稍后再开一局";
  return message || fallback;
}

function applyLeaderboard(value: TomatoNoodleLeaderboard) {
  leaderboard.value = value.leaderboard;
  cloudMe.value = value.me;
  totalPlayers.value = value.totalPlayers;
  achievements.value = value.achievements;
  newlyUnlocked.value = value.newlyUnlocked;
}

function achievementPercent(item: TomatoNoodleAchievement) {
  if (item.unlocked) return 100;
  return Math.min(100, Math.max(0, Math.round((item.progress / Math.max(1, item.target)) * 100)));
}

function goToLogin() {
  router.push({ name: "login", query: { redirect: router.currentRoute.value.path } });
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readNumber(key: string) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readBoolean(key: string, fallback: boolean) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

function readHistory(): HistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_PREFIX + ":history") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => Number.isFinite(Number(item?.score)) && typeof item?.playedAt === "string")
      .slice(0, 30)
      .map((item) => ({
        score: Math.max(0, Math.floor(Number(item.score))),
        bowls: Math.max(0, Math.floor(Number(item.bowls) || 0)),
        playedAt: item.playedAt,
      }));
  } catch {
    return [];
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local persistence is optional when browser storage is unavailable.
  }
}
</script>

<style scoped src="./gameShell.css"></style>
<style scoped>
/* 共用外壳是药大人能飞的天蓝配色；这里换成灶台的暖色。 */
.noodle-shell {
  --ink: #3d2f2a;
  --cyan: #ffe7bd;
  --blue: #d9772b;
  --blue-dark: #a85312;
  --school-blue: #b3361c;
  background:
    radial-gradient(circle at 50% 0%, rgba(176, 92, 44, 0.82), transparent 45%),
    linear-gradient(160deg, #2b1710, #170b07 70%);
}

.noodle-shell .menu-emblem { border-color: rgba(179, 54, 28, .24); }
.noodle-shell .menu-screen h1 { color: #b3261e !important; }
.noodle-shell .menu-tagline { background: rgba(92, 52, 30, 0.72); }
.noodle-shell .menu-footnote { color: rgba(92, 60, 40, 0.74); }
.noodle-shell .game-button--ranking { background: #2f8f5b; }
.noodle-shell .ready-hint { top: 34%; }
.noodle-shell .ready-hint p { color: rgba(92, 60, 40, .8); }
.noodle-shell .game-modal,
.noodle-shell .panel-header,
.noodle-shell .setting-row { background: #fff8ea; }
.noodle-shell .result-stats { grid-template-columns: repeat(3, 1fr); }
.noodle-shell .result-label { display: table; margin: 0 auto 2px; }
.noodle-shell .ranking-list li,
.noodle-shell .history-list li,
.noodle-shell .achievement-list article:not(.unlocked) { background: rgba(255, 250, 240, .9); }
.noodle-shell .rank-user small,
.noodle-shell .history-list li > small,
.noodle-shell .achievement-copy small,
.noodle-shell .setting-row small { color: #7a685c; }
.noodle-shell .empty-panel { color: rgba(92, 60, 40, .6); }
.noodle-shell .flight-settings-panel > p { color: #6b5548; text-align: left; }

.noodle-status {
  position: absolute;
  top: 10px;
  left: 50%;
  display: grid;
  place-items: center;
  gap: 3px;
  padding: 6px 12px;
  border: 3px solid #403c39;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 4px 0 #403c39;
  line-height: 1;
  transform: translateX(-50%);
}
.noodle-hearts { display: flex; gap: 3px; }
.noodle-hearts i { color: #e11124; font-size: 17px; font-style: normal; }
.noodle-hearts i.lost { color: #d5cfc8; }
.noodle-status b { font-size: 12px; font-weight: 900; }

.noodle-step {
  position: absolute;
  top: 84px;
  left: 50%;
  min-width: 190px;
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 8px 16px 9px;
  border: 3px solid #403c39;
  border-radius: 14px;
  background: rgba(255, 248, 234, .96);
  box-shadow: 0 4px 0 #403c39;
  transform: translateX(-50%);
}
.noodle-step small { color: #8a6f5c; font-size: 11px; font-weight: 800; }
.noodle-step b { color: #b3261e; font-size: 22px; font-weight: 950; line-height: 1.1; letter-spacing: .04em; }
.noodle-dots { display: flex; gap: 6px; margin-top: 2px; }
.noodle-dots i {
  width: 12px;
  height: 12px;
  border: 2px solid #403c39;
  border-radius: 50%;
  background: #fff;
}
.noodle-dots i.is-current { background: #ffd66b; box-shadow: 0 0 0 3px rgba(255, 214, 107, .5); }
.noodle-dots i.is-perfect { background: #f59e0b; }
.noodle-dots i.is-good { background: #3fae5a; }
.noodle-dots i.is-ok { background: #7fb4d9; }
.noodle-dots i.is-miss { background: #5b5350; }

.noodle-feedback {
  position: absolute;
  top: 190px;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 7px 16px 8px;
  border: 3px solid #403c39;
  border-radius: 999px;
  color: #fff;
  background: #3fae5a;
  box-shadow: 0 4px 0 #403c39;
  white-space: nowrap;
  transform: translateX(-50%);
  animation: noodle-pop .28s cubic-bezier(.2, 1.6, .4, 1) both;
}
.noodle-feedback b { font-size: 19px; font-weight: 950; line-height: 1.1; }
.noodle-feedback small { font-size: 11px; font-weight: 800; opacity: .92; }
.noodle-feedback.is-perfect,
.noodle-feedback.is-serve { color: #5a3400; background: #ffc93c; }
.noodle-feedback.is-ok { background: #5c93bd; }
.noodle-feedback.is-miss { background: #5b5350; }
@keyframes noodle-pop {
  from { opacity: 0; transform: translateX(-50%) scale(.6); }
  to { opacity: 1; transform: translateX(-50%) scale(1); }
}

.noodle-gauge {
  position: absolute;
  right: 18px;
  bottom: max(22px, env(safe-area-inset-bottom));
  left: 18px;
  padding: 10px 14px 9px;
  border: 3px solid #403c39;
  border-radius: 16px;
  background: rgba(255, 248, 234, .97);
  box-shadow: 0 5px 0 #403c39;
}
.noodle-gauge p {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
  color: #8a6f5c;
  font-size: 11px;
  font-weight: 800;
}
.noodle-gauge p b { color: #3d2f2a; font-size: 13px; font-weight: 900; text-align: center; }
.noodle-gauge > small { display: block; margin-top: 7px; color: #a08a7a; font-size: 10px; font-weight: 800; text-align: center; }

.noodle-track {
  position: relative;
  height: 30px;
  border: 3px solid #403c39;
  border-radius: 10px;
  background: #efe3d0;
}
.noodle-zone { position: absolute; top: 0; bottom: 0; }
.noodle-zone--ok { background: #ffe08a; }
.noodle-zone--good { background: #ffae3b; }
.noodle-zone--perfect { background: #e8452c; }
.noodle-zone--over {
  right: 0;
  border-radius: 0 6px 6px 0;
  background: repeating-linear-gradient(135deg, #7a5a4c 0 6px, #6a4c40 6px 12px);
}
.noodle-pointer {
  position: absolute;
  top: -9px;
  bottom: -9px;
  left: 0;
  width: 8px;
  margin-left: -4px;
  border: 2px solid #fff;
  border-radius: 4px;
  background: #2f2623;
  box-shadow: 0 0 0 2px #2f2623;
}

@media (max-width: 600px) {
  .noodle-shell { background: #170b07; }
}

@media (max-height: 640px) {
  .noodle-step { top: 76px; padding: 6px 14px 7px; }
  .noodle-step b { font-size: 19px; }
  .noodle-feedback { top: 164px; }
}

@media (prefers-reduced-motion: reduce) {
  .noodle-feedback { animation: none; }
}
</style>
