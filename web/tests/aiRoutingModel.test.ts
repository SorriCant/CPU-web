import assert from "node:assert/strict";
import test from "node:test";
import type { AiRoutingScene, AiServiceConfig, AiServiceProbe, AiServiceTraffic } from "../src/api/admin";
import {
  checkModel,
  disableImpact,
  distinctRoutes,
  draftProblems,
  promoteEntry,
  removeEntry,
  removeService,
  sceneRouteStatus,
  serviceHealth,
  serviceUsage,
  setPrimaryService,
  suggestModel,
  type RoutingDraft,
} from "../src/views/admin/aiRouting/routingModel";

function service(id: string, disabled = false): AiServiceConfig {
  return {
    id,
    name: id.toUpperCase(),
    provider: "openai",
    apiUrl: `https://${id}.example.com/v1`,
    apiKey: "k",
    assistantContextMaxMessages: 0,
    assistantContextMaxCharsPerMessage: 0,
    ...(disabled ? { disabled: true } : {}),
  };
}

function draft(disabledIds: string[] = []): RoutingDraft {
  const scenes: AiRoutingScene[] = [
    {
      scene: "text-review",
      label: "文字审核",
      featureEnabled: true,
      fallbackModels: "",
      chain: [{ serviceId: "a", model: "a-text" }, { serviceId: "b", model: "b-text" }, { serviceId: "c", model: "" }],
    },
    {
      scene: "learning-assistant",
      label: "网课解题",
      featureEnabled: true,
      fallbackModels: "",
      chain: [{ serviceId: "a", model: "a-low" }, { serviceId: "b", model: "b-learn" }],
      tierModels: { low: "a-low", high: "a-high", max: "a-max" },
    },
    { scene: "image-review", label: "图片审核", featureEnabled: true, fallbackModels: "", chain: [{ serviceId: "a", model: "a-image" }] },
  ];
  return { services: ["a", "b", "c"].map((id) => service(id, disabledIds.includes(id))), scenes };
}

const probe = (models: string[], ok = true): AiServiceProbe => ({
  serviceId: "x", ok, latencyMs: 10, checkedAt: new Date().toISOString(), endpoint: "", models, error: ok ? "" : "超时",
});

test("主服务停用时线路落到第一个没停用的回退上，全停用则没有线路", () => {
  const state = draft(["a"]);
  assert.deepEqual(sceneRouteStatus(state.scenes[0], state.services), { kind: "fallback", activeIndex: 1 });
  assert.deepEqual(sceneRouteStatus(state.scenes[2], state.services), { kind: "stopped", activeIndex: -1 });
  assert.deepEqual(sceneRouteStatus(draft().scenes[0], draft().services), { kind: "primary", activeIndex: 0 });
});

test("停用前能列出受影响的场景和各自的去向", () => {
  const impact = disableImpact(draft(), "a");
  assert.deepEqual(
    impact.map((item) => [item.scene.scene, item.next?.entry.serviceId ?? null, item.next?.model ?? null]),
    [["text-review", "b", "b-text"], ["learning-assistant", "b", "b-learn"], ["image-review", null, null]],
  );
  assert.deepEqual(disableImpact(draft(), "b"), [], "没在承载请求的服务停用后不影响任何场景");
});

test("把回退提到最前：原主线路带着自己的模型退到第二环", () => {
  const scene = draft().scenes[0];
  promoteEntry(scene, 1);
  assert.deepEqual(scene.chain, [
    { serviceId: "b", model: "b-text" },
    { serviceId: "a", model: "a-text" },
    { serviceId: "c", model: "" },
  ]);
});

test("没写模型的回退提到最前时沿用原来的主模型名", () => {
  const scene = draft().scenes[0];
  promoteEntry(scene, 2);
  assert.deepEqual(scene.chain[0], { serviceId: "c", model: "a-text" });
  assert.deepEqual(scene.chain[1], { serviceId: "a", model: "a-text" });
});

test("网课解题换主服务后三个档位都用新模型", () => {
  const scene = draft().scenes[1];
  promoteEntry(scene, 1);
  assert.deepEqual(scene.tierModels, { low: "b-learn", high: "b-learn", max: "b-learn" });
  assert.deepEqual(scene.chain, [{ serviceId: "b", model: "b-learn" }, { serviceId: "a", model: "a-low" }]);
});

test("批量改用一个服务：线路里没有它就插到最前，有就提前", () => {
  const state = draft();
  setPrimaryService(state.scenes[2], "c", "c-image");
  assert.deepEqual(state.scenes[2].chain, [{ serviceId: "c", model: "c-image" }, { serviceId: "a", model: "a-image" }]);
  setPrimaryService(state.scenes[0], "b", "b-text-pro");
  assert.deepEqual(state.scenes[0].chain.map((entry) => entry.serviceId), ["b", "a", "c"]);
  assert.equal(state.scenes[0].chain[0].model, "b-text-pro");
});

