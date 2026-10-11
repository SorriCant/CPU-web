<template>
  <div v-loading="loading && !draft" class="air">
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="air-alert" :title="loadError">
      <template #default>
        <el-button size="small" :loading="loading" @click="load">重试</el-button>
      </template>
    </el-alert>

    <template v-if="draft">
      <header class="air-banner" :class="`is-${overall.level}`">
        <span class="air-dot" aria-hidden="true" />
        <div class="air-banner-text">
          <strong>{{ overall.title }}</strong>
          <span>{{ overall.detail }}</span>
        </div>
        <div class="air-banner-actions cpu-button-row">
          <el-button
            v-if="overall.failing"
            type="danger"
            :loading="togglingId === overall.failing.id"
            @click="toggleService(overall.failing)"
          >
            停用「{{ overall.failing.name }}」
          </el-button>
          <el-button :loading="refreshing" @click="refresh()">刷新状态</el-button>
          <el-button :loading="testingAll" @click="testAll">全部实测</el-button>
        </div>
      </header>

      <section class="air-group">
        <div class="air-group-head">
          <div>
            <h3>服务</h3>
            <p>停用立即生效：由它承载的场景改走各自线路里的下一个服务，恢复后自动回到原线路。</p>
          </div>
          <el-button @click="openServiceEditor(null)">添加服务</el-button>
        </div>
        <ul class="air-list">
          <li v-for="row in serviceRows" :key="row.service.id" class="air-service" :class="`is-${row.health.level}`">
            <span class="air-dot" aria-hidden="true" />
            <div class="air-service-main">
              <div class="air-service-name">
                <span>{{ row.service.name }}</span>
                <small>{{ row.host }}</small>
              </div>
              <div class="air-service-facts">
                <b>{{ row.health.label }}</b>
                <span v-for="fact in row.facts" :key="fact">{{ fact }}</span>
              </div>
              <p v-if="row.health.detail" class="air-service-detail" :title="row.health.detail">{{ row.health.detail }}</p>
            </div>
            <div class="air-service-usage">
              <b>{{ row.usage.active ? `承载 ${row.usage.active} 个场景` : "当前没有承载场景" }}</b>
              <span>主用 {{ row.usage.primary }} · 备用 {{ row.usage.fallback }}</span>
            </div>
            <div class="air-service-actions">
              <el-switch
                :model-value="!row.service.disabled"
                :loading="togglingId === row.service.id"
                :before-change="() => toggleService(row.service)"
                inline-prompt
                active-text="启用"
                inactive-text="停用"
              />
              <el-button size="small" text :loading="isTestingService(row.service.id)" @click="testService(row.service)">实测</el-button>
              <el-button size="small" text @click="openBulk(row.service)">全部改用它</el-button>
              <el-button size="small" text @click="openServiceEditor(row.service)">编辑</el-button>
            </div>
          </li>
        </ul>
      </section>

      <section class="air-group">
        <div class="air-group-head">
          <div>
            <h3>场景线路</h3>
            <p>请求从左到右依次尝试。点一环可以换模型、提到最前或移除；线路的改动要保存后才生效。</p>
          </div>
        </div>
        <ul class="air-list">
          <li v-for="row in sceneRows" :key="row.scene.scene" class="air-scene" :class="`is-${row.status.kind}`">
            <div class="air-scene-name">
              <span>{{ row.scene.label }}</span>
              <small v-if="!row.scene.featureEnabled">功能未开启</small>
            </div>
            <div class="air-chain">
              <template v-for="(entry, index) in row.scene.chain" :key="entry.serviceId">
                <span v-if="index" class="air-arrow" aria-hidden="true">→</span>
                <button
                  type="button"
                  data-cpu-button="surface"
                  class="air-hop"
                  :class="{
                    'is-active': row.status.activeIndex === index,
                    'is-off': isServiceOff(entry.serviceId),
                    'is-open': isEditing(row.scene, index),
                  }"
                  :title="hopIssue(row.scene, index)"
                  @click="toggleEditor(row.scene, index)"
                >
                  <span class="air-hop-service">{{ serviceName(entry.serviceId) }}</span>
                  <span class="air-hop-model">{{ hopModelLabel(row.scene, index) }}</span>
                  <span v-if="hopIssue(row.scene, index)" class="air-hop-flag" aria-hidden="true">!</span>
                </button>
              </template>
              <el-dropdown v-if="addableServices(row.scene).length" trigger="click" @command="addHop(row.scene, $event)">
                <button type="button" data-cpu-button="surface" class="air-hop air-hop--add">+ 回退</button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="service in addableServices(row.scene)" :key="service.id" :command="service.id">
                      {{ service.name }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="air-scene-status">{{ row.statusText }}</div>

            <div v-if="editing && editing.scene === row.scene.scene && row.scene.chain[editing.index]" class="air-editor">
              <div class="air-editor-head">
                <strong>
                  {{ serviceName(row.scene.chain[editing.index].serviceId) }}
                  · {{ editing.index === 0 ? "主线路" : `第 ${editing.index + 1} 环回退` }}
                </strong>
                <div class="cpu-button-row">
                  <el-button
                    size="small"
                    :loading="isTestingHop(row.scene, editing.index)"
                    @click="testHop(row.scene, editing.index)"
                  >
                    实测
                  </el-button>
                  <el-button v-if="editing.index > 0" size="small" @click="promoteHop(row.scene, editing.index)">提到最前</el-button>
                  <el-button
                    size="small"
                    type="danger"
                    plain
                    :disabled="row.scene.chain.length <= 1"
                    @click="removeHop(row.scene, editing.index)"
                  >
                    移除
                  </el-button>
                </div>
              </div>
              <div v-if="editing.index === 0 && row.scene.tierModels" class="air-editor-fields">
                <label v-for="tier in LEARNING_TIER_LABELS" :key="tier.key" class="air-field">
                  <span>{{ tier.label }}</span>
                  <el-select
                    :model-value="row.scene.tierModels[tier.key]"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择或输入模型"
                    @update:model-value="setTierModel(row.scene, tier.key, $event)"
                  >
                    <el-option
                      v-for="model in modelOptions(row.scene.chain[0].serviceId, row.scene.tierModels[tier.key])"
                      :key="model"
                      :label="model"
                      :value="model"
                    />
                  </el-select>
                </label>
              </div>
              <div v-else class="air-editor-fields">
                <label class="air-field">
                  <span>模型</span>
                  <el-select
                    v-model="row.scene.chain[editing.index].model"
                    filterable
                    allow-create
                    default-first-option
                    :clearable="editing.index > 0"
                    value-on-clear=""
                    :placeholder="editing.index > 0 ? `沿用主模型名 ${primaryModel(row.scene)}` : '选择或输入模型'"
                  >
                    <el-option
                      v-for="model in modelOptions(row.scene.chain[editing.index].serviceId, row.scene.chain[editing.index].model)"
                      :key="model"
                      :label="model"
                      :value="model"
                    />
                  </el-select>
                </label>
              </div>
              <p v-for="note in hopNotes(row.scene, editing.index)" :key="note.text" class="air-note" :class="`is-${note.tone}`">
                {{ note.text }}
              </p>
            </div>
          </li>
        </ul>
      </section>

      <div v-if="dirty" class="air-save">
        <span>线路有未保存的改动</span>
        <div class="cpu-button-row">
          <el-button :disabled="saving" @click="discard">放弃</el-button>
          <el-button type="primary" :loading="saving" @click="save()">保存线路</el-button>
        </div>
      </div>

      <AiServiceDialog
        v-model="serviceDialogOpen"
        :service="editingService"
        :can-delete="draft.services.length > 1"
        @save="applyService"
        @delete="deleteService"
      />
      <AiBulkSwitchDialog
        v-model="bulkDialogOpen"
        :service="bulkService"
        :services="draft.services"
        :scenes="draft.scenes"
        :probe="bulkService ? probes[bulkService.id] : undefined"
        @apply="applyBulk"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  adminApi,
  type AiLearningTierModels,
  type AiRouteTest,
  type AiRoutingOverview,
  type AiRoutingScene,
  type AiServiceConfig,
  type AiServiceProbe,
  type AiServiceScene,
  type AiServiceTraffic,
} from "@/api/admin";
import AiBulkSwitchDialog from "./aiRouting/AiBulkSwitchDialog.vue";
import AiServiceDialog from "./aiRouting/AiServiceDialog.vue";
import {
  LEARNING_TIER_LABELS,
  addFallback,
  checkModel,
  cloneDraft,
  disableImpact,
  distinctRoutes,
  draftProblems,
  entryModel,
  isDraftDirty,
  primaryModel,
  promoteEntry,
  removeEntry,
  removeService,
  routeTestKey,
  sceneRouteStatus,
  serviceHealth,
  serviceUsage,
  setPrimaryService,
  suggestModel,
  toRoutingUpdate,
  type RoutingDraft,
} from "./aiRouting/routingModel";

