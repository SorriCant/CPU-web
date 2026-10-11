<template>
  <!-- 两三个互斥选项的小切换（检索范围、课表／列表）。 -->
  <div class="seg" :class="{ 'is-stretch': stretch }" role="group" :aria-label="label" :style="{ '--seg-count': options.length }">
    <button
      v-for="item in options"
      :key="item.value"
      type="button"
      class="seg-btn"
      :class="{ active: modelValue === item.value }"
      :aria-pressed="modelValue === item.value"
      @click="emit('update:modelValue', item.value)"
    >{{ item.label }}</button>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
withDefaults(defineProps<{
  modelValue: T;
  options: Array<{ value: T; label: string }>;
  label: string;
  /** 手机上占满一行、各项等宽。 */
  stretch?: boolean;
}>(), { stretch: false });
const emit = defineEmits<{ (event: "update:modelValue", value: T): void }>();
</script>

<style scoped lang="scss">
.seg {
  display: inline-flex;
  flex: 0 0 auto;
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

@media (max-width: 640px) {
  .seg.is-stretch { display: grid; width: 100%; grid-template-columns: repeat(var(--seg-count), minmax(0, 1fr)); }
  .seg.is-stretch .seg-btn { padding: 0 4px; }
}
</style>
