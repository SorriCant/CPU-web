<template>
  <div class="record-groups">
    <section v-for="group in groups" :key="group.key" class="sem-block">
      <div v-if="group.label" class="sem-head">
        <h3>{{ group.label }}</h3>
        <span v-if="group.note" class="sem-sum">{{ group.note }}</span>
      </div>
      <p v-if="!group.cards.length && group.label" class="record-none">暂无记录</p>
      <el-empty v-else-if="!group.cards.length" :description="emptyText" />
      <div v-else class="record-list">
        <article v-for="card in group.cards" :key="card.key" class="record-card">
          <div class="record-main">
            <div class="record-top">
              <div class="course-title">{{ card.title }}</div>
              <el-tag v-if="card.badge" class="record-tag" size="small" :type="card.badgeType || 'info'" effect="plain">
                {{ card.badge }}
              </el-tag>
            </div>
            <div v-if="card.sub" class="course-sub"><span>{{ card.sub }}</span></div>
            <div v-if="card.meta.length" class="course-sub">
              <span v-for="item in card.meta" :key="item">{{ item }}</span>
            </div>
            <div v-for="line in card.lines" :key="line" class="record-line">{{ line }}</div>
          </div>
          <div v-if="card.value" class="record-value">
            <b>{{ card.value }}</b>
            <span v-if="card.valueLabel">{{ card.valueLabel }}</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { RecordCardGroup } from "./recordCards";

withDefaults(defineProps<{ groups: RecordCardGroup[]; emptyText?: string }>(), { emptyText: "暂无记录" });
</script>

<style scoped lang="scss">
// 分组标题、卡片与成绩页的学期分组、成绩卡片用同一套写法。
.sem-block { margin-bottom: 20px; }
.sem-block:last-child { margin-bottom: 0; }
.sem-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 8px; }
.sem-head h3 { margin: 0; color: var(--cpu-primary); font-size: var(--cpu-fs-m); font-weight: 500; }
.sem-sum { color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); }

.record-none {
  margin: 0;
  padding: 14px 12px;
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-subtle);
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-s);
  text-align: center;
}

.record-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 10px;
}
.record-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}
.record-main { min-width: 0; flex: 1; }
.record-top { display: flex; align-items: flex-start; gap: 8px; }
.course-title {
  min-width: 0;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.record-tag { flex: 0 0 auto; margin-top: 1px; }
.course-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 7px;
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.course-sub + .course-sub { margin-top: 5px; }
.record-line {
  margin-top: 5px;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.record-value {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 56px;
  max-width: 42%;
  padding: 7px 10px;
  border-radius: var(--cpu-radius-s);
  background: var(--cpu-surface-subtle);
  text-align: center;
}
.record-value b {
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}
.record-value span { color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); white-space: nowrap; }
</style>
