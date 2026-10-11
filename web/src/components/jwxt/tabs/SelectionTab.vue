<template>
  <JwxtSubViews :views="views" label="选课" id-prefix="jwxt-selection" :active="active">
    <template #courses="{ active: shown }">
      <RecordPane :sources="courseSources" :active="shown" empty-text="这个学期还没有课程" />
    </template>
    <template #records="{ active: shown }">
      <RecordPane :sources="recordSources" :active="shown" empty-text="这个学期没有选课记录" />
    </template>
    <template #textbooks="{ active: shown }">
      <RecordPane :sources="textbookSources" :active="shown" empty-text="这个学期没有教材记录" />
    </template>
  </JwxtSubViews>
</template>

<script setup lang="ts">
import JwxtSubViews from "@/components/jwxt/JwxtSubViews.vue";
import RecordPane from "@/components/jwxt/records/RecordPane.vue";
import type { RecordKind } from "@/components/jwxt/records/recordCards";

defineProps<{ active?: boolean }>();

type Source = { kind: RecordKind; label?: string };
const views = [
  { key: "courses", label: "本学期课程" },
  { key: "records", label: "选课记录" },
  { key: "textbooks", label: "教材" },
];
const courseSources: Source[] = [{ kind: "term-courses" }];
const recordSources: Source[] = [{ kind: "election-rounds", label: "选课轮次" }, { kind: "enrollment" }];
const textbookSources: Source[] = [{ kind: "textbooks" }];
</script>
