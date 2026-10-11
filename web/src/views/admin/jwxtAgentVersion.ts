// 教务节点“现在跑的是哪个版本、这次更新成没成”的文字说明；页面只管排版。

export type AgentUpdateStatus = "none" | "pending" | "succeeded" | "current" | "unchanged" | "failed" | "timeout";

export interface AgentUpdateView {
  status: AgentUpdateStatus;
  requestedAt?: number;
  finishedAt?: number;
  fromCommit?: string;
  toCommit?: string;
  step?: "queued" | "preparing" | "switching" | "restarting" | "reconnected";
  message?: string;
  rolledBack?: boolean;
}

export interface AgentVersionState {
  ready: boolean;
  buildCommit?: string;
  /** 由旧版网关转发时拿不到这一项，此时不判断“缺什么”。 */
  features?: string[];
}

export type Tone = "success" | "warning" | "danger" | "info";

const FEATURE_LABELS: Record<string, string> = {
  "jwxt.records": "选课、教室、等级考试、成绩单等新数据",
  "agent.update-status": "回报更新进度和失败原因",
};

const STEP_LABELS: Record<NonNullable<AgentUpdateView["step"]>, string> = {
  queued: "节点已收到指令，等更新器接手",
  preparing: "正在下载并校验构建制品",
  switching: "正在切换版本并重启",
  restarting: "节点已断开，等它重新连上",
  reconnected: "节点重连过，版本还没变，继续等",
};

export function shortCommit(commit?: string) {
  return commit ? commit.slice(0, 7) : "";
}

export function agentVersionTag(state: AgentVersionState, serverCommit: string): { label: string; type: Tone } | null {
  if (!state.ready) return null;
  if (!state.buildCommit) return { label: "没有上报版本", type: "info" };
  if (!serverCommit) return null;
  return state.buildCommit === serverCommit
    ? { label: "与主站同版本", type: "success" }
    : { label: "与主站版本不同", type: "warning" };
}

/** 主站用得到、但这个节点的版本还不认得的功能。 */
export function missingAgentFeatures(state: AgentVersionState, knownFeatures: string[]) {
  if (!state.ready || !Array.isArray(state.features)) return [];
  return knownFeatures
    .filter((feature) => !state.features!.includes(feature))
    .map((feature) => FEATURE_LABELS[feature] ?? feature);
}

export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${minutes} 分`;
}

export function formatClock(time?: number) {
  if (!time) return "";
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function agentUpdateLine(update: AgentUpdateView | undefined, now: number): { tone: Tone; text: string; busy: boolean } | null {
  if (!update || update.status === "none") return null;
  const at = formatClock(update.finishedAt);
  const from = shortCommit(update.fromCommit);
  const to = shortCommit(update.toCommit);
  switch (update.status) {
    case "pending": {
      const waited = update.requestedAt ? `，已等 ${formatElapsed(now - update.requestedAt)}` : "";
      return { tone: "info", busy: true, text: `更新中：${STEP_LABELS[update.step ?? "queued"]}${waited}` };
    }
    case "succeeded":
      return {
        tone: "success",
        busy: false,
        text: `${at} 更新成功${to ? `，现在是 ${to}` : ""}${from ? `（原 ${from}）` : ""}`,
      };
    case "current":
      return { tone: "success", busy: false, text: `${at} 检查过，已经是最新构建${to ? ` ${to}` : ""}，没有换版本` };
    case "failed":
      return {
        tone: "danger",
        busy: false,
        text: `${at} 更新失败${update.rolledBack ? "，已回到原版本" : ""}：${update.message || "节点没有给出原因"}`,
      };
    case "unchanged":
      return {
        tone: "warning",
        busy: false,
        text: `更新没有生效：等了 25 分钟，节点重连过但版本仍是 ${to || from || "原来的"}。请到节点上看更新日志`,
      };
    case "timeout":
      return {
        tone: "warning",
        busy: false,
        text: "更新没有结论：等了 25 分钟，节点既没重启也没回报结果。请到节点上看更新日志",
      };
    default:
      return null;
  }
}

/** 一次更新出了结论时给管理员的一句话提示；仍在进行或没有记录时不提示。 */
export function agentUpdateToast(name: string, update: AgentUpdateView): { type: "success" | "warning" | "error"; text: string } | null {
  if (update.status === "succeeded") return { type: "success", text: `${name} 已更新到 ${shortCommit(update.toCommit) || "新版本"}` };
  if (update.status === "current") return { type: "success", text: `${name} 已经是最新构建，没有换版本` };
  if (update.status === "failed") return { type: "error", text: `${name} 更新失败：${update.message || "节点没有给出原因"}` };
  if (update.status === "unchanged" || update.status === "timeout") return { type: "warning", text: `${name} 的更新没有生效，请到节点上查看日志` };
  return null;
}
