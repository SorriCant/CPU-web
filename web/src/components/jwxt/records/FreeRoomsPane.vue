<template>
  <RecordShell :loading="state.loading" :error="state.error" @refresh="reload(true)">
    <template #controls>
      <div class="seg" role="group" aria-label="查询日期">
        <button
          v-for="item in quickDates"
          :key="item.value"
          type="button"
          class="seg-btn"
          :class="{ active: date === item.value }"
          :aria-pressed="date === item.value"
          @click="pickDate(item.value)"
        >{{ item.label }}</button>
      </div>
      <input class="date-input" type="date" :value="date" aria-label="选择日期" @change="onDateInput" />
    </template>
    <template v-if="data" #summary>第 <b>{{ data.week }}</b> 周 · {{ weekdayLabel }}</template>

    <template v-if="data">
      <div class="slot-grid" role="group" aria-label="时段">
        <button
          v-for="(slot, index) in data.slots"
          :key="slot.name"
          type="button"
          class="slot-btn"
          :class="{ active: selectedSlots.includes(index) }"
          :aria-pressed="selectedSlots.includes(index)"
          @click="toggleSlot(index)"
        >
          <b>{{ slotTitles[index] }}</b>
          <span>{{ slot.start }}–{{ slot.end }}</span>
        </button>
      </div>

      <div class="rooms-filter">
        <div class="seg is-scroll" role="group" aria-label="教学楼">
          <button type="button" class="seg-btn" :class="{ active: !building }" :aria-pressed="!building" @click="building = ''">全部</button>
          <button
            v-for="name in buildings"
            :key="name"
            type="button"
            class="seg-btn"
            :class="{ active: building === name }"
            :aria-pressed="building === name"
            @click="building = name"
          >{{ name }}</button>
        </div>
        <span class="rooms-count">
          <template v-if="selectedSlots.length">所选时段空闲 <b>{{ visibleCount }}</b> 间</template>
          <template v-else>共 <b>{{ visibleCount }}</b> 间，选一个时段只看当时空着的</template>
        </span>
      </div>

      <el-empty v-if="!groups.length" description="这个时段没有空闲的教室，换个时段或教学楼试试" />
      <section v-for="group in groups" :key="group.name" class="sem-block">
        <div class="sem-head">
          <h3>{{ group.name }}</h3>
          <span class="sem-sum">{{ group.rooms.length }} 间</span>
        </div>
        <div class="room-grid">
          <article v-for="room in group.rooms" :key="room.name" class="room-tile" :title="room.type">
            <div class="room-top">
              <b>{{ room.name }}</b>
              <span v-if="room.seats">{{ room.seats }} 座</span>
            </div>
            <div class="room-bar" :aria-label="barLabel(room)">
              <i
                v-for="(roomState, index) in room.states"
                :key="index"
                :class="[roomState ? 'is-busy' : 'is-free', { 'is-picked': selectedSlots.includes(index) }]"
              ></i>
            </div>
            <div class="room-foot" :class="{ 'is-free': footTone(room) === 'free', 'is-busy': footTone(room) === 'busy' }">{{ footText(room) }}</div>
          </article>
        </div>
      </section>

      <p v-if="groups.length" class="rooms-legend">
        <i class="is-free"></i>空闲<i class="is-busy"></i>上课、借用或调课 · 色条从左到右依次是 {{ slotOrderText }}
      </p>
    </template>
  </RecordShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import RecordShell from "./RecordShell.vue";
import {
  currentSlotIndex,
  filterRooms,
  freeSlotCount,
  freeUntil,
  groupRoomsByBuilding,
  roomBuildings,
  shanghaiClock,
  shanghaiDate,
  type FreeRoom,
  type FreeRoomSlot,
} from "./recordCards";
import { useRecord } from "./useRecord";

interface FreeRoomsData {
  date: string;
  week: number;
  day: number;
  slots: FreeRoomSlot[];
  rooms: FreeRoom[];
}

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: false });
const { state, load, reload } = useRecord<FreeRoomsData>("free-rooms", () => props.active);

const today = shanghaiDate();
const quickDates = [
  { label: "今天", value: today },
  { label: "明天", value: shanghaiDate(1) },
  { label: "后天", value: shanghaiDate(2) },
];
const date = ref(today);
const building = ref("");
const selectedSlots = ref<number[]>([]);
let slotsPickedFor = "";

const data = computed(() => state.data);
const weekdayLabel = computed(() => `星期${"一二三四五六日"[(data.value?.day ?? 1) - 1] ?? ""}`);
const buildings = computed(() => roomBuildings(data.value?.rooms ?? []));
// 午间和傍晚两个时段没有“第几大节”的叫法，直接用名字。
const slotTitles = computed(() => (data.value?.slots ?? []).map((slot) => (
  /大节/.test(slot.name) || !slot.name ? `${slot.periods} 节` : slot.name
)));
const slotOrderText = computed(() => slotTitles.value.map((title) => title.replace(" 节", "")).join("、"));
const visibleRooms = computed(() => filterRooms(data.value?.rooms ?? [], {
  building: building.value,
  slots: selectedSlots.value,
}));
const visibleCount = computed(() => visibleRooms.value.length);
const groups = computed(() => groupRoomsByBuilding(visibleRooms.value));

