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

/** 一门课在某个时间的一处上课地点：哪间教室、谁上、哪几周。 */
export interface TimetableSession {
  room: string;
  teachers: string[];
  /** 空数组表示每周都上。 */
  weekList: number[];
  classes: string[];
}

/** 课程块，带着它在这个时间的全部上课地点。 */
export interface TimetableBlock extends WeekCourseBlock {
  sessions: TimetableSession[];
}

export interface TimetableBlocks {
  blocks: TimetableBlock[];
  /** 没有星期、节次，或者节次不在节次表里的排课，网格里画不出来。 */
  unplaced: TimetableRow[];
}

function mergedWeeks(lists: number[][]) {
  // 有一处没写周次就当每周都上。
  if (lists.some((list) => !list.length)) return [];
  return [...new Set(lists.flat())].sort((a, b) => a - b);
}

function sessionInWeek(session: TimetableSession, week: number) {
  return !session.weekList.length || session.weekList.includes(week);
}

/**
 * 课程块上显示什么。只在一间教室上的课写教室和老师；分在好几间教室同时上的课
 * （大学英语这种分级教学）写“N 个教室”，每间教室谁上列在备注里。
 */
function describeSessions(name: string, sessions: TimetableSession[], withClasses: boolean): WeekCourseBlock["course"] {
  const weekList = mergedWeeks(sessions.map((session) => session.weekList));
  const base = { name, weeks: formatWeekList(weekList), weekList };
  if (sessions.length === 1) {
    const [only] = sessions;
    return {
      ...base,
      teacher: only.teachers.join("、") || undefined,
      location: only.room || undefined,
      ...(withClasses && only.classes.length ? { slotNote: `上课班级：${only.classes.join("、")}` } : {}),
    };
  }
  const sameWeeks = sessions.every((session) => session.weekList.join() === sessions[0].weekList.join());
  const lines = sessions.map((session) => [
    session.room || "教室未定",
    session.teachers.join("、"),
    sameWeeks ? "" : formatWeekList(session.weekList),
    withClasses ? session.classes.join("、") : "",
  ].filter(Boolean).join(" · "));
  // 周次有重合才是“同时”分班上；前后半学期各在一间教室的是换教室。
  const together = sessions.some((a, i) => sessions.some((b, j) => i < j && (
    !a.weekList.length || !b.weekList.length || a.weekList.some((week) => b.weekList.includes(week))
  )));
  const lead = together ? `分 ${sessions.length} 个教室同时上` : `先后在 ${sessions.length} 个教室上`;
  return {
    ...base,
    location: `${sessions.length} 个教室`,
    slotNote: `${lead}：\n${lines.join("\n")}`,
  };
}

/**
 * 排课行换成课程块。同一门课在同一时间的几行并成一块：同一间教室的（前后半学期换老师、
 * 几个班合上）算一处，周次取并集；分在好几间教室的各算一处，格子里仍然只占一格。
 * `withClasses` 打开时把上课班级写进备注，查班级课表时班级就是自己，不用写。
 */
export function timetableBlocks(
  rows: TimetableRow[],
  options: { maxSlot?: number; withClasses?: boolean } = {},
): TimetableBlocks {
  const maxSlot = options.maxSlot ?? 12;
  const withClasses = Boolean(options.withClasses);
  const groups = new Map<string, { day: number; start: number; end: number; name: string; rooms: Map<string, TimetableRow[]> }>();
  const unplaced: TimetableRow[] = [];
  for (const row of rows) {
    const day = WEEKDAYS.indexOf(row.weekday ?? "") + 1;
    const range = parsePeriods(row.periods);
    if (!day || !range || range.end > maxSlot) {
      unplaced.push(row);
      continue;
    }
    const key = [day, range.start, range.end, row.courseName].join("|");
    let group = groups.get(key);
    if (!group) {
      group = { day, start: range.start, end: range.end, name: row.courseName, rooms: new Map() };
      groups.set(key, group);
    }
    const room = (row.room ?? row.building ?? "").trim();
    group.rooms.set(room, [...(group.rooms.get(room) ?? []), row]);
  }

  const blocks = [...groups.values()]
    .sort((a, b) => a.day - b.day || a.start - b.start || a.end - b.end)
    .map((group, index): TimetableBlock => {
      const sessions = [...group.rooms.entries()]
        .map(([room, list]): TimetableSession => ({
          room,
          teachers: unique(list.map((row) => row.teacher)),
          weekList: mergedWeeks(list.map((row) => weekListOf(row.weeks, row.weekType))),
          classes: unique(list.map((row) => row.className)),
        }))
        .sort((a, b) => a.room.localeCompare(b.room, "zh-Hans-CN"));
      return {
        day: group.day,
        bigSlot: Math.max(1, Math.ceil(group.start / 2)),
        startSlot: group.start,
        endSlot: group.end,
        index,
        course: { ...describeSessions(group.name, sessions, withClasses), startSlot: group.start, endSlot: group.end },
        sessions,
      };
    });
  return { blocks, unplaced };
}

function inWeek(block: WeekCourseBlock, week: number) {
  return !block.course.weekList.length || block.course.weekList.includes(week);
}

/**
 * 这一周画出来的课程块：教室和老师只写这一周真的在上的那几处。前半学期在一间教室、
 * 后半学期换到另一间的课，每一周都写当周那间教室；周次和备注里的完整安排仍然是整门课的。
 */
function blockForWeek(block: TimetableBlock, week: number, withClasses: boolean): WeekCourseBlock {
  const active = block.sessions.filter((session) => sessionInWeek(session, week));
  if (!active.length || active.length === block.sessions.length) return block;
  const { location, teacher } = describeSessions(block.course.name, active, withClasses);
  return { ...block, course: { ...block.course, location, teacher } };
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
  blocks: TimetableBlock[];
  week: number;
  /** 和 timetableBlocks 用同一个值。 */
  withClasses?: boolean;
  /** 这一周周一到周日的日期（yyyy-MM-dd）；没有校历时不传，日期栏就只写星期。 */
  dates?: string[];
  today?: string;
  /** 放假的日期。 */
  holidays?: string[];
}

/** 某一周要画的每一天：这一周上的课，加上淡显在空节次里的非本周课程。 */
export function timetableWeekDays(input: TimetableWeekInput): StyledDay[] {
  const current = input.blocks
    .filter((block) => inWeek(block, input.week))
    .map((block) => blockForWeek(block, input.week, Boolean(input.withClasses)));
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