const REFRESH_INTERVAL_MS = 60_000;
const TEST_BATCH_SIZE = 24;
const TEST_FRESH_MS = 10 * 60_000;

const loading = ref(false);
const loadError = ref("");
const refreshing = ref(false);
const saving = ref(false);
const togglingId = ref("");
const testingAll = ref(false);
const testingKeys = ref<string[]>([]);
/** 服务端当前保存的线路，和编辑中的草稿分开放，用来判断有没有未保存的改动。 */
const saved = ref<RoutingDraft | null>(null);
const draft = ref<RoutingDraft | null>(null);
const traffic = ref<Record<string, AiServiceTraffic>>({});
const trafficWindow = ref(30);
const probes = ref<Record<string, AiServiceProbe>>({});
const tests = ref<Record<string, AiRouteTest>>({});
const now = ref(Date.now());
const editing = ref<{ scene: AiServiceScene; index: number } | null>(null);
const serviceDialogOpen = ref(false);
const editingService = ref<AiServiceConfig | null>(null);
const bulkDialogOpen = ref(false);
const bulkService = ref<AiServiceConfig | null>(null);
let refreshTimer: ReturnType<typeof setInterval> | undefined;

const dirty = computed(() => Boolean(draft.value && saved.value && isDraftDirty(draft.value, saved.value)));

