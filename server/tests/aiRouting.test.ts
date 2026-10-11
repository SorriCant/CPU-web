import assert from "node:assert/strict";
import test from "node:test";
import { buildAiRoutingPatch, buildAiRoutingState } from "../src/services/aiRouting";
import { shouldFallbackToNextProvider } from "../src/services/modelFallback";
import {
  applyAiServiceAvailability,
  emptyAiServiceFallbacks,
  resolveAiServiceCandidatesForScene,
  type AiServiceConfig,
  type SiteConfig,
} from "../src/services/siteSettings";

function service(id: string, disabled = false): AiServiceConfig {
  return {
    id,
    name: id.toUpperCase(),
    provider: "openai",
    apiUrl: `https://${id}.example.com/v1/chat/completions`,
    apiKey: `key-${id}`,
    ...(disabled ? { disabled: true } : {}),
  };
}

/** 三个服务：所有场景主用 a；文字审核回退到 b（换模型）再到 c，拾间 AI 回退到 b（沿用主模型名）。 */
function config(disabledIds: string[] = []): SiteConfig {
  const services = ["a", "b", "c"].map((id) => service(id, disabledIds.includes(id)));
  const tier = { reasoningEffort: "low", pointMultiplier: 1, freeInUnlimited: true } as const;
  return {
    aiServices: services,
    aiServiceFallbacks: {
      ...emptyAiServiceFallbacks(),
      assistant: [{ serviceId: "b", model: "" }],
      "learning-assistant": [{ serviceId: "c", model: "c-learn" }],
      "text-review": [{ serviceId: "b", model: "b-text" }, { serviceId: "c", model: "c-text" }],
    },
    assistantServiceId: "a",
    learningAssistantServiceId: "a",
    smartPostServiceId: "a",
    songReviewServiceId: "a",
    aiReviewServiceId: "a",
    qqGroupAdReviewServiceId: "a",
    imageReviewServiceId: "a",
    videoReviewServiceId: "a",
    assistantModel: "a-chat",
    learningAssistantModel: "a-low",
    learningAssistantTiers: {
      low: { ...tier, model: "a-low" },
      high: { ...tier, model: "a-high" },
      max: { ...tier, model: "a-max" },
    },
    smartPostModel: "a-post",
    smartPostFallbackModels: "",
    songReviewModel: "a-song",
    songReviewFallbackModels: "",
    aiReviewEnabled: true,
    aiReviewProvider: "openai",
    aiReviewApiUrl: services[0].apiUrl,
    aiReviewApiKey: services[0].apiKey,
    aiReviewModel: "a-text",
    aiReviewFallbackModels: "a-text-mini",
    qqGroupAdReviewProvider: "openai",
    qqGroupAdReviewApiUrl: services[0].apiUrl,
    qqGroupAdReviewApiKey: services[0].apiKey,
    qqGroupAdReviewModel: "a-ad",
    qqGroupAdReviewFallbackModels: "",
    qqGroupAdReviewPeakServiceId: "b",
    qqGroupAdReviewPeakModel: "b-peak",
    imageReviewModel: "a-image",
    imageReviewFallbackModels: "",
    videoReviewModel: "a-video",
    videoReviewFallbackModels: "",
  } as unknown as SiteConfig;
}

test("没有停用的服务时配置原样返回", () => {
  const stored = config();
  assert.deepEqual(applyAiServiceAvailability(config()), stored);
});

test("主服务停用后由线路里的下一个服务连同它的模型顶上", () => {
  const effective = applyAiServiceAvailability(config(["a"]));
  assert.equal(effective.aiReviewServiceId, "b");
  assert.equal(effective.aiReviewApiUrl, "https://b.example.com/v1/chat/completions");
  assert.equal(effective.aiReviewApiKey, "key-b");
  assert.equal(effective.aiReviewModel, "b-text");
  assert.equal(effective.aiReviewFallbackModels, "", "原主服务的备选模型不带到新服务上");
  assert.deepEqual(effective.aiServiceFallbacks["text-review"], [{ serviceId: "c", model: "c-text" }]);

  const candidates = resolveAiServiceCandidatesForScene(effective, "text-review");
  assert.deepEqual(candidates.map((candidate) => candidate.serviceId), ["b", "c"]);
});

test("回退环没写模型时顶上来仍沿用主模型名", () => {
  const effective = applyAiServiceAvailability(config(["a"]));
  assert.equal(effective.assistantServiceId, "b");
  assert.equal(effective.assistantModel, "a-chat");
});

test("网课解题顶上来的服务对三个档位都用它的模型", () => {
  const effective = applyAiServiceAvailability(config(["a"]));
  assert.equal(effective.learningAssistantServiceId, "c");
  assert.deepEqual(
    Object.values(effective.learningAssistantTiers).map((tier) => tier.model),
    ["c-learn", "c-learn", "c-learn"],
  );
});

