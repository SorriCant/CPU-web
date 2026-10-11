import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCachedJson, setCachedJson } from "./cache";
import { buildRedisKey } from "./redis";
import type { AgentUpdateReport } from "./agentUpdateStatus";

/**
 * 主服务这一侧对“远程更新”的跟踪。
 *
 * Agent 接受指令只代表请求已下发。更新有没有生效，看的是节点之后有没有带着
 * 另一个构建提交重新连上来；Agent 自己回报的更新器结果用来解释“为什么没变”。
 */
export type AgentUpdateAttempt = {
  agentId: string;
  /** 主服务时钟。 */
  requestedAt: number;
  /** Agent 时钟（接受指令时返回），只用来和 Agent 自己的报告比先后。 */
  agentRequestedAt?: string;
  fromCommit: string;
  report?: AgentUpdateReport | null;
  settled?: AgentUpdateView;
};

export type AgentUpdateStatus =
  | "none"       // 没有更新记录
  | "pending"    // 已下发，还没有结论
  | "succeeded"  // 节点带着新的提交重连了
  | "current"    // 更新器确认已经是最新，没有换版本
  | "unchanged"  // 等到超时：节点重连过，但提交没变，也没有回报原因
  | "failed"     // 更新器回报失败
  | "timeout";   // 等到超时：节点一直没有重连

export type AgentUpdateView = {
  status: AgentUpdateStatus;
  requestedAt?: number;
  finishedAt?: number;
  fromCommit?: string;
  toCommit?: string;
  step?: "queued" | "preparing" | "switching" | "restarting" | "reconnected";
  message?: string;
  rolledBack?: boolean;
};

type AgentRuntimeState = {
  ready: boolean;
  connectedAt: number | null;
  buildCommit: string;
  lastUpdate?: AgentUpdateReport | null;
};

export const AGENT_UPDATE_TIMEOUT_MS = 25 * 60_000;
const ATTEMPT_TTL_MS = 24 * 60 * 60_000;
const RECENT_REPORT_MS = 24 * 60 * 60_000;
const CLOCK_SLACK_MS = 2_000;
const TERMINAL: AgentUpdateStatus[] = ["succeeded", "current", "unchanged", "failed", "timeout"];

function attemptKey(agentId: string) {
  return buildRedisKey("jwxt-agent-update", agentId);
}