const serviceRows = computed(() => (draft.value?.services || []).map((service) => {
  const probe = probes.value[service.id];
  const stats = traffic.value[service.id];
  const facts: string[] = [];
  if (stats && stats.success + stats.error > 0) {
    facts.push(`近 ${trafficWindow.value} 分钟 ${stats.success} 次成功、${stats.error} 次失败${stats.shared ? "（同地址的服务合计）" : ""}`);
  } else {
    facts.push(`近 ${trafficWindow.value} 分钟没有请求`);
  }
  if (probe?.ok) facts.push(`目录 ${probe.latencyMs}ms`);
  const passed = testsOf(service.id).filter((test) => test.ok);
  if (passed.length) facts.push(`实测 ${Math.max(...passed.map((test) => test.latencyMs))}ms`);
  return {
    service,
    host: hostOf(service.apiUrl),
    health: serviceHealth({ service, traffic: stats, probe, tests: testsOf(service.id), now: now.value }),
    facts,
    usage: serviceUsage(draft.value!, service.id),
  };
}));

const sceneRows = computed(() => (draft.value?.scenes || []).map((scene) => {
  const status = sceneRouteStatus(scene, draft.value!.services);
  const statusText = status.kind === "stopped"
    ? "没有可用线路"
    : status.kind === "fallback"
      ? `主线路已停用，正在走 ${serviceName(scene.chain[status.activeIndex].serviceId)}`
      : "走主线路";
  return { scene, status, statusText };
}));

const overall = computed(() => {
  const stopped = sceneRows.value.filter((row) => row.status.kind === "stopped" && row.scene.featureEnabled);
  const failing = serviceRows.value.filter((row) => row.health.level === "bad" && row.usage.active > 0);
  const onFallback = sceneRows.value.filter((row) => row.status.kind === "fallback");
  const none = null as AiServiceConfig | null;
  if (stopped.length) {
    return {
      level: "bad",
      title: `${stopped.length} 个场景没有可用线路`,
      detail: `${stopped.map((row) => row.scene.label).join("、")}。恢复一个服务，或者给它们加一环回退。`,
      failing: none,
    };
  }
  if (failing.length) {
    const first = failing[0];
    const hasNext = disableImpact(draft.value!, first.service.id).some((item) => item.next);
    return {
      level: "bad",
      title: `${failing.map((row) => row.service.name).join("、")}出故障`,
      detail: hasNext
        ? `「${first.service.name}」正承载 ${first.usage.active} 个场景，停用它，这些场景会立即改走回退线路。`
        : `「${first.service.name}」正承载 ${first.usage.active} 个场景，它们都没有配回退线路。`,
      failing: failing.length === 1 && hasNext ? first.service : none,
    };
  }
  if (onFallback.length) {
    const offNames = draft.value!.services.filter((service) => service.disabled).map((service) => service.name).join("、");
    return {
      level: "warn",
      title: `${onFallback.length} 个场景在走回退线路`,
      detail: `${offNames}已停用，恢复后这些场景自动回到主线路。`,
      failing: none,
    };
  }
  return {
    level: "good",
    title: "所有场景都在主线路上",
    detail: `${draft.value!.services.length} 个服务，${draft.value!.scenes.length} 个场景。`,
    failing: none,
  };
});

