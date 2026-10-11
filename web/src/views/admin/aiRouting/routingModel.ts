import type {
  AiLearningTierModels,
  AiRouteEntry,
  AiRouteTest,
  AiRoutingScene,
  AiRoutingUpdate,
  AiServiceConfig,
  AiServiceProbe,
  AiServiceTraffic,
} from "@/api/admin";

/** 线路面板编辑中的一份配置：服务池加每个场景的线路。 */
export type RoutingDraft = {
  services: AiServiceConfig[];
  scenes: AiRoutingScene[];
};

export const LEARNING_TIER_LABELS: Array<{ key: keyof AiLearningTierModels; label: string }> = [
  { key: "low", label: "快速判断" },
  { key: "high", label: "深入分析" },
  { key: "max", label: "挑战难题" },
];

const TEST_FRESH_MS = 10 * 60_000;
const UNSTABLE_ERROR_RATIO = 0.3;

export function cloneDraft(draft: RoutingDraft): RoutingDraft {
  return JSON.parse(JSON.stringify(draft)) as RoutingDraft;
}

export function isDraftDirty(draft: RoutingDraft, saved: RoutingDraft) {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

export function toRoutingUpdate(draft: RoutingDraft): AiRoutingUpdate {
  return {
    services: draft.services,
    scenes: Object.fromEntries(draft.scenes.map((scene) => [
      scene.scene,
      { chain: scene.chain, ...(scene.tierModels ? { tierModels: scene.tierModels } : {}) },
    ])),
  };
}

function findService(services: AiServiceConfig[], serviceId: string) {
  return services.find((service) => service.id === serviceId);
}

/** 主线路上实际使用的模型名；网课解题按档位存，取“快速判断”那一档代表。 */
export function primaryModel(scene: AiRoutingScene) {
  return scene.tierModels ? scene.tierModels.low : scene.chain[0]?.model || "";
}

/** 线路上某一环会发给上游的模型：回退环没写模型时沿用主模型名。 */
export function entryModel(scene: AiRoutingScene, index: number) {
  return index === 0 ? primaryModel(scene) : scene.chain[index]?.model || primaryModel(scene);
}

/** 当前承载请求的是线路上的第几环；整条线路都停用时为 -1。 */
export function activeEntryIndex(scene: AiRoutingScene, services: AiServiceConfig[]) {
  return scene.chain.findIndex((entry) => {
    const service = findService(services, entry.serviceId);
    return Boolean(service) && !service!.disabled;
  });
}

export type SceneRouteStatus = {
  kind: "primary" | "fallback" | "stopped";
  activeIndex: number;
};

export function sceneRouteStatus(scene: AiRoutingScene, services: AiServiceConfig[]): SceneRouteStatus {
  const activeIndex = activeEntryIndex(scene, services);
  if (activeIndex < 0) return { kind: "stopped", activeIndex };
  return { kind: activeIndex === 0 ? "primary" : "fallback", activeIndex };
}

function setPrimaryModel(scene: AiRoutingScene, model: string) {
  scene.chain[0].model = model;
  if (scene.tierModels) scene.tierModels = { low: model, high: model, max: model };
}

/** 把线路上的某一环提到最前。原来的主线路带着自己的模型退到第二环。 */
export function promoteEntry(scene: AiRoutingScene, index: number) {
  if (index <= 0 || index >= scene.chain.length) return;
  const previousModel = primaryModel(scene);
  const [entry] = scene.chain.splice(index, 1);
  const nextModel = entry.model || previousModel;
  scene.chain[0].model = previousModel;
  scene.chain.unshift({ serviceId: entry.serviceId, model: nextModel });
  setPrimaryModel(scene, nextModel);
}

/** 让某个服务成为场景的主线路：已在线路里就提前，不在就插到最前。 */
export function setPrimaryService(scene: AiRoutingScene, serviceId: string, model: string) {
  const index = scene.chain.findIndex((entry) => entry.serviceId === serviceId);
  if (index > 0) {
    promoteEntry(scene, index);
  } else if (index < 0) {
    scene.chain[0].model = primaryModel(scene);
    scene.chain.unshift({ serviceId, model });
  }
  if (model) setPrimaryModel(scene, model);
}

export function addFallback(scene: AiRoutingScene, serviceId: string, model: string) {
  if (scene.chain.some((entry) => entry.serviceId === serviceId)) return;
  scene.chain.push({ serviceId, model });
}

export function removeEntry(scene: AiRoutingScene, index: number) {
  if (scene.chain.length <= 1 || index < 0 || index >= scene.chain.length) return;
  if (index === 0) promoteEntry(scene, 1);
  scene.chain.splice(index === 0 ? 1 : index, 1);
}

/** 从服务池删掉一个服务，并把它从所有线路里摘掉；只剩它的线路改由池里第一个服务承载。 */
export function removeService(draft: RoutingDraft, serviceId: string) {
  if (draft.services.length <= 1) return;
  draft.services = draft.services.filter((service) => service.id !== serviceId);
  for (const scene of draft.scenes) {
    const index = scene.chain.findIndex((entry) => entry.serviceId === serviceId);
    if (index < 0) continue;
    if (scene.chain.length > 1) removeEntry(scene, index);
    else scene.chain[0].serviceId = draft.services[0].id;
  }
}

export type ServiceUsage = { primary: number; fallback: number; active: number };

/** 一个服务被多少个场景当主线路、当回退，以及此刻实际承载着多少个场景。 */
export function serviceUsage(draft: RoutingDraft, serviceId: string): ServiceUsage {
  const usage: ServiceUsage = { primary: 0, fallback: 0, active: 0 };
  for (const scene of draft.scenes) {
    const index = scene.chain.findIndex((entry) => entry.serviceId === serviceId);
    if (index < 0) continue;
    if (index === 0) usage.primary += 1;
    else usage.fallback += 1;
    if (activeEntryIndex(scene, draft.services) === index) usage.active += 1;
  }
  return usage;
}

export type DisableImpact = {
  scene: AiRoutingScene;
  /** 停用后接手的那一环；没有可接手的为 null。 */
  next: { entry: AiRouteEntry; model: string } | null;
};

/** 停用一个服务会影响哪些正在由它承载的场景，各自改走哪里。 */
export function disableImpact(draft: RoutingDraft, serviceId: string): DisableImpact[] {
  const remaining = draft.services.map((service) => (
    service.id === serviceId ? { ...service, disabled: true } : service
  ));
  return draft.scenes
    .filter((scene) => scene.chain[activeEntryIndex(scene, draft.services)]?.serviceId === serviceId)
    .map((scene) => {
      const nextIndex = activeEntryIndex(scene, remaining);
      return {
        scene,
        next: nextIndex < 0 ? null : { entry: scene.chain[nextIndex], model: entryModel(scene, nextIndex) },
      };
    });
}

export type ModelCheck = "confirmed" | "missing" | "unknown" | "unchecked";

/** 模型在不在这个服务的模型目录里。目录读不到时是 unknown，还没读过是 unchecked。 */
export function checkModel(model: string, probe: AiServiceProbe | undefined): ModelCheck {
  if (!probe) return "unchecked";
  if (!probe.ok) return "unknown";
  const wanted = model.trim().toLowerCase();
  return probe.models.some((item) => item.trim().toLowerCase() === wanted) ? "confirmed" : "missing";
}

/** 换到另一个服务时先替管理员填上的模型：线路里已为它配过的、或它的目录里有同名的；都没有就留空让人选。 */
export function suggestModel(scene: AiRoutingScene, serviceId: string, probe: AiServiceProbe | undefined) {
  const index = scene.chain.findIndex((entry) => entry.serviceId === serviceId);
  if (index >= 0 && entryModel(scene, index)) return entryModel(scene, index);
  const current = primaryModel(scene);
  return checkModel(current, probe) === "confirmed" ? current : "";
}

export function routeTestKey(serviceId: string, model: string) {
  return `${serviceId}\n${model}`;
}

/** 所有线路上用到的“服务 + 模型”组合，去重后用于一次性实测。 */
export function distinctRoutes(draft: RoutingDraft) {
  const routes = new Map<string, { serviceId: string; model: string }>();
  for (const scene of draft.scenes) {
    scene.chain.forEach((entry, index) => {
      const models = index === 0 && scene.tierModels ? Object.values(scene.tierModels) : [entryModel(scene, index)];
      for (const model of models) {
        if (model) routes.set(routeTestKey(entry.serviceId, model), { serviceId: entry.serviceId, model });
      }
    });
  }
  return Array.from(routes.values());
}

export type ServiceHealth = {
  level: "off" | "bad" | "warn" | "good" | "idle";
  label: string;
  /** 报错原文之类的补充说明，可能为空。 */
  detail: string;
};

/**
 * 综合三种信号给一个服务定状态：实测结果最直接，其次是最近真实请求的成败，最后才是模型目录能不能读到。
 * 目录读不到只算提醒，因为有的中转站不提供目录接口但对话正常。
 */
export function serviceHealth(input: {
  service: AiServiceConfig;
  traffic?: AiServiceTraffic;
  probe?: AiServiceProbe;
  tests: AiRouteTest[];
  now?: number;
}): ServiceHealth {
  const { service, traffic, probe } = input;
  const now = input.now ?? Date.now();
  const tests = input.tests.filter((test) => now - Date.parse(test.checkedAt) < TEST_FRESH_MS);
  const failed = tests.find((test) => !test.ok);
  if (service.disabled) {
    // 停用期间没有真实请求，能不能恢复只能看实测。
    const detail = failed ? `实测仍然失败：${failed.message}` : tests.length ? "实测已通过，可以恢复" : "";
    return { level: "off", label: "已停用", detail };
  }
  if (failed) {
    return { level: "bad", label: "实测失败", detail: failed.status ? `HTTP ${failed.status} ${failed.message}` : failed.message };
  }
  if (traffic && traffic.error > 0) {
    if ((traffic.lastErrorAt || "") > (traffic.lastSuccessAt || "")) {
      return { level: "bad", label: "最近的请求失败", detail: traffic.lastError };
    }
    if (traffic.error / (traffic.error + traffic.success) >= UNSTABLE_ERROR_RATIO) {
      return { level: "warn", label: "不稳定", detail: traffic.lastError };
    }
  }
  if (tests.length) return { level: "good", label: "实测通过", detail: "" };
  if (traffic && traffic.success > 0) return { level: "good", label: "正常", detail: "" };
  if (!probe) return { level: "idle", label: "未检测", detail: "" };
  return probe.ok
    ? { level: "good", label: "可连接", detail: "" }
    : { level: "warn", label: "读不到模型目录", detail: probe.error };
}

/** 保存前的检查，返回给管理员看的问题列表；空数组表示可以保存。 */
export function draftProblems(draft: RoutingDraft) {
  const problems: string[] = [];
  for (const service of draft.services) {
    if (!service.name.trim()) problems.push("有服务没有填名称");
  }
  for (const scene of draft.scenes) {
    const models = scene.tierModels ? Object.values(scene.tierModels) : [scene.chain[0]?.model || ""];
    if (models.some((model) => !model.trim())) problems.push(`${scene.label}的主线路还没选模型`);
  }
  return problems;
}
