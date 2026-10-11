// 把课表检索的一行行排课排进周网格。网格、课程速览用的都是「我的课表」那一套，
// 这里只做数据换算：排课行 → 课程块 → 某一周每一天要画的东西。
import { placeCourseBlocks } from "../../../views/schedule/displayPriority";
import { selectOffWeekBlocks } from "../../../views/schedule/displaySettings";
import type { StyledDay } from "../../../views/schedule/styledTypes";
import type { WeekCourseBlock } from "../../../views/schedule/types";
import { WEEKDAYS, weeksInclude, type TimetableRow } from "./recordCards";

/** 教学周最多算到第几周。 */
export const MAX_TEACHING_WEEK = 30;

/** “1-2”“01-02节”“9-11” → 起止小节；读不出来是 null。 */
export function parsePeriods(text: string | undefined): { start: number; end: number } | null {
  const numbers = (text ?? "").match(/\d+/g)?.map((value) => Number.parseInt(value, 10)).filter((value) => value > 0) ?? [];
  if (!numbers.length) return null;
  return { start: Math.min(...numbers), end: Math.max(...numbers) };
}

/** 这一行在哪几周上；没写周次时返回空数组，表示每周都上。 */
export function weekListOf(weeks: string | undefined, weekType?: string, max = MAX_TEACHING_WEEK) {
  if (!weeks) return [];
  const list: number[] = [];
  for (let week = 1; week <= max; week += 1) {
    if (weeksInclude(weeks, weekType, week)) list.push(week);
  }
  return list;
}

/** [1,2,3,8,10] → “1-3、8、10周”；整串都隔周时写成“1-15周(单)”。 */
export function formatWeekList(list: number[]) {
  const weeks = [...new Set(list)].sort((a, b) => a - b);
  if (!weeks.length) return "";
  if (weeks.length >= 3 && weeks.every((week, index) => index === 0 || week - weeks[index - 1] === 2)) {
    return `${weeks[0]}-${weeks[weeks.length - 1]}周(${weeks[0] % 2 ? "单" : "双"})`;
  }
  const runs: string[] = [];
  let from = weeks[0];
  let to = weeks[0];
  for (const week of weeks.slice(1)) {
    if (week === to + 1) {
      to = week;
      continue;
    }
    runs.push(from === to ? String(from) : `${from}-${to}`);
    from = week;
    to = week;
  }
  runs.push(from === to ? String(from) : `${from}-${to}`);
  return `${runs.join("、")}周`;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => (value ?? "").trim()).filter(Boolean))];
}

export interface TimetableBlocks {
  blocks: WeekCourseBlock[];
  /** 没有星期、节次，或者节次不在节次表里的排课，网格里画不出来。 */
  unplaced: TimetableRow[];
}

/**
 * 排课行换成课程块。同一门课在同一时间、同一间教室的几行（前后半学期换老师、
 * 几个班合上）并成一块：周次取并集，老师和班级各列一遍。
 * `withClasses` 打开时把上课班级写进备注，查班级课表时班级就是自己，不用写。
 */
export function timetableBlocks(
  rows: TimetableRow[],
  options: { maxSlot?: number; withClasses?: boolean } = {},
): TimetableBlocks {
  const maxSlot = options.maxSlot ?? 12;
  const groups = new Map<string, { day: number; start: number; end: number; rows: TimetableRow[] }>();
  const unplaced: TimetableRow[] = [];
  for (const row of rows) {
    const day = WEEKDAYS.indexOf(row.weekday ?? "") + 1;
    const range = parsePeriods(row.periods);
    if (!day || !range || range.end > maxSlot) {
      unplaced.push(row);
      continue;
    }
    const key = [day, range.start, range.end, row.courseName, row.room ?? row.building ?? ""].join("|");
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { day, start: range.start, end: range.end, rows: [row] });
  }

  const blocks = [...groups.values()]
    .sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end)
    .map((group, index): WeekCourseBlock => {
      const first = group.rows[0];
      // 有一行没写周次就当每周都上。
      const everyWeek = group.rows.some((row) => !row.weeks);
      const weekList = everyWeek ? [] : [...new Set(group.rows.flatMap((row) => weekListOf(row.weeks, row.weekType)))].sort((a, b) => a - b);
      const classes = options.withClasses ? unique(group.rows.map((row) => row.className)) : [];
      return {
        day: group.day,
        bigSlot: Math.max(1, Math.ceil(group.start / 2)),
        startSlot: group.start,
        endSlot: group.end,
        index,
        course: {
          name: first.courseName,
          teacher: unique(group.rows.map((row) => row.teacher)).join("、") || undefined,
          location: first.room ?? first.building,
          weeks: formatWeekList(weekList),
          weekList,
          startSlot: group.start,
          endSlot: group.end,
          ...(classes.length ? { slotNote: `上课班级：${classes.join("、")}` } : {}),
        },
      };
    });
  return { blocks, unplaced };
}

function inWeek(block: WeekCourseBlock, week: number) {
  return !block.course.weekList.length || block.course.weekList.includes(week);
}

/** 网格可以翻到第几周：校历的周数和排课里出现过的最后一周，取大的。 */
export function timetableWeekCount(blocks: WeekCourseBlock[], calendarWeeks = 0) {
  const last = Math.max(0, ...blocks.flatMap((block) => block.course.weekList));
  return Math.min(MAX_TEACHING_WEEK, Math.max(1, calendarWeeks, last));
}

/** 周末两列只在整个学期里那天有课时才画，翻周的时候列数不变。 */
export function timetableColumns(blocks: WeekCourseBlock[]) {
  return [1, 2, 3, 4, 5, 6, 7].filter((day) => day <= 5 || blocks.some((block) => block.day === day));
}

export interface TimetableWeekInput {
  blocks: WeekCourseBlock[];
  week: number;
  /** 这一周周一到周日的日期（yyyy-MM-dd）；没有校历时不传，日期栏就只写星期。 */
  dates?: string[];
  today?: string;
  /** 放假的日期。 */
  holidays?: string[];
}

/** 某一周要画的每一天：这一周上的课，加上淡显在空节次里的非本周课程。 */
export function timetableWeekDays(input: TimetableWeekInput): StyledDay[] {
  const current = input.blocks.filter((block) => inWeek(block, input.week));
  const pieces = placeCourseBlocks(current);
  const offWeek = placeCourseBlocks(selectOffWeekBlocks(input.blocks, current, () => input.week));
  return timetableColumns(input.blocks).map((day) => {
    const rawDate = input.dates?.[day - 1] ?? "";
    const date = /^\d{4}-(\d{2})-(\d{2})$/.exec(rawDate);
    return {
      day,
      dateText: date ? `${date[1]}/${date[2]}` : "",
      rawDate,
      isToday: Boolean(rawDate) && rawDate === input.today,
      adjustmentKind: rawDate && input.holidays?.includes(rawDate) ? "off" : null,
      pieces: pieces.filter((piece) => piece.block.day === day),
      offWeekPieces: offWeek.filter((piece) => piece.block.day === day),
    };
  });
}

/** 这一周实际上的课有几节（合并后的课程块数）。 */
export function timetableWeekCourseCount(blocks: WeekCourseBlock[], week: number) {
  return blocks.filter((block) => inWeek(block, week)).length;
}
