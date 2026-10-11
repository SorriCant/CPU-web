import { computed, onBeforeUnmount, reactive, watch } from "vue";
import { jwxtApi } from "@/api/jwxt";
import { useJwxtStore } from "@/stores/jwxt";
import { hydrateCalendar } from "@/views/schedule/calendar";
import type { CalendarResult } from "@/views/schedule/types";

/**
 * 某个学期的校历，给课表网格标日期和当前周用。读不到不算错：网格照样能画，只是没有日期。
 * `settled` 在这个学期的校历有了结果（拿到或者没拿到）之后为真。
 */
export function useTermCalendar(semester: () => string, isActive: () => boolean) {
  const jwxt = useJwxtStore();
  const state = reactive<{ semester: string; calendar: CalendarResult | null }>({ semester: "", calendar: null });
  let requested = "";
  let disposed = false;

  async function load(value: string) {
    requested = value;
    let calendar: CalendarResult | null = null;
    try {
      const response: any = await jwxt.withSessionRetry(() => jwxtApi.calendar({ semester: value }, { silent: true }));
      const parsed = hydrateCalendar(response?.parsed as CalendarResult | null);
      if (parsed?.weeks?.length && (!parsed.currentSemester || parsed.currentSemester === value)) calendar = parsed;
    } catch {
      calendar = null;
    }
    if (disposed || requested !== value) return;
    state.calendar = calendar;
    state.semester = value;
  }

  watch([semester, isActive], ([value, active]) => {
    if (!active || !value || value === requested) return;
    void load(value);
  }, { immediate: true });
  onBeforeUnmount(() => {
    disposed = true;
  });

  const settled = computed(() => Boolean(semester()) && state.semester === semester());
  const calendar = computed(() => (settled.value ? state.calendar : null));
  return { calendar, settled };
}