onMounted(async () => {
  await load();
  refreshTimer = setInterval(() => {
    if (!document.hidden && !saving.value && !refreshing.value) void refresh(true);
  }, REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => clearInterval(refreshTimer));

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    applyOverview(await adminApi.aiRouting({ suppressErrorMessage: true }));
    void probeServices();
  } catch (error) {
    loadError.value = requestMessage(error) || "线路加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

/** 用服务端的线路覆盖页面；草稿有未保存的改动时只更新请求统计，不动草稿。 */
function applyOverview(overview: AiRoutingOverview, keepDraft = false) {
  trafficWindow.value = overview.traffic.windowMinutes;
  traffic.value = Object.fromEntries(overview.traffic.services.map((item) => [item.serviceId, item]));
  if (keepDraft && dirty.value) return;
  const next = { services: overview.services, scenes: overview.scenes };
  saved.value = cloneDraft(next);
  draft.value = cloneDraft(next);
}

async function probeServices(services: AiServiceConfig[] = draft.value?.services || []) {
  if (!services.length) return;
  const results = await adminApi.probeAiServices(
    services.map((service) => ({ id: service.id, provider: service.provider, apiUrl: service.apiUrl, apiKey: service.apiKey })),
    { timeout: 45_000, suppressErrorMessage: true, preserveResponseCache: true },
  );
  probes.value = { ...probes.value, ...Object.fromEntries(results.map((item) => [item.serviceId, item])) };
}

async function refresh(silent = false) {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    const [overview] = await Promise.all([
      adminApi.aiRouting({ suppressErrorMessage: silent }),
      probeServices().catch(() => undefined),
    ]);
    applyOverview(overview, true);
    now.value = Date.now();
    // 之前实测失败的线路顺带重测一遍，上游恢复后故障提示会自己消掉。
    const failed = Object.values(tests.value)
      .filter((test) => !test.ok && now.value - Date.parse(test.checkedAt) < TEST_FRESH_MS)
      .map((test) => {
        const [serviceId, model] = test.key.split("\n");
        return { serviceId, model };
      });
    if (failed.length) await runTests(failed, true);
  } catch {
    // 手动刷新失败时请求层已经弹过提示，定时刷新失败则等下一轮。
  } finally {
    refreshing.value = false;
  }
}

function setDisabled(service: AiServiceConfig, disabled: boolean) {
  if (disabled) service.disabled = true;
  else delete service.disabled;
}

/** 停用或恢复一个服务。返回值给开关用：状态由服务端的结果回写，开关自己不翻。 */
async function toggleService(service: AiServiceConfig): Promise<boolean> {
  const state = draft.value;
  if (!state || togglingId.value) return false;
  const enable = Boolean(service.disabled);
  const impact = enable ? [] : disableImpact(state, service.id);
  const stranded = impact.filter((item) => !item.next && item.scene.featureEnabled);
  if (stranded.length) {
    const confirmed = await ElMessageBox.confirm(
      `${stranded.map((item) => item.scene.label).join("、")}没有其他线路，停用后会停止工作。`,
      `停用「${service.name}」？`,
      { type: "warning", confirmButtonText: "仍然停用", cancelButtonText: "取消" },
    ).then(() => true).catch(() => false);
    if (!confirmed) return false;
  }
  // 还没保存过的新服务，服务端不认识，只改草稿。
  if (!saved.value?.services.some((item) => item.id === service.id)) {
    setDisabled(service, !enable);
    return false;
  }
  togglingId.value = service.id;
  try {
    const overview = await adminApi.setAiServiceEnabled(service.id, enable);
    for (const target of [saved.value, draft.value]) {
      for (const item of target?.services || []) {
        const remote = overview.services.find((candidate) => candidate.id === item.id);
        if (remote) setDisabled(item, Boolean(remote.disabled));
      }
    }
    applyOverview(overview, true);
    const moved = impact.filter((item) => item.next).length;
    ElMessage.success(enable
      ? `已恢复「${service.name}」`
      : moved ? `已停用「${service.name}」，${moved} 个场景改走回退线路` : `已停用「${service.name}」`);
  } finally {
    togglingId.value = "";
  }
  return false;
}

async function save(message = "线路已保存") {
  const state = draft.value;
  if (!state || saving.value) return false;
  const [problem] = draftProblems(state);
  if (problem) {
    ElMessage.warning(problem);
    return false;
  }
  saving.value = true;
  try {
    applyOverview(await adminApi.saveAiRouting(toRoutingUpdate(state)));
    editing.value = null;
    ElMessage.success(message);
    void probeServices();
    return true;
  } finally {
    saving.value = false;
  }
}

function discard() {
  if (!saved.value) return;
  draft.value = cloneDraft(saved.value);
  editing.value = null;
}

function findService(serviceId: string) {
  return draft.value?.services.find((service) => service.id === serviceId);
}

function serviceName(serviceId: string) {
  return findService(serviceId)?.name || "已删除的服务";
}

function isServiceOff(serviceId: string) {
  return Boolean(findService(serviceId)?.disabled);
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url || "未填地址";
  }
}

