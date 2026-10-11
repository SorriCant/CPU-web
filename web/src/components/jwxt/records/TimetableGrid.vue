<template>
  <!-- 检索出来的排课按「我的课表」的周网格画：同一个网格组件，用的也是自己在课表页选的风格和配色。 -->
  <div class="tt-grid" :class="{ 'no-dates': !weekDates.length }">
    <div class="tt-bar">
      <div v-if="$slots.lead" class="tt-lead"><slot name="lead" /></div>
      <div v-if="!pending" class="tt-pager">
        <button type="button" :disabled="week <= 1" aria-label="上一周" @click="week -= 1"><el-icon><ArrowLeft /></el-icon></button>
        <b>第 {{ week }} 周<small v-if="weekRange">{{ weekRange }}</small></b>
        <button type="button" :disabled="week >= weekCount" aria-label="下一周" @click="week += 1"><el-icon><ArrowRight /></el-icon></button>
      </div>
      <button
        v-if="!pending && currentWeek"
        type="button"
        class="tt-this-week"
        :class="{ active: week === currentWeek }"
        :aria-pressed="week === currentWeek"
        @click="week = currentWeek"
      >本周</button>
      <div v-if="$slots.trail" class="tt-trail"><slot name="trail" /></div>
    </div>

    <!-- 校历还没回来时先不画：当前周和日期都要靠它。 -->
    <div v-if="pending" v-loading="true" class="tt-wait" />
    <template v-else>
    <p class="tt-note">
      这一周 <b>{{ weekCourseCount }}</b> 节课<template v-if="hasOffWeek">，淡色的是这一周不上的课</template>。点课程看教室、老师和周次。
    </p>

    <div class="tt-canvas" :style="canvasStyle">
      <StyledWeekGrid
        :visual-style="visualStyle"
        :palette="palette"
        :dark="appearance.isDark"
        :days="days"
        :clocks="clocks"
        :now-minutes="display.highlightNow ? nowMinutes : null"
        :show-teacher="display.showTeacher || wide"
        :show-slot-time="display.showSlotTime"
        :compact="display.compact"
        @course="(block) => (quickLook = block)"
        @off-week="(block) => (quickLook = block)"
      />
    </div>

    <p v-if="unplaced.length" class="tt-note">
      另有 {{ unplaced.length }} 条排课没有固定的星期或节次，网格里画不出来，切到“列表”可以看到。
    </p>
    </template>

    <CourseQuickLook
      :block="quickLook"
      :schedule-line="quickLookLine"
      :accent="quickLookAccent"
      :owner-label="ownerLabel"
      :page-style="canvasStyle"
      @close="quickLook = null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import { normalizeScheduleTheme, scheduleThemeCssVars, scheduleThemeDarkCssVars } from "@/components/jwxt/scheduleTheme";
import { useAppearanceStore } from "@/stores/appearance";
import CourseQuickLook from "@/views/schedule/CourseQuickLook.vue";
import StyledWeekGrid from "@/views/schedule/StyledWeekGrid.vue";
import { calendarWeekForNumber, normalizeCalendarWeekDays, shortDate, todayKey } from "@/views/schedule/calendar";
import { readStoredScheduleDisplay } from "@/views/schedule/displaySettings";
import { blockScheduleLine, shanghaiMinutes } from "@/views/schedule/nowIndicator";
import { officialScheduleCalendar } from "@/views/schedule/officialCalendar";
import { SCHEDULE_THEME_STORAGE_KEY, scheduleSurfaceCssVars } from "@/views/schedule/pageVars";
import {
  classicCourseTone,
  readStoredScheduleStyle,
  rgbToCss,
  scheduleStyleCanvas,
  scheduleStyleCourseTone,
  scheduleStyleCssVars,
} from "@/views/schedule/scheduleStyle";
import { smallSlots } from "@/views/schedule/slots";
import type { CalendarResult, WeekCourseBlock } from "@/views/schedule/types";
import type { TimetableRow } from "./recordCards";
import { timetableBlocks, timetableWeekCount, timetableWeekCourseCount, timetableWeekDays } from "./timetableGrid";

