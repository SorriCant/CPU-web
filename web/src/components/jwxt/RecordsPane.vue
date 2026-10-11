<template>
  <div class="records-pane">
    <div class="rec-note">
      <span>以下信息整理自教务系统，最终请以学校和学院通知为准。</span>
      <AcademicDataSourceBadge source="modern" />
    </div>

    <nav class="rec-nav" role="tablist" aria-label="更多教务数据">
      <button
        v-for="item in sections"
        :key="item.key"
        data-cpu-button="option"
        type="button"
        role="tab"
        :class="{ active: current === item.key }"
        :aria-selected="current === item.key"
        @click="select(item.key)"
      >{{ item.label }}</button>
    </nav>

    <section class="rec-body" :aria-busy="entry.loading">
      <header class="rec-head">
        <div class="rec-head-text">
          <b>{{ currentSection.label }}</b>
          <span>{{ currentSection.hint }}</span>
        </div>
        <div class="rec-head-tools">
          <label v-if="semesterOptions.length > 1" class="rec-semester">
            <span>学期</span>
            <select :value="entry.data?.semester" :disabled="entry.loading" @change="onSemesterChange">
              <option v-for="item in semesterOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <button
            v-if="current !== 'timetable-search' || entry.data"
            data-cpu-button="option"
            type="button"
            class="rec-refresh"
            :disabled="entry.loading"
            @click="reload(true)"
          >{{ entry.loading ? "加载中…" : "刷新" }}</button>
        </div>
      </header>

      <form v-if="current === 'timetable-search'" class="rec-search" @submit.prevent="runSearch">
        <div class="rec-scope" role="group" aria-label="检索范围">
          <button
            v-for="item in searchScopes"
            :key="item.value"
            data-cpu-button="option"
            type="button"
            :class="{ active: search.scope === item.value }"
            :aria-pressed="search.scope === item.value"
            @click="search.scope = item.value"
          >{{ item.label }}</button>
        </div>
        <input
          v-model.trim="search.keyword"
          class="rec-search-input"
          type="search"
          maxlength="30"
          :placeholder="searchPlaceholder"
          :aria-label="searchPlaceholder"
        />
        <button data-cpu-button="primary" type="submit" class="rec-search-go" :disabled="entry.loading || search.keyword.length < 2">检索</button>
      </form>

      <div v-if="entry.error" class="rec-error" role="alert">
        <span>{{ entry.error }}</span>
        <button data-cpu-button="option" type="button" :disabled="entry.loading" @click="reload(true)">重试</button>
      </div>

      <div v-if="entry.loading && !entry.data" class="rec-loading">正在读取教务数据…</div>

      <template v-else-if="current === 'free-rooms'">
        <FreeRoomsSection :data="entry.data" @change-date="onDateChange" />
      </template>

      <template v-else-if="current === 'transcript'">
        <dl v-if="entry.data" class="rec-summary">
          <div><dt>平均成绩</dt><dd>{{ formatNumber(entry.data.averageScore) }}</dd></div>
          <div><dt>平均学分绩</dt><dd>{{ formatNumber(entry.data.creditWeightedAverage) }}</dd></div>
          <div v-if="entry.data.gradePoint"><dt>平均学分绩点</dt><dd>{{ formatNumber(entry.data.gradePoint) }}</dd></div>
          <div><dt>所修总学分</dt><dd>{{ formatNumber(entry.data.totalCredits) }}</dd></div>
          <div><dt>所修门数</dt><dd>{{ formatNumber(entry.data.courseCount) }}</dd></div>
        </dl>
        <p v-if="entry.data?.computedAt" class="rec-tip">以上为教务系统自己的统计，统计时间 {{ entry.data.computedAt }}；与成绩页按课程重新计算的口径可能不同。</p>
        <div class="rec-transcript">
          <div>
            <b>成绩单 PDF</b>
            <p>由学校教务系统现场生成，包含全部学期的课程成绩。文件只下载到你的设备，本站不保存。</p>
          </div>
          <button data-cpu-button="primary" type="button" :disabled="transcriptBusy" @click="downloadTranscript">
            {{ transcriptBusy ? "正在生成…" : "下载成绩单" }}
          </button>
        </div>
        <p v-if="transcriptError" class="rec-error" role="alert"><span>{{ transcriptError }}</span></p>
      </template>

      <template v-else-if="entry.data">
        <p v-if="headline" class="rec-tip">{{ headline }}</p>
        <RecordCardList :groups="groups" :empty-text="currentSection.empty" />
      </template>

      <p v-else-if="current === 'timetable-search' && !entry.error" class="rec-tip">
        可以按课程名、教师姓名或教室号查全校本学期的排课，例如“药剂学”“E104”。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import AcademicDataSourceBadge from "@/components/jwxt/AcademicDataSourceBadge.vue";
import FreeRoomsSection from "@/components/jwxt/records/FreeRoomsSection.vue";
import RecordCardList from "@/components/jwxt/records/RecordCardList.vue";
import { recordGroups, type RecordKind } from "@/components/jwxt/records/recordCards";
import { jwxtApi } from "@/api/jwxt";
import { useJwxtStore } from "@/stores/jwxt";