test("摘掉主线路时下一环接任，线路只剩一环时不能摘", () => {
  const state = draft();
  removeEntry(state.scenes[0], 0);
  assert.deepEqual(state.scenes[0].chain, [{ serviceId: "b", model: "b-text" }, { serviceId: "c", model: "" }]);
  removeEntry(state.scenes[2], 0);
  assert.equal(state.scenes[2].chain.length, 1);
});

test("删除服务会把它从所有线路里摘掉，只剩它的线路改由第一个服务承载", () => {
  const state = draft();
  removeService(state, "a");
  assert.deepEqual(state.services.map((item) => item.id), ["b", "c"]);
  assert.deepEqual(state.scenes[0].chain.map((entry) => entry.serviceId), ["b", "c"]);
  assert.deepEqual(state.scenes[2].chain, [{ serviceId: "b", model: "a-image" }]);
});

test("服务用量区分主用、备用和此刻实际承载", () => {
  assert.deepEqual(serviceUsage(draft(), "a"), { primary: 3, fallback: 0, active: 3 });
  assert.deepEqual(serviceUsage(draft(["a"]), "b"), { primary: 0, fallback: 2, active: 2 });
});

test("模型核对：目录里有、没有、读不到、还没读", () => {
  assert.equal(checkModel("GPT-X", probe(["gpt-x"])), "confirmed");
  assert.equal(checkModel("gpt-y", probe(["gpt-x"])), "missing");
  assert.equal(checkModel("gpt-x", probe([], false)), "unknown");
  assert.equal(checkModel("gpt-x", undefined), "unchecked");
});

test("换服务时优先用线路里已为它配的模型，其次是目录里的同名模型", () => {
  const scene = draft().scenes[0];
  assert.equal(suggestModel(scene, "b", probe([])), "b-text");
  assert.equal(suggestModel(draft().scenes[2], "b", probe(["a-image"])), "a-image");
  assert.equal(suggestModel(draft().scenes[2], "b", probe(["other"])), "");
});

test("全部实测覆盖线路上每一组服务和模型，包括网课解题的三个档位", () => {
  const keys = distinctRoutes(draft()).map((route) => `${route.serviceId}:${route.model}`);
  assert.deepEqual(keys.sort(), [
    "a:a-high", "a:a-image", "a:a-low", "a:a-max", "a:a-text", "b:b-learn", "b:b-text", "c:a-text",
  ]);
});

test("服务状态：实测失败优先，其次看最近请求，目录读不到只提醒", () => {
  const now = Date.now();
  const traffic = (patch: Partial<AiServiceTraffic>): AiServiceTraffic => ({
    serviceId: "a", success: 0, error: 0, lastSuccessAt: null, lastErrorAt: null, lastError: "", lastErrorModel: "", shared: false, ...patch,
  });
  const failedTest = { key: "k", ok: false, status: 402, latencyMs: 1, checkedAt: new Date(now).toISOString(), message: "余额不足" };
  assert.deepEqual(serviceHealth({ service: service("a", true), tests: [failedTest], now }), {
    level: "off", label: "已停用", detail: "实测仍然失败：余额不足",
  });
  assert.equal(
    serviceHealth({ service: service("a", true), tests: [{ ...failedTest, ok: true, status: 200 }], now }).detail,
    "实测已通过，可以恢复",
  );
  assert.deepEqual(serviceHealth({ service: service("a"), tests: [failedTest], now }), {
    level: "bad", label: "实测失败", detail: "HTTP 402 余额不足",
  });
  assert.equal(serviceHealth({
    service: service("a"),
    tests: [{ ...failedTest, checkedAt: new Date(now - 11 * 60_000).toISOString() }],
    now,
  }).level, "idle", "十分钟前的实测不再作数");
  assert.equal(serviceHealth({
    service: service("a"), tests: [],
    traffic: traffic({ success: 5, error: 1, lastSuccessAt: "2026-10-11T10:00:00.000Z", lastErrorAt: "2026-10-11T10:05:00.000Z", lastError: "HTTP 502" }),
  }).level, "bad");
  assert.equal(serviceHealth({
    service: service("a"), tests: [],
    traffic: traffic({ success: 2, error: 2, lastSuccessAt: "2026-10-11T10:06:00.000Z", lastErrorAt: "2026-10-11T10:05:00.000Z" }),
  }).level, "warn");
  assert.equal(serviceHealth({
    service: service("a"), tests: [],
    traffic: traffic({ success: 40, error: 1, lastSuccessAt: "2026-10-11T10:06:00.000Z", lastErrorAt: "2026-10-11T10:05:00.000Z" }),
  }).label, "正常");
  assert.equal(serviceHealth({ service: service("a"), tests: [], probe: probe([], false) }).level, "warn");
  assert.equal(serviceHealth({ service: service("a"), tests: [], probe: probe(["m"]) }).label, "可连接");
});

test("主线路没选模型时不让保存", () => {
  const state = draft();
  assert.deepEqual(draftProblems(state), []);
  state.scenes[1].tierModels!.max = "";
  state.scenes[2].chain[0].model = " ";
  assert.deepEqual(draftProblems(state), ["网课解题的主线路还没选模型", "图片审核的主线路还没选模型"]);
});
