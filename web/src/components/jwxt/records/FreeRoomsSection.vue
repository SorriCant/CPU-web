<template>
  <div class="rooms">
    <div class="rooms-bar">
      <div class="rooms-dates" role="group" aria-label="查询日期">
        <button
          v-for="item in quickDates"
          :key="item.value"
          data-cpu-button="option"
          type="button"
          :class="{ active: date === item.value }"
          :aria-pressed="date === item.value"
          @click="pickDate(item.value)"
        >{{ item.label }}</button>
        <input class="rooms-date-input" type="date" :value="date" aria-label="选择日期" @change="onDateInput" />
      </div>
      <span v-if="data" class="rooms-when">第 {{ data.week }} 周 · {{ weekdayLabel }}</span>
    </div>

    <template v-if="data">
      <div class="rooms-chips is-slots" role="group" aria-label="时段">
        <button
          v-for="(slot, index) in data.slots"
          :key="slot.name"
          data-cpu-button="option"
          type="button"
          :class="{ active: selectedSlots.includes(index) }"
          :aria-pressed="selectedSlots.includes(index)"
          @click="toggleSlot(index)"
        >
          <b>{{ slotTitles[index] }}</b>
          <span>{{ slot.start }}–{{ slot.end }}</span>
        </button>
      </div>

      <div class="rooms-chips is-buildings" role="group" aria-label="教学楼">
        <button
          data-cpu-button="option"
          type="button"
          :class="{ active: !building }"
          :aria-pressed="!building"
          @click="building = ''"
        >全部</button>
        <button
          v-for="name in buildings"
          :key="name"
          data-cpu-button="option"
          type="button"
          :class="{ active: building === name }"
          :aria-pressed="building === name"
          @click="building = name"
        >{{ name }}</button>
      </div>

      <p class="rooms-summary">
        <span v-if="selectedSlots.length">所选时段空闲 <b>{{ visibleRooms.length }}</b> 间</span>
        <span v-else>共 <b>{{ visibleRooms.length }}</b> 间，点时段只看当时空着的教室</span>
        <span class="rooms-legend" aria-hidden="true">
          <i class="is-free"></i>空闲
          <i class="is-busy"></i>占用：课 / 研究生课 / 借用 / 调课
        </span>
      </p>

      <p v-if="!visibleRooms.length" class="rooms-empty">这个时段没有空闲的教室，换个时段或教学楼试试。</p>
      <div v-else class="rooms-grid" :style="{ '--rooms-slot-count': data.slots.length }">
        <div v-for="room in visibleRooms" :key="room.name" class="rooms-row">
          <span class="rooms-name">
            <b>{{ room.name }}</b>
            <small v-if="room.seats">{{ room.seats }} 座</small>
          </span>
          <span
            v-for="(state, index) in room.states"
            :key="index"
            class="rooms-cell"
            :class="[state ? 'is-busy' : 'is-free', { 'is-picked': selectedSlots.includes(index) }]"
            :aria-label="`${data.slots[index]?.periods} 节${state ? '占用' : '空闲'}`"
          >{{ state ? stateLabels[state] || "占" : slotStarts[index] }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ROOM_STATE_LABELS,
  currentSlotIndex,
  filterRooms,
  roomBuildings,
  shanghaiClock,
  shanghaiDate,
  type FreeRoom,
  type FreeRoomSlot,
} from "./recordCards";

interface FreeRoomsData {
  date: string;
  week: number;
  day: number;
  slots: FreeRoomSlot[];
  rooms: FreeRoom[];
}

const props = defineProps<{ data: FreeRoomsData | null }>();
const emit = defineEmits<{ (event: "change-date", date: string): void }>();

const stateLabels = ROOM_STATE_LABELS;
const today = shanghaiDate();
const quickDates = [
  { label: "今天", value: today },
  { label: "明天", value: shanghaiDate(1) },
  { label: "后天", value: shanghaiDate(2) },
];
const date = ref(props.data?.date || today);
const building = ref("");
const selectedSlots = ref<number[]>([]);
let slotsPickedFor = "";