function time(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Agent 的报告是不是在说这一次更新（按 Agent 自己的时钟比）。 */
function reportBelongsToAttempt(report: AgentUpdateReport | null | undefined, attempt: AgentUpdateAttempt) {
  if (!report || report.phase === "idle") return false;
  const since = time(attempt.agentRequestedAt);
  if (!since) return report.phase === "running";
  return Math.max(time(report.requestedAt), time(report.finishedAt)) >= since - CLOCK_SLACK_MS;
}

export function describeAgentUpdate(input: {
  attempt: AgentUpdateAttempt | null;
  state: AgentRuntimeState;
  now?: number;
}): AgentUpdateView {
  const now = input.now ?? Date.now();
  const { attempt, state } = input;

  if (!attempt) {
    // 没有经过后台下发（例如在节点上手动更新）时，只转述 Agent 最近一天内的说法。
    const report = state.lastUpdate;
    const finishedAt = time(report?.finishedAt);
    if (report?.phase === "running") return { status: "pending", step: report.step, requestedAt: time(report.requestedAt) || undefined };
    if (!report || !finishedAt || now - finishedAt > RECENT_REPORT_MS) return { status: "none" };
    if (report.phase === "failed") {
      return { status: "failed", finishedAt, message: report.message, rolledBack: report.rolledBack };
    }
    if (report.phase === "success") {
      return report.alreadyCurrent
        ? { status: "current", finishedAt }
        : { status: "succeeded", finishedAt, toCommit: state.buildCommit || undefined };
    }
    return { status: "none" };
  }

  if (attempt.settled) return attempt.settled;

  const base = { requestedAt: attempt.requestedAt, fromCommit: attempt.fromCommit || undefined };
  const reconnected = state.ready && (state.connectedAt ?? 0) > attempt.requestedAt;
  // 重连后以握手带来的报告为准；没重连就用轮询到的那份。
  const report = reconnected && state.lastUpdate ? state.lastUpdate : attempt.report ?? state.lastUpdate;
  const relevant = reportBelongsToAttempt(report, attempt) ? report! : null;
  const finishedAt = time(relevant?.finishedAt) || (reconnected ? state.connectedAt ?? now : now);

  if (reconnected && state.buildCommit && attempt.fromCommit && state.buildCommit !== attempt.fromCommit) {
    return { ...base, status: "succeeded", finishedAt: state.connectedAt ?? now, toCommit: state.buildCommit };
  }
  if (relevant?.phase === "failed") {
    return { ...base, status: "failed", finishedAt, message: relevant.message, rolledBack: relevant.rolledBack };
  }
  if (relevant?.phase === "success") {
    // 更新器说成功而提交没变：本来就是最新的构建。
    return { ...base, status: "current", finishedAt, toCommit: state.buildCommit || undefined };
  }
  // 单凭“重连了但提交没变”不下结论：可能只是网络抖动或主站重启，更新器还在准备制品。
  if (now - attempt.requestedAt > AGENT_UPDATE_TIMEOUT_MS) {
    return reconnected
      ? { ...base, status: "unchanged", finishedAt: now, toCommit: state.buildCommit || undefined }
      : { ...base, status: "timeout", finishedAt: now };
  }
  return {
    ...base,
    status: "pending",
    step: relevant?.phase === "running"
      ? relevant.step ?? "preparing"
      : !state.ready ? "restarting" : reconnected ? "reconnected" : "queued",
  };
}

export function isAgentUpdateSettled(view: AgentUpdateView) {
  return TERMINAL.includes(view.status);
}

export async function getAgentUpdateAttempt(agentId: string) {
  try { return await getCachedJson<AgentUpdateAttempt>(attemptKey(agentId)); } catch { return null; }
}

async function saveAttempt(attempt: AgentUpdateAttempt) {
  await setCachedJson(attemptKey(attempt.agentId), attempt, ATTEMPT_TTL_MS);
}

export async function recordAgentUpdateRequest(input: {
  agentId: string;
  fromCommit: string;
  agentRequestedAt?: string;
  alreadyScheduled?: boolean;
  now?: number;
}) {
  const existing = await getAgentUpdateAttempt(input.agentId);
  // 节点说“已经在更新中”时沿用上一条还没出结论的记录，不重置计时。
  if (input.alreadyScheduled && existing && !existing.settled) return existing;
  const attempt: AgentUpdateAttempt = {
    agentId: input.agentId,
    requestedAt: input.now ?? Date.now(),
    agentRequestedAt: input.agentRequestedAt,
    fromCommit: input.fromCommit,
  };
  await saveAttempt(attempt);
  return attempt;
}

/** 给出当前结论；一旦有了结论就记下来，之后节点再重连也不会改写这次更新的结果。 */
export async function resolveAgentUpdate(
  agentId: string,
  state: AgentRuntimeState,
  polled?: AgentUpdateReport | null,
): Promise<AgentUpdateView> {
  let attempt = await getAgentUpdateAttempt(agentId);
  if (attempt && !attempt.settled && polled) attempt = { ...attempt, report: polled };
  const view = describeAgentUpdate({ attempt, state: polled && !attempt ? { ...state, lastUpdate: polled } : state });
  if (attempt && !attempt.settled) {
    if (isAgentUpdateSettled(view)) await saveAttempt({ ...attempt, settled: view }).catch(() => undefined);
    else if (polled) await saveAttempt(attempt).catch(() => undefined);
  }
  return view;
}

let serverCommitCache: string | null = null;

/** 主站自己的构建提交，由 CI 写进 dist；开发环境没有这个文件。 */
export function readServerBuildCommit(directory = path.resolve(__dirname, "..")) {
  if (serverCommitCache !== null && directory === path.resolve(__dirname, "..")) return serverCommitCache;
  let commit = "";
  try {
    const file = path.join(directory, "deployment-commit.txt");
    if (existsSync(file)) {
      const value = readFileSync(file, "utf8").trim();
      if (/^[a-f0-9]{40}$/.test(value)) commit = value;
    }
  } catch { /* 读不到就当作未知 */ }
  if (directory === path.resolve(__dirname, "..")) serverCommitCache = commit;
  return commit;
}
