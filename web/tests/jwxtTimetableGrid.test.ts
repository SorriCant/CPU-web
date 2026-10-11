import assert from "node:assert/strict";
import test from "node:test";
import type { TimetableRow } from "../src/components/jwxt/records/recordCards";
import {
  formatWeekList,
  parsePeriods,
  timetableBlocks,
  timetableColumns,
  timetableWeekCount,
  timetableWeekCourseCount,
  timetableWeekDays,
  weekListOf,
} from "../src/components/jwxt/records/timetableGrid";

const rows: TimetableRow[] = [
  { courseName: "药物化学", teacher: "王老师", room: "B211", weekday: "星期一", periods: "1-2", weeks: "1-16" },
  // 同一门课、同一时间、同一间教室，前后半学期换老师：并成一块。
  { courseName: "人工智能药学", teacher: "徐老师", room: "B211", weekday: "星期二", periods: "9-10", weeks: "1-8", className: "药化24201505" },
  { courseName: "人工智能药学", teacher: "孙老师", room: "B211", weekday: "星期二", periods: "9-10", weeks: "15-17", className: "药化24201506" },
  // 和药物化学同一时间，只在后半学期上。
  { courseName: "药事管理", teacher: "杜老师", room: "B311", weekday: "星期一", periods: "1-2", weeks: "17-18" },
  { courseName: "物理化学实验", room: "实验楼305", weekday: "星期三", periods: "05-08节", weeks: "2-12", weekType: "双周" },
  { courseName: "形势与政策", weekday: "星期四", periods: "3-4" },
  { courseName: "午间讲座", weekday: "星期五", periods: "13-14", weeks: "3" },
  { courseName: "毕业实习", weeks: "1-18" },
];

test("period text becomes a slot range", () => {
  assert.deepEqual(parsePeriods("1-2"), { start: 1, end: 2 });
  assert.deepEqual(parsePeriods("05-08节"), { start: 5, end: 8 });
  assert.deepEqual(parsePeriods("9"), { start: 9, end: 9 });
  assert.equal(parsePeriods(""), null);
  assert.equal(parsePeriods(undefined), null);
});

