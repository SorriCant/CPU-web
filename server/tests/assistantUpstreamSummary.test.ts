import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantUpstreamReader, summarizeAssistantUpstreams } from "../src/services/assistantUpstreamSummary";

const service = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `服务 ${id}`,
  provider: "deepseek",
  apiUrl: `https://${id}.example/v1/chat/completions`,
  apiKey: `key-${id}`,
  ...overrides,
});

const config = (overrides: Record<string, unknown> = {}) => ({
  aiReviewEnabled: true,
  assistantModel: "qwen3:8b",
  aiServices: [service("main", { provider: "ollama", apiUrl: "http://ollama.example:11434", apiKey: "" }), service("backup"), service("spare")],
  assistantServiceId: "main",
  aiServiceFallbacks: { assistant: [{ serviceId: "backup", model: "gpt-fallback" }, { serviceId: "spare", model: "" }] },
  ...overrides,
}) as unknown as Parameters<typeof summarizeAssistantUpstreams>[0];

test("the public summary follows the assistant route and exposes nothing but counts", async () => {
  const asked: string[] = [];
  const summary = await summarizeAssistantUpstreams(config(), async (upstream) => {
    asked.push(`${upstream.apiUrl} ${upstream.model}`);
    return !upstream.apiUrl.includes("spare");
  });
  assert.deepEqual(summary, { total: 3, online: 2, primaryOnline: true });
  assert.deepEqual(asked, [
    "http://ollama.example:11434 qwen3:8b",
    "https://backup.example/v1/chat/completions gpt-fallback",
    "https://spare.example/v1/chat/completions qwen3:8b",
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /example|key-|qwen|gpt|服务/u);
});

test("a dead primary with a live fallback is reported as such, and a failing probe counts as offline", async () => {
  const summary = await summarizeAssistantUpstreams(config(), async (upstream) => {
    if (upstream.apiUrl.includes("ollama")) throw new Error("connect ECONNREFUSED");
    return upstream.apiUrl.includes("backup");
  });
  assert.deepEqual(summary, { total: 3, online: 1, primaryOnline: false });
});

test("services without credentials are not counted, and nothing is probed while AI is switched off", async () => {
  const unconfigured = config({ aiServices: [service("main", { apiKey: "" }), service("backup")] });
  assert.deepEqual(
    await summarizeAssistantUpstreams(unconfigured, async () => true),
    { total: 1, online: 1, primaryOnline: false },
  );
  assert.deepEqual(
    await summarizeAssistantUpstreams(config({ aiReviewEnabled: false }), async () => assert.fail("must not probe")),
    { total: 0, online: 0, primaryOnline: false },
  );
});

test("readiness reads the last result and refreshes it in the background", async () => {
  let clock = 1_000_000;
  let probes = 0;
  const read = createAssistantUpstreamReader(async () => {
    probes += 1;
    return { total: 2, online: probes, primaryOnline: true };
  }, { now: () => clock });
  assert.deepEqual(await read(), { total: 2, online: 1, primaryOnline: true });
  clock += 29_000;
  assert.equal((await read())?.online, 1);
  assert.equal(probes, 1);
  clock += 1_000;
  assert.equal((await read())?.online, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(probes, 2);
  assert.equal((await read())?.online, 2);
});

test("a slow or failing probe never holds readiness up, and an old result is not passed off as current", async () => {
  let clock = 1_000_000;
  let release: (summary: { total: number; online: number; primaryOnline: boolean }) => void = () => undefined;
  let fail = false;
  const read = createAssistantUpstreamReader(() => (fail
    ? Promise.reject(new Error("settings unavailable"))
    : new Promise((resolve) => { release = resolve; })), { now: () => clock, firstResultWaitMs: 20 });
  assert.equal(await read(), null);
  release({ total: 1, online: 1, primaryOnline: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(await read(), { total: 1, online: 1, primaryOnline: true });
  fail = true;
  clock += 5 * 60_000;
  assert.equal(await read(), null);
});
