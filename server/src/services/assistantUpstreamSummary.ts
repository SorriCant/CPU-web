import { fetchAiModelCatalog } from "./aiModelCatalog";
import { getSiteConfig, isAiProviderReady, resolveAiServiceCandidatesForScene } from "./siteSettings";

export type AssistantUpstreamSummary = {
  total: number;
  online: number;
  primaryOnline: boolean;
};

type AssistantUpstreamConfig = Parameters<typeof resolveAiServiceCandidatesForScene>[0] & {
  aiReviewEnabled: boolean;
  assistantModel: string;
};

type AssistantUpstream = {
  provider: string;
  apiUrl: string;
  apiKey: string;
  model: string;
};

const REFRESH_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 5 * 60_000;
const CATALOG_TIMEOUT_MS = 3_000;
const FIRST_RESULT_WAIT_MS = 1_500;

/**
 * /api/ready 对外公布的拾间 AI 线路概况，供部署在别处的状态监控读取。
 * 只给数量和主线路是否可用：服务名称、地址、模型和密钥仍然只在管理后台可见。
 * 统计口径与拾间 AI 的请求路径一致，即主服务加上已配置的回退服务里，填好了地址、凭据和模型的那些；
 * 在线指读得到该服务的模型目录、并且目录里有它将收到的模型，与切换到回退服务前的检查是同一个判断。
 * AI 总开关关闭时没有可用线路，三项都是零值。
 */
export async function summarizeAssistantUpstreams(
  config: AssistantUpstreamConfig,
  isOnline: (upstream: AssistantUpstream) => Promise<boolean>,
): Promise<AssistantUpstreamSummary> {
  if (!config.aiReviewEnabled) return { total: 0, online: 0, primaryOnline: false };
  const candidates = resolveAiServiceCandidatesForScene(config, "assistant").map((candidate, index) => ({
    primary: index === 0,
    provider: candidate.provider,
    apiUrl: candidate.apiUrl,
    apiKey: candidate.apiKey,
    model: String(candidate.model || config.assistantModel || "").trim(),
  }));
  const serving = candidates.filter((candidate) => isAiProviderReady(candidate));
  const online = await Promise.all(serving.map((candidate) => isOnline(candidate).catch(() => false)));
  return {
    total: serving.length,
    online: online.filter(Boolean).length,
    primaryOnline: serving.some((candidate, index) => candidate.primary && online[index]),
  };
}

async function hasModelInCatalog(upstream: AssistantUpstream) {
  const catalog = await fetchAiModelCatalog({
    provider: upstream.provider,
    apiUrl: upstream.apiUrl,
    apiKey: upstream.apiKey,
    timeoutMs: CATALOG_TIMEOUT_MS,
  });
  return catalog.models.some((model) => model.trim().toLowerCase() === upstream.model.toLowerCase());
}

/**
 * 读取最近一次的概况，过期时在后台重新探测，不让上游的快慢影响就绪检查的耗时。
 * 只有手里没有可用结果（进程刚启动，或很久没人读取）时才短暂等待；等不到返回 null，状态监控会显示“未取得状态数据”。
 */
export function createAssistantUpstreamReader(
  summarize: () => Promise<AssistantUpstreamSummary>,
  options: { now?: () => number; firstResultWaitMs?: number } = {},
) {
  const now = options.now ?? Date.now;
  const firstResultWaitMs = options.firstResultWaitMs ?? FIRST_RESULT_WAIT_MS;
  let snapshot: { summary: AssistantUpstreamSummary; at: number } | null = null;
  let refreshing: Promise<void> | null = null;

  const refresh = () => {
    refreshing ??= Promise.resolve()
      .then(summarize)
      .then((summary) => {
        snapshot = { summary, at: now() };
      })
      .catch(() => undefined)
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  return async function readSummary(): Promise<AssistantUpstreamSummary | null> {
    const age = snapshot ? now() - snapshot.at : Infinity;
    if (age >= REFRESH_INTERVAL_MS) {
      const pending = refresh();
      if (age >= STALE_AFTER_MS) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([pending, new Promise<void>((resolve) => { timer = setTimeout(resolve, firstResultWaitMs); })]);
        clearTimeout(timer);
      }
    }
    return snapshot && now() - snapshot.at < STALE_AFTER_MS ? snapshot.summary : null;
  };
}

export const readAssistantUpstreamSummary = createAssistantUpstreamReader(
  () => summarizeAssistantUpstreams(getSiteConfig(), hasModelInCatalog),
);
