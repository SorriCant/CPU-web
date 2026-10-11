import { existsSync, openSync, readSync, closeSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { findAgentRepositoryRoot } from "./agentSelfUpdate";

/**
 * Agent 自己对“上一次远程更新”的说法。主服务只把它当作旁证：
 * 更新是否生效，以节点重连时上报的构建提交为准。
 */
export type AgentUpdateReport = {
  phase: "idle" | "running" | "success" | "failed";
  /** 进行到哪一步（排队 / 下载校验 / 切换版本），仅 running 时有。 */
  step?: "queued" | "preparing" | "switching";
  requestedAt?: string;
  finishedAt?: string;
  /** 更新器这次要装的提交。 */
  commit?: string;
  message?: string;
  rolledBack?: boolean;
  alreadyCurrent?: boolean;
};

const RUNNING_STALE_MS = 30 * 60_000;
const LOG_TAIL_BYTES = 16 * 1024;
const MESSAGE_LIMIT = 300;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function isoOrUndefined(value: unknown) {
  return typeof value === "string" && ISO_PATTERN.test(value) ? value : undefined;
}

function shortMessage(value: unknown) {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MESSAGE_LIMIT) : undefined;
}

/** 校验并裁剪一份来自 Agent 的报告；主服务收到握手或轮询结果时都过这一遍。 */
export function normalizeAgentUpdateReport(value: unknown): AgentUpdateReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const phase = input.phase;
  if (phase !== "idle" && phase !== "running" && phase !== "success" && phase !== "failed") return null;
  const step = input.step === "queued" || input.step === "preparing" || input.step === "switching" ? input.step : undefined;
  return {
    phase,
    ...(phase === "running" && step ? { step } : {}),
    ...(isoOrUndefined(input.requestedAt) ? { requestedAt: input.requestedAt as string } : {}),
    ...(isoOrUndefined(input.finishedAt) ? { finishedAt: input.finishedAt as string } : {}),
    ...(typeof input.commit === "string" && /^[a-f0-9]{40}$/.test(input.commit) ? { commit: input.commit } : {}),
    ...(shortMessage(input.message) ? { message: shortMessage(input.message) } : {}),
    ...(input.rolledBack === true ? { rolledBack: true } : {}),
    ...(input.alreadyCurrent === true ? { alreadyCurrent: true } : {}),
  };
}

function mtimeIso(file: string) {
  try { return new Date(statSync(file).mtimeMs).toISOString(); } catch { return undefined; }
}

/** systemd 托管安装：更新器把阶段写进请求标记旁边的状态文件。 */
function readManagedReport(requestFile: string, now: number): AgentUpdateReport {
  const statusFile = path.join(path.dirname(requestFile), "agent-remote-update.status.json");
  let stored: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(readFileSync(statusFile, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch { /* 还没有更新过，或文件正在被替换 */ }

  const queuedAt = existsSync(requestFile) ? mtimeIso(requestFile) : undefined;
  const requestedAt = isoOrUndefined(stored?.requestedAt);
  // 请求标记比状态文件新：更新器还没接手这次请求。
  if (queuedAt && (!requestedAt || Date.parse(queuedAt) > Date.parse(requestedAt))) {
    return { phase: "running", step: "queued", requestedAt: queuedAt };
  }
  if (!stored) return { phase: "idle" };

  const base = {
    requestedAt,
    commit: stored.commit,
    finishedAt: stored.finishedAt,
  };
  if (stored.phase === "preparing" || stored.phase === "switching") {
    if (requestedAt && now - Date.parse(requestedAt) > RUNNING_STALE_MS) {
      return normalizeAgentUpdateReport({ ...base, phase: "failed", message: "更新器超过 30 分钟没有写入结果" })!;
    }
    return normalizeAgentUpdateReport({ ...base, phase: "running", step: stored.phase })!;
  }
  if (stored.phase === "success") {
    return normalizeAgentUpdateReport({ ...base, phase: "success", alreadyCurrent: stored.alreadyCurrent === true })!;
  }
  if (stored.phase === "failed") {
    return normalizeAgentUpdateReport({
      ...base,
      phase: "failed",
      message: stored.recoveryError ? `${stored.message}；回滚失败：${stored.recoveryError}` : stored.message,
      rolledBack: stored.rolledBack === true,
    })!;
  }
  return { phase: "idle" };
}

function readTail(file: string) {
  try {
    const size = statSync(file).size;
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    const descriptor = openSync(file, "r");
    try { readSync(descriptor, buffer, 0, length, size - length); } finally { closeSync(descriptor); }
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

/** Git 仓库安装：更新脚本的输出进日志，执行器在首尾各写一行带时间的标记。 */
function readRepositoryReport(repositoryRoot: string, now: number): AgentUpdateReport {
  const logDirectory = path.join(repositoryRoot, "server", "logs");
  const lockPath = path.join(logDirectory, "agent-remote-update.lock");
  if (existsSync(lockPath)) {
    let lockedAt: string | undefined;
    try { lockedAt = isoOrUndefined(readFileSync(lockPath, "utf8").trim()); } catch { /* 锁刚被清理 */ }
    const startedAt = lockedAt ?? mtimeIso(lockPath);
    if (startedAt && now - Date.parse(startedAt) < RUNNING_STALE_MS) {
      return { phase: "running", step: "preparing", requestedAt: startedAt };
    }
  }

  let requestedAt: string | undefined;
  let outcome: AgentUpdateReport | null = null;
  for (const line of readTail(path.join(logDirectory, "agent-remote-update.log")).split(/\r?\n/)) {
    const match = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] (.*)$/.exec(line);
    if (!match) continue;
    const [, at, text] = match;
    if (text.startsWith("收到主服务远程更新指令")) {
      requestedAt = at;
      outcome = null;
      continue;
    }
    const exited = /^更新脚本退出，code=(-?\d+)/.exec(text);
    if (exited) {
      outcome = exited[1] === "0"
        ? { phase: "success", finishedAt: at }
        : { phase: "failed", finishedAt: at, message: `更新脚本退出码 ${exited[1]}，详见节点上的 server/logs/agent-remote-update.log` };
      continue;
    }
    const crashed = /^更新执行器失败: (.*)$/.exec(text);
    if (crashed) outcome = { phase: "failed", finishedAt: at, message: crashed[1] };
  }
  if (!outcome) return { phase: "idle" };
  return normalizeAgentUpdateReport({ ...outcome, requestedAt }) ?? { phase: "idle" };
}

export function readAgentUpdateReport(
  options: { env?: NodeJS.ProcessEnv; now?: number; repositoryRoot?: string } = {},
): AgentUpdateReport {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  try {
    const managedRequestFile = env.JWXT_AGENT_UPDATE_REQUEST_FILE;
    if (managedRequestFile) {
      if (!path.isAbsolute(managedRequestFile)) return { phase: "idle" };
      return readManagedReport(managedRequestFile, now);
    }
    return readRepositoryReport(options.repositoryRoot ?? findAgentRepositoryRoot(), now);
  } catch {
    // 读不到更新记录不影响 Agent 上线。
    return { phase: "idle" };
  }
}
