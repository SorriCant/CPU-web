<template>
  <RecordShell :loading="loading" :error="error" @refresh="reloadAll">
    <template v-if="semesterOptions.length > 1" #controls>
      <label class="filter-field">
        <span class="lbl">学期</span>
        <el-select :model-value="semester" size="small" :disabled="loading" @change="onSemesterChange">
          <el-option v-for="item in semesterOptions" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
      </label>
    </template>
    <template v-if="summary" #summary>
      <b>{{ summary.count }}</b> {{ summary.unit }}<template v-if="summary.extra"> · {{ summary.extra }}</template>
    </template>

    <p v-if="tip" class="record-tip">{{ tip }}</p>
    <RecordCardList v-if="groups.length" :groups="groups" :empty-text="emptyText" />
  </RecordShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RecordCardList from "./RecordCardList.vue";
import RecordShell from "./RecordShell.vue";
import { recordGroups, type RecordKind } from "./recordCards";
import { useRecord } from "./useRecord";

// 一页可以放几类相关的数据（例如选课轮次 + 选课记录），各自读取，按顺序排在一起。
const props = withDefaults(defineProps<{
  sources: Array<{ kind: RecordKind; label?: string }>;
  active?: boolean;
  emptyText?: string;
}>(), { active: false, emptyText: "暂无记录" });

const records = props.sources.map((source) => ({
  ...source,
  ...useRecord(source.kind, () => props.active),
}));

const loading = computed(() => records.some((record) => record.state.loading));
const error = computed(() => records.find((record) => record.state.error)?.state.error ?? "");
const groups = computed(() => records.flatMap((record) => (
  recordGroups(record.kind, record.state.data, { label: record.label })
)));
const termed = computed(() => records.find((record) => Array.isArray(record.state.data?.semesters)));
const semesterOptions = computed<Array<{ value: string; label: string }>>(() => termed.value?.state.data?.semesters ?? []);
const semester = computed(() => termed.value?.state.data?.semester ?? "");

const summary = computed(() => {
  for (const record of records) {
    const data = record.state.data;
    if (!data) continue;
    if (record.kind === "term-courses" && data.list?.length) {
      return { count: data.list.length, unit: "门", extra: `${data.credits ?? 0} 学分` };
    }
    if (record.kind === "enrollment" && data.selected?.length) {
      return { count: data.selected.length, unit: "门已选", extra: `${data.credits ?? 0} 学分` };
    }
    if (record.kind === "textbooks" && data.list?.length) return { count: data.list.length, unit: "本教材", extra: "" };
    if (record.kind === "retake-options" && data.list?.length) {
      const offered = data.list.filter((row: { offered?: boolean }) => row.offered).length;
      return { count: offered, unit: "门本学期开课", extra: `共 ${data.list.length} 门` };
    }
    if (record.kind === "graduation-audit") {
      const remaining = data.groups?.find((group: { key: string }) => group.key === "remaining");
      if (remaining?.list?.length) {
        return { count: remaining.list.length, unit: "门计划内课程未修", extra: `${remaining.credits ?? 0} 学分` };
      }
    }
  }
  return null;
});

const tip = computed(() => {
  for (const record of records) {
    const data = record.state.data;
    if (!data) continue;
    if (record.kind === "retake-options" && data.window) return `重修报名时间：${data.window}`;
    if (record.kind === "major-transfer" && data.list?.length) {
      return "转专业的报名人数是教务系统当前登记的数字，申请条件以学院通知为准。";
    }
  }
  return "";
});

function onSemesterChange(value: string) {
  const record = termed.value;
  if (!record || !value || value === semester.value) return;
  void record.load({ ...record.state.params, semester: value });
}

function reloadAll() {
  records.forEach((record) => { void record.reload(true); });
}
</script>

<style scoped lang="scss">
.filter-field { display: flex; min-width: 150px; flex-direction: column; gap: 5px; }
.filter-field :deep(.el-select) { width: 100%; }
.filter-field :deep(.el-select .el-select__wrapper) { min-height: 36px; }
.lbl { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.record-tip { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }
</style>
