<template>
  <RecordShell :loading="loading" :error="error" :refreshable="hasResult" @refresh="refresh">
    <template #controls>
      <div class="seg" role="group" aria-label="检索范围">
        <button
          v-for="item in scopes"
          :key="item.value"
          type="button"
          class="seg-btn"
          :class="{ active: scope === item.value }"
          :aria-pressed="scope === item.value"
          @click="scope = item.value"
        >{{ item.label }}</button>
      </div>
      <label v-if="semesterOptions.length > 1" class="filter-field is-term">
        <el-select :model-value="semester" size="small" aria-label="学期" :disabled="loading" @change="onSemesterChange">
          <el-option v-for="item in semesterOptions" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
      </label>

      <template v-if="scope === 'class'">
        <label class="filter-field">
          <el-select :model-value="grade" size="small" placeholder="入学年级" aria-label="入学年级" :disabled="loading" @change="onGradeChange">
            <el-option v-for="item in gradeOptions" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
        </label>
        <label class="filter-field is-wide">
          <el-select
            :model-value="major"
            size="small"
            filterable
            placeholder="专业（可输入查找）"
            aria-label="专业"
            :disabled="loading || !grade"
            @change="onMajorChange"
          >
            <el-option v-for="item in majorOptions" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
        </label>
        <label class="filter-field is-wide">
          <el-select
            :model-value="classId"
            size="small"
            filterable
            placeholder="班级"
            aria-label="班级"
            :disabled="loading || !major"
            @change="onClassChange"
          >
            <el-option v-for="item in classOptions" :key="item.value" :value="item.value" :label="item.label" />
          </el-select>
        </label>
      </template>
      <form v-else class="search-form" @submit.prevent="runSearch">
        <el-input v-model.trim="keyword" clearable maxlength="30" :placeholder="placeholder" :aria-label="placeholder" />
        <el-button type="primary" native-type="submit" :icon="Search" :disabled="loading || keyword.length < 2">检索</el-button>
      </form>
    </template>
    <template v-if="hasResult" #summary>
      <b>{{ filtered.length }}</b> 节<template v-if="filtered.length !== totalCount"> / 共 {{ totalCount }}</template>
    </template>

    <div v-if="rows.length" class="refine-row">
      <label class="filter-field">
        <span class="lbl">星期</span>
        <el-select v-model="weekday" size="small" clearable placeholder="全部" aria-label="星期">
          <el-option v-for="day in weekdays" :key="day" :value="day" :label="day" />
        </el-select>
      </label>
      <label class="filter-field">
        <span class="lbl">周次</span>
        <el-select v-model="week" size="small" clearable placeholder="全部周" aria-label="周次">
          <el-option v-for="item in 20" :key="item" :value="item" :label="`第 ${item} 周`" />
        </el-select>
      </label>
      <el-button size="small" :icon="Download" :disabled="!filtered.length" @click="exportCsv">导出表格</el-button>
    </div>

    <p v-if="scope !== 'class' && search.state.data?.truncated" class="record-tip">
      结果较多，先取了前 {{ search.state.data.list.length }} 条；把关键词写得更具体可以缩小范围。
    </p>
    <RecordCardList v-if="hasResult" :groups="groups" :empty-text="rows.length ? '没有符合筛选条件的课' : emptyText" />
    <el-empty v-else-if="!loading && !error" :image-size="88" :description="hintText" />
  </RecordShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Download, Search } from "@element-plus/icons-vue";
import RecordCardList from "./RecordCardList.vue";
import RecordShell from "./RecordShell.vue";
import { WEEKDAYS, filterTimetable, timetableCsv, timetableDayGroups, type TimetableRow } from "./recordCards";
import { saveFile } from "./saveFile";
import { useRecord } from "./useRecord";

type Scope = "course" | "teacher" | "classroom" | "class";
interface Option { value: string; label: string }

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false });

const scopes: Array<{ value: Scope; label: string; placeholder: string }> = [
  { value: "course", label: "课程", placeholder: "课程名或课程编号，例如 药剂学" },
  { value: "teacher", label: "教师", placeholder: "教师姓名" },
  { value: "classroom", label: "教室", placeholder: "教室号，例如 E104" },
  { value: "class", label: "班级", placeholder: "" },
];
const weekdays = WEEKDAYS;
const scope = ref<Scope>("course");
const keyword = ref("");
const grade = ref("");
const major = ref("");
const classId = ref("");
const weekday = ref("");
const week = ref<number | "">("");

// 关键词检索等用户输入后再查；班级这一栏打开时先取年级列表。
const search = useRecord("timetable-search", () => props.active, { auto: false });
const klass = useRecord("class-timetable", () => props.active && scope.value === "class");
const current = computed(() => (scope.value === "class" ? klass : search));

