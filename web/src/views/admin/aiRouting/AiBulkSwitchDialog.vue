<template>
  <el-dialog
    :model-value="modelValue"
    :title="`全部改用「${service?.name || ''}」`"
    width="640px"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="abs-lead">
      勾选的场景会把它设为主线路，原来的主线路退到第二环作回退。模型已按线路里配过的和模型目录里的同名项预填，空着的需要选一下。
    </p>
    <ul class="abs-rows">
      <li v-for="row in rows" :key="row.scene.scene" class="abs-row" :class="{ 'is-current': row.current }">
        <div class="abs-scene">
          <el-checkbox v-model="row.checked" :disabled="row.current">{{ row.scene.label }}</el-checkbox>
          <span class="abs-from">
            {{ row.current ? "已经是主线路" : `现在：${row.fromName} · ${row.fromModel}` }}
          </span>
        </div>
        <el-select
          v-model="row.model"
          class="abs-model"
          filterable
          allow-create
          default-first-option
          :disabled="!row.checked"
          placeholder="选择或输入模型"
        >
          <el-option v-for="model in modelOptions(row.model)" :key="model" :label="model" :value="model" />
        </el-select>
      </li>
    </ul>
    <p v-if="hasLearning" class="abs-note">网课解题的三个档位会先都用这里选的模型，保存后可以在它的线路里分别调整。</p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :disabled="!selected.length || missingModel" @click="confirm">
        {{ missingModel ? "还有场景没选模型" : `切换 ${selected.length} 个场景并保存` }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AiRoutingScene, AiServiceConfig, AiServiceProbe, AiServiceScene } from "@/api/admin";
import { primaryModel, suggestModel } from "./routingModel";

const props = defineProps<{
  modelValue: boolean;
  service: AiServiceConfig | null;
  services: AiServiceConfig[];
  scenes: AiRoutingScene[];
  probe?: AiServiceProbe;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  apply: [changes: Array<{ scene: AiServiceScene; model: string }>];
}>();

type Row = {
  scene: AiRoutingScene;
  /** 已经以它为主线路，不需要再切。 */
  current: boolean;
  checked: boolean;
  model: string;
  fromName: string;
  fromModel: string;
};

const rows = ref<Row[]>([]);
const selected = computed(() => rows.value.filter((row) => row.checked && !row.current));
const missingModel = computed(() => selected.value.some((row) => !row.model.trim()));
const hasLearning = computed(() => selected.value.some((row) => row.scene.tierModels));

watch(() => props.modelValue, (open) => {
  if (!open || !props.service) return;
  const target = props.service;
  rows.value = props.scenes.map((scene) => {
    const current = scene.chain[0]?.serviceId === target.id;
    return {
      scene,
      current,
      checked: !current,
      model: suggestModel(scene, target.id, props.probe),
      fromName: props.services.find((item) => item.id === scene.chain[0]?.serviceId)?.name || "未知服务",
      fromModel: primaryModel(scene),
    };
  });
});

function modelOptions(current: string) {
  return Array.from(new Set([...(props.probe?.models || []), current].filter(Boolean)));
}

function confirm() {
  emit("apply", selected.value.map((row) => ({ scene: row.scene.scene, model: row.model.trim() })));
  emit("update:modelValue", false);
}
</script>

<style scoped>
.abs-lead,
.abs-note {
  margin: 0 0 12px;
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-s);
  line-height: 1.6;
}

.abs-note {
  margin: 12px 0 0;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
}

.abs-rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
}

.abs-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
}

.abs-scene {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.abs-scene :deep(.el-checkbox) {
  height: 24px;
}

.abs-row + .abs-row {
  border-top: 1px solid var(--cpu-border-soft);
}

.abs-from {
  overflow: hidden;
  padding-left: 22px;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.abs-model {
  width: 100%;
}

@media (max-width: 640px) {
  .abs-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
