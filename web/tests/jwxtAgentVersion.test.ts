import assert from "node:assert/strict";
import test from "node:test";
import {
  agentUpdateLine,
  agentUpdateToast,
  agentVersionTag,
  formatElapsed,
  missingAgentFeatures,
  shortCommit,
} from "../src/views/admin/jwxtAgentVersion";

const OLD = "a".repeat(40);
const NEW = "b1c2d3e4".padEnd(40, "0");
const KNOWN = ["jwxt.records", "agent.update-status"];

test("a node is compared with the main site's build, and only when both are known", () => {
  assert.deepEqual(agentVersionTag({ ready: true, buildCommit: NEW }, NEW), { label: "与主站同版本", type: "success" });
  assert.deepEqual(agentVersionTag({ ready: true, buildCommit: OLD }, NEW), { label: "与主站版本不同", type: "warning" });
  assert.deepEqual(agentVersionTag({ ready: true, buildCommit: "" }, NEW), { label: "没有上报版本", type: "info" });
  // 主站自己的版本未知（开发环境）或节点离线时不下判断。
  assert.equal(agentVersionTag({ ready: true, buildCommit: OLD }, ""), null);
  assert.equal(agentVersionTag({ ready: false, buildCommit: OLD }, NEW), null);
  assert.equal(shortCommit(NEW), "b1c2d3e");
});

test("missing features are listed for an old node but not guessed through an old gateway", () => {
  assert.deepEqual(missingAgentFeatures({ ready: true, features: KNOWN }, KNOWN), []);
  assert.equal(missingAgentFeatures({ ready: true, features: [] }, KNOWN).length, 2);
  assert.match(missingAgentFeatures({ ready: true, features: ["agent.update-status"] }, KNOWN)[0], /选课、教室/);
  assert.deepEqual(missingAgentFeatures({ ready: true }, KNOWN), []);
  assert.deepEqual(missingAgentFeatures({ ready: false, features: [] }, KNOWN), []);
});

test("a running update says what it is waiting for and for how long", () => {
  const line = agentUpdateLine({ status: "pending", step: "preparing", requestedAt: 1_000_000 }, 1_000_000 + 95_000);
  assert.deepEqual(line, { tone: "info", busy: true, text: "更新中：正在下载并校验构建制品，已等 1 分 35 秒" });
  assert.equal(formatElapsed(59_400), "59 秒");
  assert.equal(formatElapsed(120_000), "2 分");
});

test("every outcome reads as a verdict, not as 'request sent'", () => {
  const at = new Date(2026, 9, 11, 14, 5).getTime();
  assert.equal(
    agentUpdateLine({ status: "succeeded", finishedAt: at, fromCommit: OLD, toCommit: NEW }, at)?.text,
    "10-11 14:05 更新成功，现在是 b1c2d3e（原 aaaaaaa）",
  );
  assert.match(agentUpdateLine({ status: "current", finishedAt: at, toCommit: NEW }, at)!.text, /已经是最新构建 b1c2d3e，没有换版本/);
  const failed = agentUpdateLine({ status: "failed", finishedAt: at, message: "npm ci failed", rolledBack: true }, at)!;
  assert.deepEqual([failed.tone, failed.text], ["danger", "10-11 14:05 更新失败，已回到原版本：npm ci failed"]);
  assert.match(agentUpdateLine({ status: "unchanged", toCommit: OLD }, at)!.text, /没有生效.*版本仍是 aaaaaaa/);
  assert.match(agentUpdateLine({ status: "timeout" }, at)!.text, /既没重启也没回报结果/);
  assert.equal(agentUpdateLine({ status: "none" }, at), null);
  assert.equal(agentUpdateLine(undefined, at), null);
});

test("the admin is told once when an update reaches a verdict", () => {
  assert.deepEqual(agentUpdateToast("校内节点 01", { status: "succeeded", toCommit: NEW }), {
    type: "success", text: "校内节点 01 已更新到 b1c2d3e",
  });
  assert.equal(agentUpdateToast("校内节点 01", { status: "failed", message: "下载失败" })?.type, "error");
  assert.equal(agentUpdateToast("校内节点 01", { status: "timeout" })?.type, "warning");
  assert.equal(agentUpdateToast("校内节点 01", { status: "pending" }), null);
});
