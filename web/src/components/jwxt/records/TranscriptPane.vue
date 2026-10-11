<template>
  <RecordShell :loading="state.loading" :error="state.error" @refresh="reload(true)">
    <dl v-if="state.data" class="grade-summary">
      <div><dt>平均成绩</dt><dd>{{ figure(state.data.averageScore) }}</dd></div>
      <div class="is-accent"><dt>平均学分绩</dt><dd>{{ figure(state.data.creditWeightedAverage) }}</dd></div>
      <div v-if="state.data.gradePoint"><dt>平均学分绩点</dt><dd>{{ figure(state.data.gradePoint) }}</dd></div>
      <div><dt>所修总学分</dt><dd>{{ figure(state.data.totalCredits) }}</dd></div>
      <div><dt>所修门数</dt><dd>{{ figure(state.data.courseCount) }}<small>门</small></dd></div>
    </dl>
    <p v-if="state.data" class="record-tip">
      以上是教务系统自己的统计<template v-if="state.data.computedAt">（统计于 {{ state.data.computedAt }}）</template>，与“课程成绩”里按课程重新计算的口径可能不同。
    </p>

    <section class="transcript is-primary">
      <div class="transcript-text">
        <span class="transcript-kicker">推荐</span>
        <b>电子证明平台成绩单</b>
        <p>
          由学校电子证明平台生成，是对外提交用的版式，有中文和英文两种。这里下载的是平台的预览件，不带电子签章；
          需要带签章、可验真的正式件时，请到平台申请，平台会发到你登记的邮箱。在读证明、预计毕业证明等也在那里办。
        </p>
      </div>
      <div class="transcript-actions">
        <el-button type="primary" :icon="Download" :loading="busy === 'ecert-zh'" :disabled="Boolean(busy)" @click="download('ecert-zh')">中文成绩单</el-button>
        <el-button :icon="Download" :loading="busy === 'ecert-en'" :disabled="Boolean(busy)" @click="download('ecert-en')">英文成绩单</el-button>
        <a class="transcript-link" href="https://dzpzstu.cpu.edu.cn/student/" target="_blank" rel="noopener noreferrer">
          前往平台办理正式件
        </a>
      </div>
    </section>
    <el-alert v-if="downloadError" type="error" :closable="false" show-icon :title="downloadError" />

    <p class="record-tip">
      电子证明平台打不开时，可以先下载
      <button type="button" class="text-button" :disabled="Boolean(busy)" @click="download('jwxt')">
        {{ busy === "jwxt" ? "正在生成…" : "教务系统导出的成绩单" }}
      </button>
      ，版式比较简陋，只适合自己核对。
    </p>
  </RecordShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Download } from "@element-plus/icons-vue";
import RecordShell from "./RecordShell.vue";
import { saveFile } from "./saveFile";
import { useRecord } from "./useRecord";
import { jwxtApi } from "@/api/jwxt";
import { useJwxtStore } from "@/stores/jwxt";

type Variant = "ecert-zh" | "ecert-en" | "jwxt";

const FILE_NAMES: Record<Variant, string> = {
  "ecert-zh": "中文成绩单.pdf",
  "ecert-en": "英文成绩单.pdf",
  jwxt: "教务成绩单.pdf",
};

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false });
const jwxt = useJwxtStore();
const { state, reload } = useRecord("grade-summary", () => props.active);
const busy = ref<Variant | "">("");
const downloadError = ref("");
let disposed = false;

onBeforeUnmount(() => { disposed = true; });

function figure(value: unknown) {
  return typeof value === "number" ? String(value) : "—";
}

async function download(variant: Variant) {
  if (busy.value) return;
  busy.value = variant;
  downloadError.value = "";
  try {
    const blob = await jwxt.withSessionRetry(() => jwxtApi.transcriptPdf(variant));
    if (!(blob instanceof Blob) || blob.size < 5) throw new Error("empty");
    await saveFile(new Blob([blob], { type: "application/pdf" }), FILE_NAMES[variant]);
  } catch {
    if (!disposed) {
      downloadError.value = variant === "jwxt"
        ? "教务系统的成绩单暂时导出失败，请稍后重试。"
        : "电子证明平台暂时没有生成成绩单。可以稍后重试，或直接前往平台办理。";
    }
  } finally {
    if (!disposed) busy.value = "";
  }
}
</script>

<style scoped lang="scss">
// 与“课程成绩”顶部的统计卡片同一套样式。
.grade-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 0; }
.grade-summary > div {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}
.grade-summary dt { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.grade-summary dd {
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin: 4px 0 0;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.grade-summary small { color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); font-weight: 500; }
.grade-summary .is-accent { background: var(--cpu-primary-soft); }
.grade-summary .is-accent dd { color: var(--cpu-primary); }
.record-tip { margin: 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }

.transcript {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}
// 沿用原先成绩页“服务推荐”卡片的主色描边。
.transcript.is-primary { border-color: color-mix(in srgb, var(--cpu-primary) 30%, var(--cpu-border-soft)); }
.transcript-kicker { display: block; color: var(--cpu-primary); font-size: var(--cpu-fs-xs); font-weight: 500; }
.transcript-text b { display: block; margin-top: 2px; color: var(--cpu-text); font-size: var(--cpu-fs-m); font-weight: 500; }
.transcript-text p { margin: 4px 0 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.7; }
.transcript-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
.transcript-actions :deep(.el-button) { margin: 0; }
.transcript-link {
  margin-left: auto;
  color: var(--cpu-primary);
  font-size: var(--cpu-fs-s);
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}
.transcript-link:hover { text-decoration: underline; }
.text-button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--cpu-primary);
  font: inherit;
  cursor: pointer;
}
.text-button:hover:not(:disabled) { text-decoration: underline; }
.text-button:disabled { color: var(--cpu-text-muted); cursor: default; }

@media (max-width: 480px) {
  .grade-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .transcript-actions :deep(.el-button) { flex: 1 1 calc(50% - 5px); }
  .transcript-link { width: 100%; margin-left: 0; text-align: center; }
}
</style>