function modelOptions(serviceId: string, current: string) {
  return Array.from(new Set([...(probes.value[serviceId]?.models || []), current].filter(Boolean)));
}

function hopModelLabel(scene: AiRoutingScene, index: number) {
  if (index > 0) return scene.chain[index].model || `沿用 ${primaryModel(scene) || "主模型"}`;
  if (!scene.tierModels) return scene.chain[0].model || "未选模型";
  const models = Array.from(new Set(Object.values(scene.tierModels).filter(Boolean)));
  return models.length > 1 ? `${models[0]} 等 ${models.length} 个` : models[0] || "未选模型";
}

/** 一环上实际会用到的模型；网课解题的主线路有三个。 */
function hopModels(scene: AiRoutingScene, index: number) {
  return index === 0 && scene.tierModels ? Object.values(scene.tierModels) : [entryModel(scene, index)];
}

function freshTest(serviceId: string, model: string) {
  const test = tests.value[routeTestKey(serviceId, model)];
  return test && now.value - Date.parse(test.checkedAt) < TEST_FRESH_MS ? test : undefined;
}

/** 一个服务的实测结果；只算线路上还在用的模型，改掉的模型留下的旧结果不再影响它的状态。 */
function testsOf(serviceId: string) {
  const routes = draft.value ? distinctRoutes(draft.value).filter((route) => route.serviceId === serviceId) : [];
  const inUse = new Set(routes.map((route) => routeTestKey(route.serviceId, route.model)));
  return Object.values(tests.value)
    .filter((test) => test.key.startsWith(`${serviceId}\n`) && (!routes.length || inUse.has(test.key)));
}

function hopNotes(scene: AiRoutingScene, index: number) {
  const entry = scene.chain[index];
  const notes: Array<{ tone: "good" | "warn" | "bad" | "muted"; text: string }> = [];
  if (isServiceOff(entry.serviceId)) notes.push({ tone: "warn", text: "这个服务已停用，请求会跳过这一环。" });
  const checks = hopModels(scene, index).map((model) => checkModel(model, probes.value[entry.serviceId]));
  if (checks.includes("missing")) {
    notes.push({
      tone: "warn",
      text: index === 0
        ? "这个服务的模型目录里没有所选的模型，请求很可能失败。"
        : "这个服务的模型目录里没有所选的模型，主线路出故障时不会自动回退到这一环。",
    });
  } else if (checks.includes("unknown")) {
    notes.push(index === 0
      ? { tone: "muted", text: "读不到这个服务的模型目录，无法核对模型名。" }
      : { tone: "warn", text: "读不到这个服务的模型目录。主线路出故障时只会自动回退到目录里确认有模型的服务，这一环会被跳过；手动停用主线路后顶上来的服务不受这个限制。" });
  } else if (checks.every((check) => check === "confirmed")) {
    notes.push({ tone: "good", text: "模型目录里有所选的模型。" });
  }
  const spares = index === 0 ? scene.fallbackModels.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean) : [];
  if (spares.length) {
    const absent = spares.filter((model) => checkModel(model, probes.value[entry.serviceId]) === "missing");
    notes.push(absent.length
      ? { tone: "warn", text: `这个场景还配了备选模型 ${absent.join("、")}，但这个服务的模型目录里没有，到“功能与审核”里改一下。` }
      : { tone: "muted", text: `主模型失败时还会在这个服务上试备选模型 ${spares.join("、")}（在“功能与审核”里修改）。` });
  }
  for (const model of new Set(hopModels(scene, index))) {
    const test = freshTest(entry.serviceId, model);
    if (!test) continue;
    notes.push(test.ok
      ? { tone: "good", text: `${model} 实测通过，用时 ${test.latencyMs}ms。` }
      : { tone: "bad", text: `${model} 实测失败：${test.status ? `HTTP ${test.status} ` : ""}${test.message}` });
  }
  return notes;
}

