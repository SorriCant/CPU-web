<template>
  <RecordShell :loading="state.loading" :error="state.error" :refreshable="Boolean(state.data)" @refresh="reload(true)">
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
      <label v-if="semesterOptions.length > 1" class="filter-field">
        <el-select v-model="semester" size="small" aria-label="学期" :disabled="state.loading">
          <el-option v-for="item in semesterOptions" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
      </label>
      <form class="search-form" @submit.prevent="run">
        <el-input v-model.trim="keyword" clearable maxlength="30" :placeholder="placeholder" :aria-label="placeholder" />
        <el-button type="primary" native-type="submit" :icon="Search" :disabled="state.loading || keyword.length < 2">检索</el-button>
      </form>
    </template>
    <template v-if="state.data" #summary><b>{{ state.data.total }}</b> 条排课</template>

    <p v-if="state.data?.truncated" class="record-tip">
      结果较多，先显示前 {{ state.data.list.length }} 条；把关键词写得更具体可以缩小范围。
    </p>
    <RecordCardList v-if="state.data" :groups="groups" empty-text="没有找到匹配的排课" />
    <el-empty
      v-else-if="!state.loading && !state.error"
      :image-size="88"
      description="输入课程名、教师姓名或教室号，查全校本学期的排课"
    />
  </RecordShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Search } from "@element-plus/icons-vue";
import RecordCardList from "./RecordCardList.vue";
import RecordShell from "./RecordShell.vue";
import { recordGroups } from "./recordCards";
import { useRecord } from "./useRecord";

type Scope = "course" | "teacher" | "classroom";

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false });
// 不自动请求：等用户输入关键词再查。
const { state, load, reload } = useRecord("timetable-search", () => props.active, { auto: false });

const scopes: Array<{ value: Scope; label: string; placeholder: string }> = [
  { value: "course", label: "课程", placeholder: "课程名或课程编号，例如 药剂学" },
  { value: "teacher", label: "教师", placeholder: "教师姓名" },
  { value: "classroom", label: "教室", placeholder: "教室号，例如 E104" },
];
const scope = ref<Scope>("course");
const keyword = ref("");
const semester = ref("");

const placeholder = computed(() => scopes.find((item) => item.value === scope.value)?.placeholder ?? "");
const semesterOptions = computed<Array<{ value: string; label: string }>>(() => state.data?.semesters ?? []);
const groups = computed(() => recordGroups("timetable-search", state.data));

watch(() => state.data?.semester, (value) => { if (value) semester.value = value; });
watch(semester, (value, previous) => {
  if (!value || !previous || value === state.data?.semester || !state.params.keyword) return;
  void load({ ...state.params, semester: value });
});

function run() {
  if (keyword.value.length < 2) return;
  void load({
    scope: scope.value,
    keyword: keyword.value,
    ...(semester.value ? { semester: semester.value } : {}),
  });
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
.filter-field { min-width: 140px; }
.filter-field :deep(.el-select .el-select__wrapper) { min-height: 38px; }
.record-tip { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }
</style>
