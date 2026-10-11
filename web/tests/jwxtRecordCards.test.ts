import assert from "node:assert/strict";
import test from "node:test";
import {
  currentSlotIndex,
  filterRooms,
  recordGroups,
  roomBuilding,
  roomBuildings,
  shanghaiClock,
  shanghaiDate,
  type FreeRoom,
} from "../src/components/jwxt/records/recordCards";

const rooms: FreeRoom[] = [
  { name: "A104", seats: 100, states: ["", "class", ""] },
  { name: "D106-1", seats: 60, states: ["graduate", "", ""] },
  { name: "千人礼堂", states: ["", "", "borrowed"] },
];

test("rooms are grouped by the letter in front of the room number", () => {
  assert.equal(roomBuilding("A104"), "A 楼");
  assert.equal(roomBuilding("d106-1"), "D 楼");
  assert.equal(roomBuilding("经管文楼101"), "其他");
  assert.deepEqual(roomBuildings(rooms), ["A 楼", "D 楼", "其他"]);
});

test("a room counts as free only when every chosen slot is free", () => {
  assert.deepEqual(filterRooms(rooms, {}).map((room) => room.name), ["A104", "D106-1", "千人礼堂"]);
  assert.deepEqual(filterRooms(rooms, { slots: [0] }).map((room) => room.name), ["A104", "千人礼堂"]);
  assert.deepEqual(filterRooms(rooms, { slots: [0, 1] }).map((room) => room.name), ["千人礼堂"]);
  assert.deepEqual(filterRooms(rooms, { slots: [1, 2], building: "D 楼" }).map((room) => room.name), ["D106-1"]);
});

test("the default slot is the one in progress or about to start", () => {
  const slots = [
    { name: "第一大节", periods: "1-2", start: "08:00", end: "09:40" },
    { name: "第二大节", periods: "3-4", start: "09:55", end: "11:35" },
  ];
  assert.equal(currentSlotIndex(slots, "07:30"), 0);
  assert.equal(currentSlotIndex(slots, "09:45"), 1);
  assert.equal(currentSlotIndex(slots, "12:00"), -1);
});

test("dates and clock follow Beijing time whatever the device timezone is", () => {
  const lateEveningUtc = new Date("2026-10-10T17:30:00Z"); // 北京时间 10 月 11 日 01:30
  assert.equal(shanghaiDate(0, lateEveningUtc), "2026-10-11");
  assert.equal(shanghaiDate(1, lateEveningUtc), "2026-10-12");
  assert.equal(shanghaiDate(21, lateEveningUtc), "2026-11-01");
  assert.equal(shanghaiClock(lateEveningUtc), "01:30");
});

test("an exam without a score yet says so instead of showing zero", () => {
  const [group] = recordGroups("level-exams", {
    list: [
      { name: "英语考试(国家英语六级)", date: "2026-06-13" },
      { name: "英语考试(国家英语四级)", date: "2024-12-14", score: 552 },
    ],
  });
  assert.deepEqual(group.cards.map((card) => [card.value, card.valueLabel]), [["未出分", undefined], ["552", "总成绩"]]);
});

test("enrollment shows the dropped group only when something was dropped", () => {
  const selected = [{ courseName: "药理学", credits: 3, sessions: ["星期一 0506节 · B204"], category: "必修" }];
  assert.deepEqual(recordGroups("enrollment", { selected, dropped: [], credits: 3 }).map((group) => group.key), ["selected"]);
  const groups = recordGroups("enrollment", { selected, dropped: [{ courseName: "木材学", dropType: "学生退课" }], credits: 3 });
  assert.deepEqual(groups.map((group) => [group.key, group.note]), [["selected", "1 门 · 3 学分"], ["dropped", "1 门"]]);
  assert.equal(groups[0].cards[0].badgeTone, "accent");
  assert.equal(groups[1].cards[0].badge, "学生退课");
});

test("selection rounds are labelled against the current time", () => {
  const data = { list: [{ name: "新生公选课", startsAt: "2026-10-10 12:00", endsAt: "2026-10-13 00:00" }] };
  const at = (value: string) => recordGroups("election-rounds", data, Date.parse(value))[0].cards[0].badge;
  assert.equal(at("2026-10-09T08:00:00"), "未开始");
  assert.equal(at("2026-10-11T08:00:00"), "进行中");
  assert.equal(at("2026-10-14T08:00:00"), "已结束");
});

test("student status always lists both groups so an empty one reads as none", () => {
  const groups = recordGroups("student-status", { warnings: [], changes: [] });
  assert.deepEqual(groups.map((group) => [group.label, group.note, group.cards.length]), [
    ["学籍预警", "无", 0],
    ["学籍异动", "无", 0],
  ]);
});