/** 线路上这一环需要留意的问题，显示成一个感叹号；没有问题返回空串。 */
function hopIssue(scene: AiRoutingScene, index: number) {
  return hopNotes(scene, index).find((note) => note.tone === "warn" || note.tone === "bad")?.text || "";
}

function isEditing(scene: AiRoutingScene, index: number) {
  return editing.value?.scene === scene.scene && editing.value.index === index;
}

function toggleEditor(scene: AiRoutingScene, index: number) {
  editing.value = isEditing(scene, index) ? null : { scene: scene.scene, index };
}

function setTierModel(scene: AiRoutingScene, tier: keyof AiLearningTierModels, model: string) {
  if (!scene.tierModels) return;
  scene.tierModels[tier] = String(model || "").trim();
  scene.chain[0].model = scene.tierModels.low;
}

function addableServices(scene: AiRoutingScene) {
  return (draft.value?.services || []).filter((service) => !scene.chain.some((entry) => entry.serviceId === service.id));
}

function addHop(scene: AiRoutingScene, serviceId: string) {
  const suggested = suggestModel(scene, serviceId, probes.value[serviceId]);
  // 目录里有同名模型就沿用主模型名，不用单独写；没有的留空等人选，并直接打开这一环。
  addFallback(scene, serviceId, suggested === primaryModel(scene) ? "" : suggested);
  editing.value = { scene: scene.scene, index: scene.chain.length - 1 };
}

function promoteHop(scene: AiRoutingScene, index: number) {
  promoteEntry(scene, index);
  editing.value = { scene: scene.scene, index: 0 };
}

function removeHop(scene: AiRoutingScene, index: number) {
  removeEntry(scene, index);
  editing.value = null;
}

function openServiceEditor(service: AiServiceConfig | null) {
  editingService.value = service;
  serviceDialogOpen.value = true;
}

function applyService(service: AiServiceConfig, probe: AiServiceProbe | null) {
  const state = draft.value;
  if (!state) return;
  const index = state.services.findIndex((item) => item.id === service.id);
  if (index >= 0) state.services[index] = service;
  else state.services.push(service);
  if (probe) probes.value = { ...probes.value, [service.id]: probe };
  else void probeServices([service]);
}