type SectionKey = Exclude<RecordKind, "grade-summary"> | "transcript";
type SearchScope = "course" | "teacher" | "classroom";

interface SectionEntry {
  loading: boolean;
  error: string;
  data: any | null;
  params: Record<string, string>;
  seq: number;
}

const props = defineProps<{ active?: boolean }>();
const jwxt = useJwxtStore();

const sections: Array<{ key: SectionKey; label: string; hint: string; empty: string }> = [
  { key: "free-rooms", label: "空教室", hint: "全校教室当天各时段的占用情况", empty: "" },
  { key: "timetable-search", label: "课表检索", hint: "按课程、教师或教室查全校排课", empty: "没有找到匹配的排课" },
  { key: "term-courses", label: "本学期课程", hint: "教学班、考核方式和选课人数", empty: "这个学期还没有课程" },
  { key: "enrollment", label: "选课记录", hint: "已选课程和退课记录", empty: "这个学期没有选课记录" },
  { key: "textbooks", label: "教材", hint: "本学期课程使用的教材", empty: "这个学期没有教材记录" },
  { key: "level-exams", label: "等级考试", hint: "四六级等等级考试成绩", empty: "没有等级考试记录" },
  { key: "graduation-audit", label: "毕业审核", hint: "已得学分与尚未修读的计划内课程", empty: "" },
  { key: "retake-options", label: "重修", hint: "已修课程的最好成绩，以及本学期是否开课", empty: "没有可重修的课程" },
  { key: "major-transfer", label: "转专业", hint: "各专业拟接收人数与考核方式", empty: "当前没有转专业计划" },
  { key: "election-rounds", label: "选课安排", hint: "选课轮次与起止时间", empty: "当前没有选课轮次" },
  { key: "student-status", label: "学籍", hint: "学籍预警与异动记录", empty: "" },
  { key: "transcript", label: "成绩单", hint: "学校统计的成绩汇总与成绩单导出", empty: "" },
];
const searchScopes: Array<{ value: SearchScope; label: string; placeholder: string }> = [
  { value: "course", label: "课程", placeholder: "课程名或课程编号" },
  { value: "teacher", label: "教师", placeholder: "教师姓名" },
  { value: "classroom", label: "教室", placeholder: "教室号，例如 E104" },
];

const current = ref<SectionKey>("free-rooms");
const entries = reactive<Record<string, SectionEntry>>({});
const search = reactive<{ scope: SearchScope; keyword: string }>({ scope: "course", keyword: "" });
const transcriptBusy = ref(false);
const transcriptError = ref("");
let disposed = false;

function entryOf(key: SectionKey) {
  if (!entries[key]) entries[key] = { loading: false, error: "", data: null, params: {}, seq: 0 };
  return entries[key];
}

const entry = computed(() => entryOf(current.value));
const currentSection = computed(() => sections.find((item) => item.key === current.value) ?? sections[0]);
const semesterOptions = computed<Array<{ value: string; label: string }>>(() => (
  Array.isArray(entry.value.data?.semesters) ? entry.value.data.semesters : []
));
const searchPlaceholder = computed(() => searchScopes.find((item) => item.value === search.scope)?.placeholder ?? "");
const groups = computed(() => (
  current.value === "transcript" || current.value === "free-rooms"
    ? []
    : recordGroups(current.value, entry.value.data)
));
const headline = computed(() => {
  const data = entry.value.data;
  if (!data) return "";
  if (current.value === "term-courses" && Array.isArray(data.list) && data.list.length) {
    return `${data.semester} 共 ${data.list.length} 门，${data.credits ?? 0} 学分。`;
  }
  if (current.value === "retake-options" && data.window) return `重修报名时间：${data.window}`;
  if (current.value === "timetable-search" && Array.isArray(data.list)) {
    return data.truncated
      ? `共 ${data.total} 条排课，先显示前 ${data.list.length} 条；把关键词写得更具体可以缩小范围。`
      : `共 ${data.list.length} 条排课。`;
  }
  if (current.value === "major-transfer" && Array.isArray(data.list) && data.list.length) {
    return "报名人数为教务系统当前登记的数字，申请条件以学院通知为准。";
  }
  return "";
});

function kindOf(key: SectionKey): RecordKind {
  return key === "transcript" ? "grade-summary" : key;
}

function errorMessage(error: unknown) {
  const message = (error as { message?: string } | null)?.message || "";
  return message && !/status code|timeout|Network Error/i.test(message) ? message : "教务数据读取失败，请稍后重试";
}

async function load(key: SectionKey, params: Record<string, string>, force = false) {
  const target = entryOf(key);
  const seq = ++target.seq;
  target.loading = true;
  target.error = "";
  try {
    const response = await jwxt.withSessionRetry(() => jwxtApi.records(
      { kind: kindOf(key), ...params, ...(force ? { refresh: "1" } : {}) },
      { silent: true },
    ));
    if (disposed || seq !== target.seq) return;
    target.data = response.parsed;
    target.params = params;
  } catch (error) {
    if (disposed || seq !== target.seq) return;
    target.error = errorMessage(error);
  } finally {
    if (!disposed && seq === target.seq) target.loading = false;
  }
}