watch(data, (next) => {
  if (!next) return;
  date.value = next.date;
  if (building.value && !buildings.value.includes(building.value)) building.value = "";
  if (slotsPickedFor === next.date) return;
  slotsPickedFor = next.date;
  // 查今天时默认选中正在进行或马上开始的时段；其他日期先看全天。
  const index = next.date === today ? currentSlotIndex(next.slots, shanghaiClock()) : -1;
  selectedSlots.value = index >= 0 ? [index] : [];
}, { immediate: true });

function pickDate(value: string) {
  if (!value || value === date.value) return;
  date.value = value;
  void load({ date: value });
}

function onDateInput(event: Event) {
  pickDate((event.target as HTMLInputElement).value);
}

function toggleSlot(index: number) {
  selectedSlots.value = selectedSlots.value.includes(index)
    ? selectedSlots.value.filter((item) => item !== index)
    : [...selectedSlots.value, index].sort((a, b) => a - b);
}

function footText(room: FreeRoom) {
  const slots = data.value?.slots ?? [];
  if (selectedSlots.value.length) {
    const until = freeUntil(room, slots, selectedSlots.value[selectedSlots.value.length - 1]);
    return until ? `空闲至 ${until}` : "";
  }
  const free = freeSlotCount(room);
  if (free === slots.length) return "全天空闲";
  if (!free) return "全天有安排";
  return `${free} 个时段空闲`;
}

function footTone(room: FreeRoom) {
  if (selectedSlots.value.length) return "free";
  const free = freeSlotCount(room);
  return free === room.states.length ? "free" : free ? "" : "busy";
}

function barLabel(room: FreeRoom) {
  return slotTitles.value.map((title, index) => `${title}${room.states[index] ? "占用" : "空闲"}`).join("，");
}
</script>

<style scoped lang="scss">
// 分段开关沿用成绩页“统计口径”开关的样子。
.seg {
  display: inline-flex;
  max-width: 100%;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-surface-subtle);
}
.seg.is-scroll { overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.seg.is-scroll::-webkit-scrollbar { display: none; }
.seg-btn {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--cpu-radius-s);
  background: transparent;
  color: var(--cpu-text-secondary);
  font: inherit;
  font-size: var(--cpu-fs-s);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.seg-btn:hover { color: var(--cpu-primary); }
.seg-btn.active { background: var(--cpu-card); color: var(--cpu-primary); }
.seg-btn:focus-visible,
.slot-btn:focus-visible { outline: 2px solid var(--cpu-primary-soft); outline-offset: 2px; }

.date-input {
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
  color: var(--cpu-text);
  font: inherit;
  font-size: var(--cpu-fs-s);
  color-scheme: light dark;
}

.slot-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.slot-btn {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  background: var(--cpu-card);
  color: var(--cpu-text-secondary);
  font: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.slot-btn b { color: var(--cpu-text); font-size: var(--cpu-fs-s); font-weight: 500; line-height: 1.3; }
.slot-btn span { font-size: var(--cpu-fs-xs); font-variant-numeric: tabular-nums; line-height: 1.3; white-space: nowrap; }
.slot-btn.active { border-color: var(--cpu-primary); background: var(--cpu-primary-soft); color: var(--cpu-primary); }
.slot-btn.active b { color: var(--cpu-primary); }

.rooms-filter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.rooms-count { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-s); }
.rooms-count b { color: var(--cpu-primary); font-size: var(--cpu-fs-m); font-weight: 500; }

.sem-block { margin-bottom: 8px; }
.sem-block:last-of-type { margin-bottom: 0; }
.sem-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0 0 8px; }
.sem-head h3 { margin: 0; color: var(--cpu-primary); font-size: var(--cpu-fs-m); font-weight: 500; }
.sem-sum { color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); }

.room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.room-tile {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-l);
  background: var(--cpu-card);
}
.room-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.room-top b {
  overflow: hidden;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-m);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-top span { flex: 0 0 auto; color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); }
.room-bar { display: flex; gap: 2px; margin-top: 8px; }
.room-bar i { height: 6px; flex: 1; border-radius: 3px; }
.room-bar i.is-free,
.rooms-legend i.is-free { background: color-mix(in srgb, var(--cpu-success) 62%, var(--cpu-card)); }
.room-bar i.is-busy,
.rooms-legend i.is-busy { background: var(--cpu-track); }
.room-bar i.is-picked { outline: 1.5px solid var(--cpu-primary); outline-offset: 1px; }
.room-foot { min-height: 17px; margin-top: 7px; color: var(--cpu-text-secondary); font-size: var(--cpu-fs-xs); line-height: 1.4; }
.room-foot.is-free { color: var(--cpu-hue-green-ink); }
.room-foot.is-busy { color: var(--cpu-text-muted); }

.rooms-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin: 0;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  line-height: 1.6;
}
.rooms-legend i { display: inline-block; width: 14px; height: 6px; border-radius: 3px; }
.rooms-legend i + i,
.rooms-legend i.is-busy { margin-left: 6px; }

@media (min-width: 1000px) {
  .slot-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
}
</style>