async function deleteService(serviceId: string) {
  const state = draft.value;
  const service = findService(serviceId);
  if (!state || !service) return;
  const usage = serviceUsage(state, serviceId);
  const confirmed = await ElMessageBox.confirm(
    usage.primary + usage.fallback
      ? `它在 ${usage.primary + usage.fallback} 个场景的线路里，删除后会从这些线路中摘掉。保存线路后生效。`
      : "保存线路后生效。",
    `删除「${service.name}」？`,
    { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
  ).then(() => true).catch(() => false);
  if (!confirmed) return;
  removeService(state, serviceId);
  editing.value = null;
  serviceDialogOpen.value = false;
}

function openBulk(service: AiServiceConfig) {
  bulkService.value = service;
  bulkDialogOpen.value = true;
}

async function applyBulk(changes: Array<{ scene: AiServiceScene; model: string }>) {
  const state = draft.value;
  const target = bulkService.value;
  if (!state || !target) return;
  for (const change of changes) {
    const scene = state.scenes.find((item) => item.scene === change.scene);
    if (scene) setPrimaryService(scene, target.id, change.model);
  }
  await save(`${changes.length} 个场景已改用「${target.name}」`);
}

async function runTests(routes: Array<{ serviceId: string; model: string }>, quiet = false) {
  const payload = routes.flatMap((route) => {
    const service = findService(route.serviceId);
    return service
      ? [{
          key: routeTestKey(route.serviceId, route.model),
          provider: service.provider,
          apiUrl: service.apiUrl,
          apiKey: service.apiKey,
          model: route.model,
        }]
      : [];
  });
  if (!payload.length) return;
  const keys = payload.map((item) => item.key);
  testingKeys.value = [...testingKeys.value, ...keys];
  try {
    const results: AiRouteTest[] = [];
    for (let offset = 0; offset < payload.length; offset += TEST_BATCH_SIZE) {
      results.push(...await adminApi.testAiRoutes(
        payload.slice(offset, offset + TEST_BATCH_SIZE),
        { timeout: 60_000, preserveResponseCache: true, suppressErrorMessage: quiet },
      ));
    }
    tests.value = { ...tests.value, ...Object.fromEntries(results.map((item) => [item.key, item])) };
    now.value = Date.now();
    if (quiet) return;
    const failed = results.filter((item) => !item.ok);
    if (!failed.length) {
      ElMessage.success(`实测通过，共 ${results.length} 条`);
    } else {
      const [serviceId, model] = failed[0].key.split("\n");
      ElMessage.error(`${failed.length} 条实测失败：${serviceName(serviceId)} · ${model}，${failed[0].message}`);
    }
  } finally {
    testingKeys.value = testingKeys.value.filter((key) => !keys.includes(key));
  }
}

function isTestingService(serviceId: string) {
  return testingKeys.value.some((key) => key.startsWith(`${serviceId}\n`));
}

function isTestingHop(scene: AiRoutingScene, index: number) {
  const serviceId = scene.chain[index].serviceId;
  return hopModels(scene, index).some((model) => testingKeys.value.includes(routeTestKey(serviceId, model)));
}

async function testHop(scene: AiRoutingScene, index: number) {
  const serviceId = scene.chain[index].serviceId;
  const models = Array.from(new Set(hopModels(scene, index).filter(Boolean)));
  if (!models.length) {
    ElMessage.warning("先选一个模型");
    return;
  }
  await runTests(models.map((model) => ({ serviceId, model })));
}

/** 实测一个服务在各线路上被用到的全部模型；还没进任何线路的，用它目录里的第一个模型试一下。 */
async function testService(service: AiServiceConfig) {
  const state = draft.value;
  if (!state) return;
  const routes = distinctRoutes(state).filter((route) => route.serviceId === service.id);
  if (routes.length) {
    await runTests(routes);
    return;
  }
  const [model] = probes.value[service.id]?.models || [];
  if (!model) {
    ElMessage.warning("这个服务还没进任何线路，也读不到它的模型目录，先把它加进一条线路再实测");
    return;
  }
  await runTests([{ serviceId: service.id, model }]);
}

async function testAll() {
  const state = draft.value;
  if (!state || testingAll.value) return;
  testingAll.value = true;
  try {
    await runTests(distinctRoutes(state));
  } finally {
    testingAll.value = false;
  }
}

function requestMessage(error: unknown) {
  if (typeof error !== "object" || error === null) return "";
  const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
  if (typeof responseMessage === "string") return responseMessage;
  return error instanceof Error ? error.message : "";
}
</script>

<style scoped>
.air {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 160px;
}

.air-alert :deep(.el-alert__content) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.air-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: var(--cpu-radius-pill);
  background: var(--air-tone, var(--cpu-text-muted));
}

.is-good { --air-tone: var(--cpu-success); }
.is-warn { --air-tone: var(--cpu-warn); }
.is-bad { --air-tone: var(--cpu-danger); }
.is-off,
.is-idle,
.is-muted { --air-tone: var(--cpu-text-muted); }

.air-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--cpu-border-soft);
  border-left: 3px solid var(--air-tone);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
}

.air-banner-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.air-banner-text strong {
  color: var(--cpu-text);
  font-size: var(--cpu-fs-l);
  font-weight: 600;
}

.air-banner-text span {
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-s);
  line-height: 1.5;
}

.air-banner-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
}

