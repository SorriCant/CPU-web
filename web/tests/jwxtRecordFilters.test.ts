import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRooms,
  filterTimetable,
  recordGroups,
  roomTypes,
  sortRooms,
  timetableCsv,
  timetableDayGroups,
  weeksInclude,
  type FreeRoom,
  type TimetableRow,
} from "../src/components/jwxt/records/recordCards";

const slots = [
  { name: "第一大节", periods: "1-2", start: "08:00", end: "09:40" },
  { name: "第二大节", periods: "3-4", start: "09:55", end: "11:35" },
  { name: "中午", periods: "13-14", start: "11:40", end: "13:15" },
  { name: "第三大节", periods: "5-6", start: "13:30", end: "15:10" },
];
const rooms: FreeRoom[] = [
  { name: "A104", seats: 100, type: "多媒体教室", states: ["", "", "class", ""] },
  { name: "B201", seats: 187, type: "多媒体智慧教室", states: ["", "", "", ""] },
  { name: "E101", seats: 48, type: "PBL智慧教室", states: ["class", "", "", "class"] },
  { name: "E104", seats: 159, type: "多媒体教室", states: ["", "class", "", ""] },
];
const names = (list: FreeRoom[]) => list.map((room) => room.name);

test("rooms can be narrowed by seats, type and room number on top of the free-slot filter", () => {
  assert.deepEqual(names(filterRooms(rooms, { minSeats: 100 })), ["A104", "B201", "E104"]);
  assert.deepEqual(names(filterRooms(rooms, { type: "多媒体教室" })), ["A104", "E104"]);
  assert.deepEqual(names(filterRooms(rooms, { keyword: " e1 " })), ["E101", "E104"]);
  assert.deepEqual(names(filterRooms(rooms, { slots: [1], minSeats: 100, type: "多媒体教室" })), ["A104"]);
  assert.deepEqual(roomTypes(rooms), ["PBL智慧教室", "多媒体教室", "多媒体智慧教室"].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")));
});

test("sorting by free time uses the run from the chosen slot, or the day total when none is chosen", () => {
  // 从第二大节起：B201 一直空到 15:10，E101 到 13:15，A104 到 11:35。
  const free = filterRooms(rooms, { slots: [1] });
  assert.deepEqual(names(sortRooms(free, "free", slots, 1)), ["B201", "E101", "A104"]);
  // 没选时段：按全天空闲的时段数。
  assert.deepEqual(names(sortRooms(rooms, "free", slots, -1)), ["B201", "E104", "A104", "E101"]);
  assert.deepEqual(names(sortRooms(rooms, "seats", slots, -1)), ["B201", "E104", "A104", "E101"]);
  assert.equal(sortRooms(rooms, "building", slots, -1), rooms);
});

test("week ranges, lists and odd/even weeks are all understood", () => {
  assert.equal(weeksInclude("1-8", undefined, 8), true);
  assert.equal(weeksInclude("1-8", undefined, 9), false);
  assert.equal(weeksInclude("3,5,7-9", undefined, 5), true);
  assert.equal(weeksInclude("3,5,7-9", undefined, 6), false);
  assert.equal(weeksInclude("3-14", "单周", 4), false);
  assert.equal(weeksInclude("3-14", "单周", 5), true);
  assert.equal(weeksInclude("2-16", "双周", 5), false);
  assert.equal(weeksInclude(undefined, undefined, 5), true);
});

const timetable: TimetableRow[] = [
  { courseName: "药事管理", teacher: "杜老师", room: "B311", weekday: "星期五", periods: "1-2", weeks: "8-17", credits: 2 },
  { courseName: "人工智能药学", teacher: "徐老师", room: "B211", weekday: "星期二", periods: "9-10", weeks: "1-8" },
  { courseName: "药剂学实验", teacher: "王老师", weekday: "星期三", periods: "1-4", weeks: "3-14", weekType: "单周", className: '药化"05"班,药化06班' },
];

test("a timetable can be cut down to one weekday or to the classes held in a given week", () => {
  assert.deepEqual(filterTimetable(timetable, { weekday: "星期二" }).map((row) => row.courseName), ["人工智能药学"]);
  assert.deepEqual(filterTimetable(timetable, { week: 4 }).map((row) => row.courseName), ["人工智能药学"]);
  assert.deepEqual(filterTimetable(timetable, { week: 9 }).map((row) => row.courseName), ["药事管理", "药剂学实验"]);
  assert.equal(filterTimetable(timetable, {}).length, 3);
});

test("results are grouped one weekday at a time, in weekday order", () => {
  const groups = timetableDayGroups(timetable);
  assert.deepEqual(groups.map((group) => [group.label, group.note, group.cards[0].title]), [
    ["星期二", "1 节", "人工智能药学"],
    ["星期三", "1 节", "药剂学实验"],
    ["星期五", "1 节", "药事管理"],
  ]);
  assert.equal(new Set(groups.flatMap((group) => group.cards.map((card) => card.key))).size, 3);
});

test("the exported sheet quotes commas and quotes so Excel keeps the columns", () => {
  const lines = timetableCsv(timetable).split("\r\n");
  assert.equal(lines[0], "星期,节次,周次,课程,教师,教室,上课班级,学分,学时,课程属性,考核方式,开课单位");
  assert.equal(lines[1], "星期五,1-2,8-17,药事管理,杜老师,B311,,2,,,,");
  assert.equal(lines[3], '星期三,1-4,3-14(单周),药剂学实验,王老师,,"药化""05""班,药化06班",,,,,');
});

test("a textbook card no longer claims the student ordered it", () => {
  const [group] = recordGroups("textbooks", { list: [{ title: "波谱解析", price: 79, ordered: "是", courseName: "药物光谱分析与解析" }] });
  assert.equal(group.cards[0].badge, undefined);
  assert.equal(group.cards[0].value, "¥79.00");
});
