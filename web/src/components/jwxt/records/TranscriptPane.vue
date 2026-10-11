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

    <div class="transcript">
      <div class="transcript-text">
        <b>成绩单 PDF</b>
        <p>由学校教务系统现场生成，包含全部学期的课程成绩。文件只下载到你的设备，本站不保存。</p>
      </div>
      <el-button type="primary" :icon="Download" :loading="busy" :disabled="busy" @click="download">下载成绩单</el-button>
    </div>
    <el-alert v-if="downloadError" type="error" :closable="false" show-icon :title="downloadError" />
  </RecordShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { Download } from "@element-plus/icons-vue";
import RecordShell from "./RecordShell.vue";
import { useRecord } from "./useRecord";
import { jwxtApi } from "@/api/jwxt";
import { useJwxtStore } from "@/stores/jwxt";

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false });
const jwxt = useJwxtStore();
const { state, reload } = useRecord("grade-summary", () => props.active);
const busy = ref(false);
const downloadError = ref("");
let disposed = false;

onBeforeUnmount(() => { disposed = true; });

function figure(value: unknown) {
  return typeof value === "number" ? String(value) : "—";
}

async function download() {
  if (busy.value) return;
  busy.value = true;
  downloadError.value = "";
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
    if (!disposed) downloadError.value = "成绩单暂时导出失败，请稍后重试，或到学校教务系统原站导出。";
  } finally {
    if (!disposed) busy.value = false;
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 14px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}
.transcript-text { min-width: 0; flex: 1 1 240px; }
.transcript-text b { color: var(--cpu-text); font-size: var(--cpu-fs-m); font-weight: 500; }
.transcript-text p { margin: 4px 0 0; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.6; }
.transcript :deep(.el-button) { margin: 0; }

@media (max-width: 480px) {
  .grade-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .transcript :deep(.el-button) { width: 100%; }
}
</style>