function ensureLoaded() {
  if (!props.active) return;
  const target = entry.value;
  if (current.value === "timetable-search" || target.data || target.loading || target.error) return;
  void load(current.value, {});
}

function select(key: SectionKey) {
  current.value = key;
  ensureLoaded();
}

function reload(force: boolean) {
  if (current.value === "timetable-search" && !entry.value.params.keyword) {
    void runSearch();
    return;
  }
  void load(current.value, entry.value.params, force);
}

function onSemesterChange(event: Event) {
  const semester = (event.target as HTMLSelectElement).value;
  if (!semester || semester === entry.value.data?.semester) return;
  void load(current.value, { ...entry.value.params, semester });
}

function onDateChange(date: string) {
  void load("free-rooms", { date });
}

async function runSearch() {
  if (search.keyword.length < 2) return;
  await load("timetable-search", { scope: search.scope, keyword: search.keyword });
}

function formatNumber(value: unknown) {
  return typeof value === "number" ? String(value) : "—";
}

async function downloadTranscript() {
  if (transcriptBusy.value) return;
  transcriptBusy.value = true;
  transcriptError.value = "";
  try {
    const blob = await jwxt.withSessionRetry(() => jwxtApi.transcriptPdf());
    if (!(blob instanceof Blob) || blob.size < 5) throw new Error("empty");
    const fileName = "成绩单.pdf";
    const file = new File([blob], fileName, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    // 手机上先走系统分享面板，方便直接存到“文件”或发给自己。
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })
      && window.matchMedia?.("(pointer: coarse)").matches) {
      try {
        await nav.share({ files: [file], title: fileName });
        return;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    if (!disposed) transcriptError.value = "成绩单暂时导出失败，请稍后重试，或到学校教务系统原站导出。";
  } finally {
    if (!disposed) transcriptBusy.value = false;
  }
}

function onNativeRefresh() {
  if (!props.active) return;
  (window as any).__cpuNativeRefreshHandled = true;
  reload(true);
}

watch(() => props.active, () => ensureLoaded());

onMounted(() => {
  disposed = false;
  window.addEventListener("cpu-native-refresh", onNativeRefresh);
  ensureLoaded();
});

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("cpu-native-refresh", onNativeRefresh);
});
</script>

<style scoped lang="scss">
.records-pane { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

.rec-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid rgba(245, 158, 11, 0.34);
  border-radius: var(--cpu-radius-m);
  background: rgba(245, 158, 11, 0.12);
  color: var(--cpu-warn);
  font-size: var(--cpu-fs-xs);
  line-height: 1.6;
  padding: 10px 12px;
}
.rec-note > :last-child { margin-left: auto; }

.rec-nav {
  display: flex;
  gap: 6px;
  margin: 0 -2px;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.rec-nav::-webkit-scrollbar { display: none; }
.rec-nav button,
.rec-scope button,
.rec-refresh,
.rec-error button {
  --cpu-button-radius: var(--cpu-radius-pill);
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 12px;
  font: inherit;
  font-size: var(--cpu-fs-s);
  white-space: nowrap;
  cursor: pointer;
}

.rec-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 160px; }
.rec-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.rec-head-text { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
.rec-head-text b { color: var(--cpu-text); font-size: var(--cpu-fs-l); font-weight: 500; }
.rec-head-text span { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.rec-head-tools { display: flex; align-items: center; gap: 8px; }
.rec-semester { display: inline-flex; align-items: center; gap: 6px; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.rec-semester select,
.rec-search-input {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-s);
  background: var(--cpu-card);
  color: var(--cpu-text);
  font: inherit;
  font-size: var(--cpu-fs-s);
}

.rec-search { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.rec-scope { display: flex; gap: 6px; }
.rec-search-input { min-width: 0; flex: 1 1 180px; }
.rec-search-go { min-height: 32px; padding: 0 16px; font: inherit; font-size: var(--cpu-fs-s); cursor: pointer; }

.rec-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-danger-soft);
  color: var(--cpu-danger);
  font-size: var(--cpu-fs-s);
  line-height: 1.6;
}
.rec-loading,
.rec-tip { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }
.rec-loading { padding: 28px 0; text-align: center; font-size: var(--cpu-fs-s); }

.rec-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin: 0;
}
.rec-summary > div {
  padding: 10px 12px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
}
.rec-summary dt { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.rec-summary dd {
  margin: 4px 0 0;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-xl);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.rec-transcript {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 12px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
}
.rec-transcript > div { min-width: 0; flex: 1 1 220px; }
.rec-transcript b { color: var(--cpu-text); font-size: var(--cpu-fs-m); font-weight: 500; }
.rec-transcript p { margin: 3px 0 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.6; }
.rec-transcript button { min-height: 36px; padding: 0 16px; font: inherit; font-size: var(--cpu-fs-s); cursor: pointer; }
</style>
