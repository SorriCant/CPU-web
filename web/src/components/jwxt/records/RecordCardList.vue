<template>
  <div class="rec-groups">
    <section v-for="group in groups" :key="group.key" class="rec-group">
      <header v-if="group.label" class="rec-group-head">
        <b>{{ group.label }}</b>
        <span v-if="group.note">{{ group.note }}</span>
      </header>
      <p v-if="!group.cards.length" class="rec-empty">{{ group.label ? "暂无记录" : emptyText }}</p>
      <ul v-else class="rec-cards">
        <li v-for="card in group.cards" :key="card.key" class="rec-card">
          <div class="rec-card-main">
            <div class="rec-card-title">
              <b>{{ card.title }}</b>
              <span v-if="card.badge" class="rec-badge" :class="`is-${card.badgeTone || 'muted'}`">{{ card.badge }}</span>
            </div>
            <p v-if="card.sub" class="rec-card-sub">{{ card.sub }}</p>
            <p v-if="card.meta.length" class="rec-card-meta">
              <span v-for="item in card.meta" :key="item">{{ item }}</span>
            </p>
            <p v-for="line in card.lines" :key="line" class="rec-card-line">{{ line }}</p>
          </div>
          <div v-if="card.value" class="rec-card-value">
            <b>{{ card.value }}</b>
            <span v-if="card.valueLabel">{{ card.valueLabel }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { RecordCardGroup } from "./recordCards";

withDefaults(defineProps<{ groups: RecordCardGroup[]; emptyText?: string }>(), { emptyText: "暂无记录" });
</script>

<style scoped lang="scss">
.rec-groups { display: flex; flex-direction: column; gap: 16px; }
.rec-group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.rec-group-head b { color: var(--cpu-text); font-size: var(--cpu-fs-m); font-weight: 500; }
.rec-group-head span { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); }
.rec-empty {
  margin: 0;
  padding: 18px 12px;
  border: 1px dashed var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-s);
  text-align: center;
}
.rec-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rec-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
}
.rec-card-main { min-width: 0; flex: 1; }
.rec-card-title { display: flex; align-items: flex-start; gap: 6px; }
.rec-card-title b {
  min-width: 0;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.rec-badge {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: var(--cpu-radius-s);
  background: var(--cpu-surface-subtle);
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
  line-height: 1.5;
  white-space: nowrap;
}
.rec-badge.is-accent { background: var(--cpu-primary-soft); color: var(--cpu-primary); }
.rec-badge.is-ok { background: var(--cpu-hue-green-bg); color: var(--cpu-hue-green-ink); }
.rec-badge.is-warn { background: var(--cpu-hue-amber-bg); color: var(--cpu-hue-amber-ink); }
.rec-card-sub,
.rec-card-meta,
.rec-card-line {
  margin: 3px 0 0;
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.rec-card-meta { display: flex; flex-wrap: wrap; gap: 0 10px; }
.rec-card-line { color: var(--cpu-text-muted); }
.rec-card-value {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  align-items: flex-end;
  gap: 1px;
  max-width: 45%;
  text-align: right;
}
.rec-card-value b {
  color: var(--cpu-text);
  font-size: var(--cpu-fs-l);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}
.rec-card-value span { color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); white-space: nowrap; }
</style>