test("线路上的服务全部停用时不再给出可用的地址和密钥", () => {
  const effective = applyAiServiceAvailability(config(["a"]));
  assert.equal(effective.imageReviewServiceId, "a");
  assert.equal(effective.imageReviewApiUrl, "");
  assert.equal(effective.imageReviewApiKey, "");
  const [only, ...rest] = resolveAiServiceCandidatesForScene(effective, "image-review");
  assert.equal(rest.length, 0);
  assert.equal(only.apiUrl, "");
  assert.equal(only.apiKey, "");
});

test("只停用回退服务时主线路不变，回退里去掉它", () => {
  const effective = applyAiServiceAvailability(config(["b"]));
  assert.equal(effective.aiReviewServiceId, "a");
  assert.equal(effective.aiReviewModel, "a-text");
  assert.equal(effective.aiReviewFallbackModels, "a-text-mini");
  assert.deepEqual(effective.aiServiceFallbacks["text-review"], [{ serviceId: "c", model: "c-text" }]);
  assert.deepEqual(effective.aiServiceFallbacks.assistant, []);
});

test("高峰服务停用后高峰时段退回普通广告线路", () => {
  const effective = applyAiServiceAvailability(config(["b"]));
  assert.equal(effective.qqGroupAdReviewPeakServiceId, "a");
  assert.equal(effective.qqGroupAdReviewPeakModel, "");
});

test("直接按存储的配置取候选服务时同样跳过停用的服务", () => {
  const candidates = resolveAiServiceCandidatesForScene(config(["a"]), "text-review");
  assert.deepEqual(
    candidates.map((candidate) => [candidate.serviceId, candidate.model]),
    [["b", "b-text"], ["c", "c-text"]],
  );
});

test("线路状态把主服务、主模型和回退拼成一条链", () => {
  const state = buildAiRoutingState(config());
  const text = state.scenes.find((scene) => scene.scene === "text-review")!;
  assert.deepEqual(text.chain, [
    { serviceId: "a", model: "a-text" },
    { serviceId: "b", model: "b-text" },
    { serviceId: "c", model: "c-text" },
  ]);
  const learning = state.scenes.find((scene) => scene.scene === "learning-assistant")!;
  assert.deepEqual(learning.tierModels, { low: "a-low", high: "a-high", max: "a-max" });
});

test("线路保存换算回各场景的字段，原样保存不改变配置", () => {
  const stored = config();
  const state = buildAiRoutingState(stored);
  const scenes = Object.fromEntries(state.scenes.map((scene) => [scene.scene, scene]));
  const { patch, assistantModel, learningTiers } = buildAiRoutingPatch(stored, { services: state.services, scenes });
  assert.equal(patch.aiReviewServiceId, "a");
  assert.equal(patch.aiReviewModel, "a-text");
  assert.equal(assistantModel, "a-chat");
  assert.deepEqual(patch.aiServiceFallbacks, stored.aiServiceFallbacks);
  assert.deepEqual(learningTiers, stored.learningAssistantTiers);
});

test("把回退环提到最前就是换主服务", () => {
  const stored = config();
  const state = buildAiRoutingState(stored);
  const scenes = Object.fromEntries(state.scenes.map((scene) => [scene.scene, scene]));
  scenes["text-review"] = {
    ...scenes["text-review"],
    chain: [
      { serviceId: "c", model: "c-text" },
      { serviceId: "a", model: "a-text" },
    ],
  };
  const { patch } = buildAiRoutingPatch(stored, { services: state.services, scenes });
  assert.equal(patch.aiReviewServiceId, "c");
  assert.equal(patch.aiReviewModel, "c-text");
  assert.deepEqual(patch.aiServiceFallbacks?.["text-review"], [{ serviceId: "a", model: "a-text" }]);
});

test("线路保存拒绝缺模型、重复服务和不存在的服务", () => {
  const stored = config();
  const state = buildAiRoutingState(stored);
  const withTextChain = (chain: Array<{ serviceId: string; model: string }>) => {
    const scenes = Object.fromEntries(state.scenes.map((scene) => [scene.scene, scene]));
    scenes["text-review"] = { ...scenes["text-review"], chain };
    return { services: state.services, scenes };
  };
  assert.throws(() => buildAiRoutingPatch(stored, withTextChain([{ serviceId: "a", model: " " }])), /缺少模型/);
  assert.throws(() => buildAiRoutingPatch(stored, withTextChain([
    { serviceId: "a", model: "m" },
    { serviceId: "a", model: "n" },
  ])), /出现了两次/);
  assert.throws(() => buildAiRoutingPatch(stored, withTextChain([{ serviceId: "gone", model: "m" }])), /不存在的服务/);
});

test("密钥失效和欠费也换下一个服务，请求本身的问题不换", () => {
  assert.equal(shouldFallbackToNextProvider(401, "Incorrect API key provided"), true);
  assert.equal(shouldFallbackToNextProvider(402, ""), true);
  assert.equal(shouldFallbackToNextProvider(403, "Insufficient Balance"), true);
  assert.equal(shouldFallbackToNextProvider(400, "invalid image input"), false);
  assert.equal(shouldFallbackToNextProvider(403, "content policy"), false);
});