.air-group {
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}

.air-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}

.air-group-head h3 {
  margin: 0;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 600;
}

.air-group-head p {
  margin: 2px 0 0;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  line-height: 1.5;
}

.air-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.air-service,
.air-scene {
  display: grid;
  align-items: center;
  gap: 4px 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--cpu-border-soft);
}

.air-service {
  grid-template-columns: 8px minmax(0, 1fr) 148px auto;
}

.air-service-main {
  min-width: 0;
}

.air-service-name {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 600;
}

.air-service-name small {
  overflow: hidden;
  color: var(--cpu-text-muted);
  font-family: var(--cpu-font-mono);
  font-size: var(--cpu-fs-xs);
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.air-service.is-off .air-service-name > span {
  color: var(--cpu-text-muted);
}

.air-service-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  margin-top: 2px;
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
}

.air-service-facts b {
  color: var(--air-tone);
  font-weight: 600;
}

.air-service-detail {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--air-tone);
  font-size: var(--cpu-fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.air-service-usage {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--cpu-fs-xs);
}

.air-service-usage b {
  color: var(--cpu-text);
  font-weight: 500;
}

.air-service-usage span {
  color: var(--cpu-text-muted);
}

.air-service-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.air-service-actions :deep(.el-switch) {
  margin-right: 8px;
}

.air-service-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.air-scene {
  grid-template-columns: 112px minmax(0, 1fr) auto;
}

.air-scene-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-s);
  font-weight: 600;
}

.air-scene-name small {
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  font-weight: 400;
}

.air-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.air-arrow {
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
}

.air-hop {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 4px 10px;
  border: 1px solid var(--cpu-border);
  border-radius: var(--cpu-radius-s);
  background: var(--cpu-surface);
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
  line-height: 1.5;
  cursor: pointer;
}

.air-hop:hover,
.air-hop.is-open {
  border-color: var(--cpu-primary);
}

.air-hop-service {
  color: var(--cpu-text);
  font-weight: 600;
  white-space: nowrap;
}

.air-hop-model {
  overflow: hidden;
  font-family: var(--cpu-font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 此刻承载请求的那一环 */
.air-hop.is-active {
  border-color: var(--cpu-primary);
  background: var(--cpu-primary-soft);
}

.air-hop.is-off {
  border-style: dashed;
  background: transparent;
}

.air-hop.is-off .air-hop-service,
.air-hop.is-off .air-hop-model {
  color: var(--cpu-text-muted);
  text-decoration: line-through;
}

.air-hop-flag {
  color: var(--cpu-warn);
  font-weight: 700;
}

.air-hop--add {
  border-style: dashed;
  color: var(--cpu-primary);
}

.air-scene-status {
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  text-align: right;
  white-space: nowrap;
}

.air-scene.is-fallback .air-scene-status {
  color: var(--cpu-warn);
}

.air-scene.is-stopped .air-scene-status {
  color: var(--cpu-danger);
}

.air-editor {
  grid-column: 2 / -1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding: 12px;
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-soft);
}

.air-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-s);
}

.air-editor-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.air-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.air-field > span {
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
}

.air-note {
  margin: 0;
  color: var(--air-tone);
  font-size: var(--cpu-fs-xs);
  line-height: 1.6;
}

.air-save {
  position: sticky;
  bottom: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid var(--cpu-primary);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
  box-shadow: var(--cpu-shadow-float);
  color: var(--cpu-text);
  font-size: var(--cpu-fs-s);
}

@media (max-width: 900px) {
  .air-banner {
    flex-wrap: wrap;
  }

  .air-banner-actions {
    width: 100%;
  }

  .air-service {
    grid-template-columns: 8px minmax(0, 1fr);
  }

  .air-service-usage,
  .air-service-actions {
    grid-column: 2;
  }

  .air-service-usage {
    flex-direction: row;
    gap: 12px;
  }

  .air-service-actions {
    flex-wrap: wrap;
  }

  .air-scene {
    grid-template-columns: minmax(0, 1fr);
  }

  .air-scene-name {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  .air-scene-status {
    text-align: left;
    white-space: normal;
  }

  .air-editor {
    grid-column: 1;
  }

  .air-editor-head {
    flex-wrap: wrap;
  }

  .air-editor-fields {
    grid-template-columns: 1fr;
  }
}
</style>