const props = withDefaults(defineProps<{
  rows: TimetableRow[];
  /** 这个学期的校历；没有时日期栏只写星期，从第 1 周开始看。 */
  calendar?: CalendarResult | null;
  /** 校历还在读。 */
  pending?: boolean;
  /** 课程速览底下的一行说明，例如“药化24201505 的课表”。 */
  ownerLabel?: string;
  /** 把上课班级写进课程速览（按教师、教室、课程检索时）。 */
  withClasses?: boolean;
}>(), { calendar: null, pending: false, ownerLabel: "", withClasses: false });

const appearance = useAppearanceStore();

// 风格、配色和显示开关都读课表页存下来的那一份，两边看起来是同一张课表。
function readStoredTheme() {
  try {
    return localStorage.getItem(SCHEDULE_THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}
const visualStyle = readStoredScheduleStyle();
const palette = normalizeScheduleTheme(readStoredTheme());
const display = readStoredScheduleDisplay();
const canvasStyle = computed(() => {
  const dark = appearance.isDark;
  const canvas = scheduleStyleCanvas(visualStyle, dark);
  return {
    ...scheduleThemeCssVars(palette),
    ...(dark ? scheduleThemeDarkCssVars(palette) : {}),
    ...scheduleSurfaceCssVars({ dark }),
    ...(canvas ? { "--schedule-page-bg": rgbToCss(canvas) } : {}),
    ...scheduleStyleCssVars({ style: visualStyle, palette, dark }),
  };
});

const calendar = computed(() => officialScheduleCalendar(props.calendar));
const clocks = computed(() => {
  const configured = calendar.value?.periods;
  return configured?.length ? configured.map((item) => ({ no: item.id, start: item.start, end: item.end })) : smallSlots;
});
const maxSlot = computed(() => Math.max(...clocks.value.map((slot) => slot.no)));
const placed = computed(() => timetableBlocks(props.rows, { maxSlot: maxSlot.value, withClasses: props.withClasses }));
const blocks = computed(() => placed.value.blocks);
const unplaced = computed(() => placed.value.unplaced);

// MARK: 周次

const today = ref(todayKey());
const weekCount = computed(() => timetableWeekCount(blocks.value, calendar.value?.weeks?.length ?? 0));
/** 今天所在的教学周；学期外或者没有校历时是 0。 */
const currentWeek = computed(() => {
  const value = Number(calendar.value?.currentWeek ?? 0);
  return value >= 1 && value <= weekCount.value ? value : 0;
});
const week = ref(currentWeek.value || 1);
// 校历到了、或者换了学期（校历跟着换），回到那个学期的当前周；
// 只是换了班级、换了关键词就留在正在看的那一周。
watch(() => [props.pending, calendar.value?.currentSemester ?? ""], () => {
  if (!props.pending) week.value = currentWeek.value || 1;
});
watch(weekCount, (count) => {
  if (week.value > count) week.value = count;
});

const weekDates = computed(() => {
  const days = normalizeCalendarWeekDays(calendarWeekForNumber(calendar.value, week.value)?.days ?? []);
  return days.length >= 7 && days.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) ? days : [];
});
const weekRange = computed(() => (weekDates.value.length ? `${shortDate(weekDates.value[0])} - ${shortDate(weekDates.value[6])}` : ""));
const holidays = computed(() => (calendar.value?.adjustments ?? []).filter((item) => item.kind === "off").map((item) => item.date));
const days = computed(() => timetableWeekDays({
  blocks: blocks.value,
  week: week.value,
  dates: weekDates.value,
  today: today.value,
  holidays: holidays.value,
}));
const weekCourseCount = computed(() => timetableWeekCourseCount(blocks.value, week.value));
const hasOffWeek = computed(() => days.value.some((day) => day.offWeekPieces?.length));

// MARK: 「现在」和宽屏

const nowMinutes = ref<number | null>(shanghaiMinutes());
const wide = ref(false);
let timer = 0;
let media: MediaQueryList | null = null;
function syncWide() {
  wide.value = Boolean(media?.matches);
}
onMounted(() => {
  timer = window.setInterval(() => {
    nowMinutes.value = shanghaiMinutes();
    today.value = todayKey();
  }, 30_000);
  media = window.matchMedia?.("(min-width: 900px)") ?? null;
  media?.addEventListener?.("change", syncWide);
  syncWide();
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  media?.removeEventListener?.("change", syncWide);
});

// MARK: 课程速览

const quickLook = ref<WeekCourseBlock | null>(null);
const quickLookLine = computed(() => (quickLook.value ? blockScheduleLine(quickLook.value, clocks.value) : ""));
const quickLookAccent = computed(() => {
  const name = quickLook.value?.course.name;
  if (!name) return "var(--schedule-accent)";
  if (visualStyle === "classic") {
    const tone = classicCourseTone(name, palette, appearance.isDark);
    return appearance.isDark ? tone.border : tone.text;
  }
  return scheduleStyleCourseTone(name, palette, appearance.isDark).accent;
});
// 换了一份结果，开着的速览就对不上了。
watch(() => props.rows, () => {
  quickLook.value = null;
});
</script>

<style scoped lang="scss">
.tt-grid { display: flex; min-width: 0; flex-direction: column; gap: 10px; }

.tt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tt-lead, .tt-trail { display: flex; flex: 0 0 auto; }
.tt-trail { margin-left: auto; }
.tt-wait { min-height: 220px; }
.tt-pager {
  display: grid;
  min-width: 0;
  height: 38px;
  flex: 1 1 180px;
  max-width: 300px;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  align-items: center;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-subtle);
  color: var(--cpu-text);
}
.tt-pager b {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  font-size: var(--cpu-fs-s);
  line-height: 1.15;
  white-space: nowrap;
}
.tt-pager small { color: var(--cpu-text-secondary); font-size: 11px; font-weight: 500; }
.tt-pager button,
.tt-this-week {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  touch-action: manipulation;
}
.tt-pager button { display: grid; height: 100%; place-items: center; color: var(--cpu-text-secondary); }
.tt-pager button:hover:not(:disabled) { color: var(--cpu-primary); }
.tt-pager button:disabled { cursor: not-allowed; opacity: 0.35; }
.tt-this-week {
  height: 38px;
  flex: 0 0 auto;
  padding: 0 14px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-subtle);
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-s);
  font-weight: 500;
}
.tt-this-week:hover { color: var(--cpu-primary); }
.tt-this-week.active { border-color: var(--cpu-primary); background: var(--cpu-primary-soft); color: var(--cpu-primary); }
.tt-pager button:focus-visible,
.tt-this-week:focus-visible { outline: 2px solid var(--cpu-primary-soft); outline-offset: 2px; }

.tt-note { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }
.tt-note b { color: var(--cpu-text); font-weight: 600; }

// 课表自己的底色：格子和课程色是按这张底调的，和课表页一样。
.tt-canvas {
  overflow: hidden;
  padding: 8px;
  border-radius: var(--cpu-radius-l);
  background: var(--schedule-page-bg);
  color: var(--schedule-text);
}
.tt-canvas :deep(.ss-week) { max-width: none; min-height: 0; }
// 没有校历就没有日期，日期栏只留星期。
.no-dates .tt-canvas :deep(.ss-date-number),
.no-dates .tt-canvas :deep(.ss-date-line) { display: none; }

@media (max-width: 640px) {
  // 手机上分两行：切换和导出一行，翻周和“本周”一行。
  .tt-trail { order: 1; }
  .tt-pager { order: 2; max-width: none; }
  .tt-this-week { order: 3; }
  .tt-canvas { margin: 0 -4px; padding: 4px; }
}
</style>
