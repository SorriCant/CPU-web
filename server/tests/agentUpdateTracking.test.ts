import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeAgentUpdateReport, readAgentUpdateReport } from "../src/services/agentUpdateStatus";
import {
  AGENT_UPDATE_TIMEOUT_MS,
  describeAgentUpdate,
  isAgentUpdateSettled,
  readServerBuildCommit,
  type AgentUpdateAttempt,
} from "../src/services/agentUpdateTracker";

const OLD = "a".repeat(40);
const NEW = "b".repeat(40);
const T0 = Date.parse("2026-10-11T08:00:00.000Z");

function temp(prefix: string) {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function attempt(extra: Partial<AgentUpdateAttempt> = {}): AgentUpdateAttempt {
  return { agentId: "campus-01", requestedAt: T0, agentRequestedAt: "2026-10-11T08:00:01.000Z", fromCommit: OLD, ...extra };
}

// ---------- 主服务侧：给一次更新下结论 ----------

test("an accepted request stays pending until the node comes back", () => {
  const view = describeAgentUpdate({
    attempt: attempt(),
    state: { ready: true, connectedAt: T0 - 60_000, buildCommit: OLD },
    now: T0 + 30_000,
  });
  assert.deepEqual([view.status, view.step, view.fromCommit], ["pending", "queued", OLD]);
  assert.equal(isAgentUpdateSettled(view), false);

  const restarting = describeAgentUpdate({
    attempt: attempt(),
    state: { ready: false, connectedAt: null, buildCommit: "" },
    now: T0 + 90_000,
  });
  assert.deepEqual([restarting.status, restarting.step], ["pending", "restarting"]);
});

test("reconnecting with another build commit is what counts as updated", () => {
  const view = describeAgentUpdate({
    attempt: attempt(),
    state: { ready: true, connectedAt: T0 + 240_000, buildCommit: NEW },
    now: T0 + 250_000,
  });
  assert.deepEqual(
    [view.status, view.fromCommit, view.toCommit, view.finishedAt],
    ["succeeded", OLD, NEW, T0 + 240_000],
  );
  assert.equal(isAgentUpdateSettled(view), true);
});

test("the updater's own failure report explains an unchanged node", () => {
  const view = describeAgentUpdate({
    attempt: attempt({
      report: {
        phase: "failed",
        requestedAt: "2026-10-11T08:00:02.000Z",
        finishedAt: "2026-10-11T08:01:30.000Z",
        message: "Verified GitHub artifact is unavailable",
        rolledBack: true,
      },
    }),
    state: { ready: true, connectedAt: T0 - 60_000, buildCommit: OLD },
    now: T0 + 120_000,
  });
  assert.deepEqual(
    [view.status, view.message, view.rolledBack],
    ["failed", "Verified GitHub artifact is unavailable", true],
  );
});

test("a report left over from an earlier update is not mistaken for this one", () => {
  const view = describeAgentUpdate({
    attempt: attempt(),
    state: {
      ready: true,
      connectedAt: T0 - 60_000,
      buildCommit: OLD,
      lastUpdate: { phase: "failed", requestedAt: "2026-10-10T08:00:00.000Z", finishedAt: "2026-10-10T08:02:00.000Z", message: "昨天的失败" },
    },
    now: T0 + 30_000,
  });
  assert.equal(view.status, "pending");
});

test("success without a new commit means the node was already current", () => {
  const view = describeAgentUpdate({
    attempt: attempt({
      report: { phase: "success", requestedAt: "2026-10-11T08:00:02.000Z", finishedAt: "2026-10-11T08:00:20.000Z", alreadyCurrent: true },
    }),
    state: { ready: true, connectedAt: T0 - 60_000, buildCommit: OLD },
    now: T0 + 30_000,
  });
  assert.deepEqual([view.status, view.toCommit], ["current", OLD]);
});

test("a reconnect with the same commit is not a verdict until the timeout", () => {
  const state = { ready: true, connectedAt: T0 + 20_000, buildCommit: OLD };
  // 网络抖动或主站重启都会让节点重连，更新器可能还在下载制品。
  const early = describeAgentUpdate({ attempt: attempt(), state, now: T0 + 60_000 });
  assert.deepEqual([early.status, early.step], ["pending", "reconnected"]);

  const late = describeAgentUpdate({ attempt: attempt(), state, now: T0 + AGENT_UPDATE_TIMEOUT_MS + 1 });
  assert.equal(late.status, "unchanged");

  const silent = describeAgentUpdate({
    attempt: attempt(),
    state: { ready: true, connectedAt: T0 - 60_000, buildCommit: OLD },
    now: T0 + AGENT_UPDATE_TIMEOUT_MS + 1,
  });
  assert.equal(silent.status, "timeout");
});

test("a settled result is not rewritten by later reconnects", () => {
  const settled = { status: "failed" as const, requestedAt: T0, message: "下载失败" };
  const view = describeAgentUpdate({
    attempt: attempt({ settled }),
    state: { ready: true, connectedAt: T0 + 3_600_000, buildCommit: NEW },
    now: T0 + 3_700_000,
  });
  assert.deepEqual(view, settled);
});

test("without a tracked request only a recent report from the node is relayed", () => {
  const state = (lastUpdate: Parameters<typeof describeAgentUpdate>[0]["state"]["lastUpdate"]) => ({
    ready: true, connectedAt: T0, buildCommit: NEW, lastUpdate,
  });
  assert.equal(describeAgentUpdate({ attempt: null, state: state(null), now: T0 }).status, "none");
  const manual = describeAgentUpdate({
    attempt: null,
    state: state({ phase: "success", finishedAt: "2026-10-11T07:30:00.000Z" }),
    now: T0,
  });
  assert.deepEqual([manual.status, manual.toCommit], ["succeeded", NEW]);
  const stale = describeAgentUpdate({
    attempt: null,
    state: state({ phase: "failed", finishedAt: "2026-10-01T07:30:00.000Z", message: "很久以前" }),
    now: T0,
  });
  assert.equal(stale.status, "none");
});

test("the server build commit comes from the CI marker and is empty without one", () => {
  const directory = temp("cpu-server-commit-");
  try {
    assert.equal(readServerBuildCommit(directory), "");
    writeFileSync(path.join(directory, "deployment-commit.txt"), `${NEW}\n`);
    assert.equal(readServerBuildCommit(directory), NEW);
    writeFileSync(path.join(directory, "deployment-commit.txt"), "not-a-commit");
    assert.equal(readServerBuildCommit(directory), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------- Agent 侧：读更新器留下的记录 ----------

test("reports from a node are validated and trimmed before the server keeps them", () => {
  assert.equal(normalizeAgentUpdateReport(null), null);
  assert.equal(normalizeAgentUpdateReport({ phase: "exploded" }), null);
  const report = normalizeAgentUpdateReport({
    phase: "failed",
    step: "switching",
    requestedAt: "yesterday",
    finishedAt: "2026-10-11T08:01:30.000Z",
    commit: "zzz",
    message: `line one\n${"x".repeat(500)}`,
    rolledBack: "yes",
    secret: "must not pass through",
  });
  assert.deepEqual(Object.keys(report!).sort(), ["finishedAt", "message", "phase"]);
  assert.equal(report!.message!.length, 300);
  assert.doesNotMatch(report!.message!, /\n/);
});

test("a managed node reports queued, running, success and failure from its status file", () => {
  const directory = temp("cpu-managed-agent-");
  const requestFile = path.join(directory, "agent-remote-update.request");
  const statusFile = path.join(directory, "agent-remote-update.status.json");
  const env = { JWXT_AGENT_UPDATE_REQUEST_FILE: requestFile } as NodeJS.ProcessEnv;
  const read = (now: number) => readAgentUpdateReport({ env, now });
  try {
    assert.deepEqual(read(T0), { phase: "idle" });

    writeFileSync(requestFile, "2026-10-11T08:00:00.000Z\n");
    utimesSync(requestFile, T0 / 1000, T0 / 1000);
    assert.deepEqual(read(T0 + 1000), { phase: "running", step: "queued", requestedAt: "2026-10-11T08:00:00.000Z" });

    writeFileSync(statusFile, JSON.stringify({ phase: "preparing", commit: NEW, requestedAt: "2026-10-11T08:00:05.000Z" }));
    assert.deepEqual(read(T0 + 60_000), {
      phase: "running", step: "preparing", requestedAt: "2026-10-11T08:00:05.000Z", commit: NEW,
    });
    // 更新器死掉没写结果：半小时后不再当作“进行中”。
    assert.equal(read(T0 + 31 * 60_000).phase, "failed");

    rmSync(requestFile);
    writeFileSync(statusFile, JSON.stringify({
      phase: "failed", commit: NEW, requestedAt: "2026-10-11T08:00:05.000Z", finishedAt: "2026-10-11T08:02:00.000Z",
      message: "npm ci failed", rolledBack: true, recoveryError: "restart failed",
    }));
    assert.deepEqual(read(T0 + 180_000), {
      phase: "failed", requestedAt: "2026-10-11T08:00:05.000Z", finishedAt: "2026-10-11T08:02:00.000Z",
      commit: NEW, message: "npm ci failed；回滚失败：restart failed", rolledBack: true,
    });

    writeFileSync(statusFile, JSON.stringify({
      phase: "success", commit: NEW, requestedAt: "2026-10-11T08:00:05.000Z", finishedAt: "2026-10-11T08:03:00.000Z", alreadyCurrent: true,
    }));
    assert.deepEqual(read(T0 + 200_000), {
      phase: "success", requestedAt: "2026-10-11T08:00:05.000Z", finishedAt: "2026-10-11T08:03:00.000Z",
      commit: NEW, alreadyCurrent: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a repository install reports from its lock file and the last run in the log", () => {
  const repositoryRoot = temp("cpu-repo-agent-");
  const logs = path.join(repositoryRoot, "server", "logs");
  mkdirSync(logs, { recursive: true });
  const read = (now: number) => readAgentUpdateReport({ env: {} as NodeJS.ProcessEnv, now, repositoryRoot });
  try {
    assert.deepEqual(read(T0), { phase: "idle" });

    writeFileSync(path.join(logs, "agent-remote-update.log"), [
      "[2026-10-10T08:00:00.000Z] 收到主服务远程更新指令，正在启动独立 worker，平台=linux",
      "[2026-10-10T08:03:00.000Z] 更新脚本退出，code=0",
      "",
      "[2026-10-11T08:00:02.000Z] 收到主服务远程更新指令，正在启动独立 worker，平台=linux",
      "[2026-10-11T08:00:03.000Z] 独立 worker 已启动",
      "fatal: unable to access 'https://github.com/': Could not resolve host",
      "[2026-10-11T08:00:40.000Z] 更新脚本退出，code=1",
      "",
    ].join("\n"));
    const failed = read(T0 + 60_000);
    assert.deepEqual([failed.phase, failed.requestedAt, failed.finishedAt], [
      "failed", "2026-10-11T08:00:02.000Z", "2026-10-11T08:00:40.000Z",
    ]);
    assert.match(failed.message!, /退出码 1/);

    writeFileSync(path.join(logs, "agent-remote-update.lock"), "2026-10-11T09:00:00.000Z\n");
    assert.deepEqual(read(T0 + 3_600_000 + 5_000), {
      phase: "running", step: "preparing", requestedAt: "2026-10-11T09:00:00.000Z",
    });
    // 过期的锁不算进行中，回到日志里最后一次的结果。
    assert.equal(read(T0 + 3_600_000 + 40 * 60_000).phase, "failed");
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