const loading = computed(() => current.value.state.loading);
const error = computed(() => current.value.state.error);
const placeholder = computed(() => scopes.find((item) => item.value === scope.value)?.placeholder ?? "");
const semesterOptions = computed<Option[]>(() => current.value.state.data?.semesters ?? klass.state.data?.semesters ?? search.state.data?.semesters ?? []);
const semester = computed(() => current.value.state.data?.semester ?? "");
const gradeOptions = computed<Option[]>(() => klass.state.data?.grades ?? []);
const majorOptions = computed<Option[]>(() => klass.state.data?.majors ?? []);
const classOptions = computed<Option[]>(() => klass.state.data?.classes ?? []);

const hasResult = computed(() => (
  scope.value === "class" ? Boolean(klass.state.data?.classId) : Boolean(search.state.data)
));
const rows = computed<TimetableRow[]>(() => (hasResult.value ? current.value.state.data?.list ?? [] : []));
const totalCount = computed(() => (
  scope.value === "class" ? rows.value.length : search.state.data?.total ?? rows.value.length
));
const filtered = computed(() => filterTimetable(rows.value, { week: week.value || null, weekday: weekday.value }));
const groups = computed(() => {
  const days = timetableDayGroups(filtered.value);
  // 没有结果时也给一组，让列表显示空状态。
  return days.length ? days : [{ key: "empty", label: "", cards: [] }];
});
const emptyText = computed(() => (scope.value === "class" ? "这个班本学期没有排课" : "没有找到匹配的排课"));
const hintText = computed(() => (
  scope.value === "class"
    ? "依次选入学年级、专业和班级，查看整个班本学期的课表"
    : "输入课程名、教师姓名或教室号，查全校本学期的排课"
));

// 换检索范围时清掉只对上一份结果有意义的筛选。
watch(scope, () => {
  weekday.value = "";
  week.value = "";
});

function classParams(extra: Record<string, string> = {}) {
  return {
    ...(semester.value ? { semester: semester.value } : {}),
    ...(grade.value ? { grade: grade.value } : {}),
    ...(major.value ? { major: major.value } : {}),
    ...(classId.value ? { classId: classId.value } : {}),
    ...extra,
  };
}

function onGradeChange(value: string) {
  grade.value = value;
  major.value = "";
  classId.value = "";
  void klass.load(classParams());
}

function onMajorChange(value: string) {
  major.value = value;
  classId.value = "";
  void klass.load(classParams());
}

function onClassChange(value: string) {
  classId.value = value;
  void klass.load(classParams());
}

function runSearch() {
  if (keyword.value.length < 2 || scope.value === "class") return;
  void search.load({
    scope: scope.value,
    keyword: keyword.value,
    ...(search.state.data?.semester ? { semester: search.state.data.semester } : {}),
  });
}

function onSemesterChange(value: string) {
  if (!value || value === semester.value) return;
  if (scope.value === "class") void klass.load(classParams({ semester: value }));
  else if (search.state.params.keyword) void search.load({ ...search.state.params, semester: value });
}

function refresh() {
  void current.value.reload(true);
}

async function exportCsv() {
  if (!filtered.value.length) return;
  const subject = scope.value === "class"
    ? klass.state.data?.className || "班级"
    : search.state.data?.keyword || "排课";
  const fileName = `${subject}-课表-${semester.value || "本学期"}.csv`.replace(/[\\/:*?"<>|]/g, "_");
  // 带 BOM，Excel 直接打开不乱码。
  const blob = new Blob(["﻿", timetableCsv(filtered.value)], { type: "text/csv;charset=utf-8" });
  await saveFile(blob, fileName);
}
</script>

<style scoped lang="scss">
.seg {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-subtle);
}
.seg-btn {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--cpu-radius-s);
  background: transparent;
  color: var(--cpu-text-secondary);
  font: inherit;
  font-size: var(--cpu-fs-s);
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg-btn:hover { color: var(--cpu-primary); }
.seg-btn.active { background: var(--cpu-card); color: var(--cpu-primary); }
.seg-btn:focus-visible { outline: 2px solid var(--cpu-primary-soft); outline-offset: 2px; }

.search-form { display: flex; min-width: 0; flex: 1 1 300px; gap: 8px; }
.search-form :deep(.el-input) { min-width: 0; flex: 1; }
.search-form :deep(.el-input__wrapper) { min-height: 38px; }
.search-form :deep(.el-button) { height: 38px; margin: 0; }

.filter-field { display: flex; min-width: 0; flex: 0 1 140px; flex-direction: column; gap: 5px; }
.filter-field.is-wide { flex: 1 1 200px; }
.filter-field :deep(.el-select) { width: 100%; }
.filter-field :deep(.el-select .el-select__wrapper) { min-height: 38px; }
.lbl { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }

.refine-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; }
.refine-row .filter-field :deep(.el-select .el-select__wrapper) { min-height: 36px; }
.refine-row :deep(.el-button) { height: 36px; margin: 0 0 0 auto; }
.record-tip { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }

@media (max-width: 640px) {
  .seg { display: grid; width: 100%; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .seg-btn { padding: 0 4px; }
  .filter-field { flex: 1 1 calc(50% - 5px); }
  .filter-field.is-wide { flex-basis: 100%; }
}
</style>
