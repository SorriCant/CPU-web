import { onBeforeUnmount, onMounted, reactive, watch } from "vue";
import { jwxtApi } from "@/api/jwxt";
import { useJwxtStore } from "@/stores/jwxt";
import type { RecordKind } from "./recordCards";

export interface RecordState<T = any> {
  loading: boolean;
  error: string;
  data: T | null;
  params: Record<string, string>;
}

function errorMessage(error: unknown) {
  const message = (error as { message?: string } | null)?.message || "";
  return message && !/status code|timeout|Network Error/i.test(message) ? message : "教务数据读取失败，请稍后重试";
}

/**
 * 读取一类 /api/jwxt/records 数据。面板第一次可见时才请求；
 * 出错后不自动重试，等用户点“重试”，免得教务不通时反复打扰。
 */
export function useRecord<T = any>(
  kind: RecordKind,
  isActive: () => boolean,
  options: { auto?: boolean; initialParams?: () => Record<string, string> } = {},
) {
  const jwxt = useJwxtStore();
  const state = reactive<RecordState<T>>({ loading: false, error: "", data: null, params: {} }) as RecordState<T>;
  let seq = 0;
  let disposed = false;

  async function load(params: Record<string, string> = state.params, force = false) {
    const current = ++seq;
    state.loading = true;
    state.error = "";
    try {
      const response = await jwxt.withSessionRetry(() => jwxtApi.records(
        { kind, ...params, ...(force ? { refresh: "1" } : {}) },
        { silent: true },
      ));
      if (disposed || current !== seq) return;
      state.data = response.parsed as T;
      state.params = params;
    } catch (error) {
      if (disposed || current !== seq) return;
      state.error = errorMessage(error);
    } finally {
      if (!disposed && current === seq) state.loading = false;
    }
  }

  function ensure() {
    if (options.auto === false || !isActive()) return;
    if (state.data || state.loading || state.error) return;
    void load(options.initialParams?.() ?? {});
  }

  function onNativeRefresh() {
    if (!isActive() || (options.auto === false && !state.data)) return;
    (window as any).__cpuNativeRefreshHandled = true;
    void load(state.params, true);
  }

  watch(isActive, ensure);
  onMounted(() => {
    disposed = false;
    window.addEventListener("cpu-native-refresh", onNativeRefresh);
    ensure();
  });
  onBeforeUnmount(() => {
    disposed = true;
    seq += 1;
    window.removeEventListener("cpu-native-refresh", onNativeRefresh);
  });

  return { state, load, reload: (force = true) => load(state.params, force) };
}