const weekdayLabel = computed(() => `星期${"一二三四五六日"[(props.data?.day ?? 1) - 1] ?? ""}`);
const buildings = computed(() => roomBuildings(props.data?.rooms ?? []));
// 午间和傍晚两个时段没有“第几大节”的叫法，直接用名字，格子里写“午”“晚”。
const slotTitles = computed(() => (props.data?.slots ?? []).map((slot) => (
  /大节/.test(slot.name) || !slot.name ? `${slot.periods} 节` : slot.name
)));
const slotStarts = computed(() => (props.data?.slots ?? []).map((slot) => {
  if (/午/.test(slot.name)) return "午";
  if (/晚/.test(slot.name)) return "晚";
  return slot.periods.split("-")[0];
}));
const visibleRooms = computed(() => filterRooms(props.data?.rooms ?? [], {
  building: building.value,
  slots: selectedSlots.value,
}));

watch(() => props.data, (next) => {
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
  emit("change-date", value);
}

function onDateInput(event: Event) {
  pickDate((event.target as HTMLInputElement).value);
}

function toggleSlot(index: number) {
  selectedSlots.value = selectedSlots.value.includes(index)
    ? selectedSlots.value.filter((item) => item !== index)
    : [...selectedSlots.value, index].sort((a, b) => a - b);
}
</script>

<style scoped lang="scss">
.rooms { display: flex; flex-direction: column; gap: 10px; }
.rooms-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.rooms-dates { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.rooms-dates button,
.rooms-chips button {
  --cpu-button-radius: var(--cpu-radius-s);
  min-height: 30px;
  padding: 0 10px;
  font: inherit;
  font-size: var(--cpu-fs-s);
  cursor: pointer;
}
.rooms-date-input {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--cpu-border-soft);
  border-radius: var(--cpu-radius-s);
  background: var(--cpu-card);
  color: var(--cpu-text);
  font: inherit;
  font-size: var(--cpu-fs-s);
  color-scheme: light dark;
}
.rooms-when { color: var(--cpu-text-secondary); font-size: var(--cpu-fs-s); }
.rooms-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.rooms-chips button { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; min-height: 40px; }
.rooms-chips button b { font-size: var(--cpu-fs-s); font-weight: 500; }
.rooms-chips button span { font-size: var(--cpu-fs-xs); opacity: 0.75; font-variant-numeric: tabular-nums; }
.rooms-chips.is-slots { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rooms-chips.is-slots button { min-width: 0; padding: 0 4px; }
.rooms-chips.is-buildings {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.rooms-chips.is-buildings::-webkit-scrollbar { display: none; }
.rooms-chips.is-buildings button { flex-shrink: 0; min-height: 30px; white-space: nowrap; }
@media (min-width: 900px) {
  .rooms-chips.is-slots { grid-template-columns: repeat(8, minmax(0, 1fr)); }
}
.rooms-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  margin: 0;
  color: var(--cpu-text-secondary);
  font-size: var(--cpu-fs-xs);
  line-height: 1.6;
}
.rooms-summary b { color: var(--cpu-primary); font-weight: 500; }
.rooms-legend { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--cpu-text-muted); }
.rooms-legend i { display: inline-block; width: 12px; height: 12px; margin-left: 6px; border-radius: 3px; }
.rooms-legend i.is-free { background: var(--cpu-hue-green-bg); }
.rooms-legend i.is-busy { background: var(--cpu-track); }
.rooms-empty {
  margin: 0;
  padding: 18px 12px;
  border: 1px dashed var(--cpu-border-soft);
  border-radius: var(--cpu-radius-m);
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-s);
  text-align: center;
}
.rooms-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  gap: 0 16px;
  border-top: 1px solid var(--cpu-border-soft);
}
.rooms-row {
  display: grid;
  grid-template-columns: minmax(76px, 1.5fr) repeat(var(--rooms-slot-count), minmax(26px, 1fr));
  align-items: center;
  gap: 3px;
  padding: 3px 0;
  border-bottom: 1px solid var(--cpu-border-soft);
}
.rooms-name { display: flex; min-width: 0; align-items: baseline; gap: 5px; }
.rooms-name b {
  overflow: hidden;
  color: var(--cpu-text);
  font-size: var(--cpu-fs-s);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rooms-name small { flex-shrink: 0; color: var(--cpu-text-muted); font-size: var(--cpu-fs-xs); }
.rooms-cell {
  display: flex;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: var(--cpu-text-muted);
  font-size: var(--cpu-fs-xs);
  font-variant-numeric: tabular-nums;
}
.rooms-cell.is-free { background: var(--cpu-hue-green-bg); color: var(--cpu-hue-green-ink); }
.rooms-cell.is-busy { background: var(--cpu-track); }
.rooms-cell.is-picked { box-shadow: inset 0 0 0 1px var(--cpu-primary); }
</style>