test("week lists round-trip through the text the quick look shows", () => {
  assert.deepEqual(weekListOf("1-3,8", undefined), [1, 2, 3, 8]);
  assert.deepEqual(weekListOf("2-12", "双周"), [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(weekListOf(undefined), []);
  assert.equal(formatWeekList([1, 2, 3, 8, 10, 11]), "1-3、8、10-11周");
  assert.equal(formatWeekList([2, 4, 6, 8]), "2-8周(双)");
  assert.equal(formatWeekList([5]), "5周");
  assert.equal(formatWeekList([]), "");
});

test("rows merge into blocks and rows without a slot on the grid are set aside", () => {
  const { blocks, unplaced } = timetableBlocks(rows, { withClasses: true });
  assert.deepEqual(unplaced.map((row) => row.courseName), ["午间讲座", "毕业实习"]);
  assert.deepEqual(blocks.map((block) => [block.day, block.startSlot, block.endSlot, block.course.name]), [
    [1, 1, 2, "药物化学"],
    [1, 1, 2, "药事管理"],
    [2, 9, 10, "人工智能药学"],
    [3, 5, 8, "物理化学实验"],
    [4, 3, 4, "形势与政策"],
  ]);
  const merged = blocks[2].course;
  assert.equal(merged.teacher, "徐老师、孙老师");
  assert.deepEqual(merged.weekList, [1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17]);
  assert.equal(merged.weeks, "1-8、15-17周");
  assert.equal(merged.slotNote, "上课班级：药化24201505、药化24201506");
  assert.equal(blocks[3].course.weeks, "2-12周(双)");
  // 没写周次的课每周都上。
  assert.deepEqual(blocks[4].course.weekList, []);
  assert.equal(timetableBlocks(rows).blocks[2].course.slotNote, undefined);
});

test("a week shows its own courses and fades the others into free slots", () => {
  const { blocks } = timetableBlocks(rows);
  assert.equal(timetableWeekCount(blocks), 18);
  assert.equal(timetableWeekCount(blocks, 20), 20);
  assert.deepEqual(timetableColumns(blocks), [1, 2, 3, 4, 5]);

  const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
  const week6 = timetableWeekDays({ blocks, week: 6, dates, today: "2026-10-13", holidays: ["2026-10-15"] });
  assert.deepEqual(week6.map((day) => day.day), [1, 2, 3, 4, 5]);
  assert.deepEqual(week6.map((day) => day.pieces.map((piece) => piece.block.course.name)), [
    ["药物化学"], ["人工智能药学"], ["物理化学实验"], ["形势与政策"], [],
  ]);
  // 药事管理这一周不上，但它的节次被药物化学占着，不淡显。
  assert.deepEqual(week6.flatMap((day) => day.offWeekPieces ?? []), []);
  assert.deepEqual(week6.map((day) => day.isToday), [false, true, false, false, false]);
  assert.deepEqual(week6.map((day) => day.adjustmentKind), [null, null, null, "off", null]);
  assert.equal(week6[0].dateText, "10/12");
  assert.equal(timetableWeekCourseCount(blocks, 6), 4);

  // 第 9 周：人工智能药学停了、物理化学实验是单周，都淡显在空出来的节次里。
  const week9 = timetableWeekDays({ blocks, week: 9 });
  assert.deepEqual(week9.map((day) => day.pieces.map((piece) => piece.block.course.name)), [
    ["药物化学"], [], [], ["形势与政策"], [],
  ]);
  assert.deepEqual(week9.map((day) => (day.offWeekPieces ?? []).map((piece) => piece.block.course.name)), [
    [], ["人工智能药学"], ["物理化学实验"], [], [],
  ]);
  assert.deepEqual(week9.map((day) => [day.rawDate, day.dateText, day.isToday]), Array.from({ length: 5 }, () => ["", "", false]));

  // 第 17 周同一时间两门课并排。
  const week17 = timetableWeekDays({ blocks: timetableBlocks([...rows.slice(0, 4), { ...rows[0], weeks: "1-18" }]).blocks, week: 17 });
  assert.deepEqual(week17[0].pieces.map((piece) => [piece.block.course.name, piece.lane, piece.lanes]), [
    ["药物化学", 0, 2], ["药事管理", 1, 2],
  ]);
});

test("weekend columns appear only when the term has weekend classes", () => {
  const { blocks } = timetableBlocks([...rows, { courseName: "体育", weekday: "星期日", periods: "5-6", weeks: "1-4" }]);
  assert.deepEqual(timetableColumns(blocks), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(timetableWeekDays({ blocks, week: 10 }).map((day) => day.day), [1, 2, 3, 4, 5, 7]);
});

test("a course split over many rooms at one time takes one tile and lists the rooms", () => {
  // 分级教学：同一个班的大学英语同一时间分在好几间教室。
  const english: TimetableRow[] = ["E501", "E502", "D407", "B110"].map((room, index) => ({
    courseName: "大学英语（一）",
    teacher: ["王老师", "李老师", "赵老师", "钱老师"][index],
    room,
    weekday: "星期五",
    periods: "3-4",
    weeks: "4-19",
    className: `英语${index + 1}班`,
  }));
  const { blocks } = timetableBlocks([...english, rows[0]]);
  assert.deepEqual(blocks.map((block) => [block.day, block.course.name, block.sessions.length]), [
    [1, "药物化学", 1],
    [5, "大学英语（一）", 4],
  ]);
  const course = blocks[1].course;
  assert.equal(course.location, "4 个教室");
  assert.equal(course.teacher, undefined);
  assert.equal(course.weeks, "4-19周");
  assert.equal(course.slotNote, "分 4 个教室同时上：\nB110 · 钱老师\nD407 · 赵老师\nE501 · 王老师\nE502 · 李老师");

  const friday = timetableWeekDays({ blocks, week: 7 })[4];
  assert.deepEqual(friday.pieces.map((piece) => [piece.block.course.location, piece.lanes]), [["4 个教室", 1]]);
  assert.equal(timetableWeekCourseCount(blocks, 7), 2);

  const withClasses = timetableBlocks(english, { withClasses: true }).blocks[0].course.slotNote ?? "";
  assert.ok(withClasses.includes("E501 · 王老师 · 英语1班"), withClasses);
});

test("a course that changes rooms mid-term shows the room of the week being viewed", () => {
  const moved: TimetableRow[] = [
    { courseName: "药理学", teacher: "周老师", room: "B211", weekday: "星期一", periods: "1-2", weeks: "1-8" },
    { courseName: "药理学", teacher: "吴老师", room: "E104", weekday: "星期一", periods: "1-2", weeks: "9-16" },
  ];
  const { blocks } = timetableBlocks(moved);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].course.location, "2 个教室");
  const plan = "先后在 2 个教室上：\nB211 · 周老师 · 1-8周\nE104 · 吴老师 · 9-16周";
  assert.equal(blocks[0].course.slotNote, plan);

  const shown = (week: number) => timetableWeekDays({ blocks, week })[0].pieces.map((piece) => piece.block.course);
  assert.deepEqual(shown(3).map((course) => [course.location, course.teacher, course.weeks, course.slotNote]), [
    ["B211", "周老师", "1-16周", plan],
  ]);
  assert.deepEqual(shown(12).map((course) => [course.location, course.teacher]), [["E104", "吴老师"]]);
  // 第 17 周不上：淡显时写全部安排。
  const week17 = timetableWeekDays({ blocks, week: 17 })[0];
  assert.deepEqual(week17.pieces, []);
  assert.deepEqual((week17.offWeekPieces ?? []).map((piece) => piece.block.course.location), ["2 个教室"]);
});
