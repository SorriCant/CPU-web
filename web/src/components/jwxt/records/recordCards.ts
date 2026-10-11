// 把 /api/jwxt/records 各类数据整理成统一的卡片条目，页面只管排版。

export type RecordKind =
  | "level-exams"
  | "term-courses"
  | "enrollment"
  | "textbooks"
  | "graduation-audit"
  | "election-rounds"
  | "student-status"
  | "major-transfer"
  | "retake-options"
  | "grade-summary"
  | "free-rooms"
  | "timetable-search";

export type RecordTone = "accent" | "ok" | "warn" | "muted";

export interface RecordCard {
  key: string;
  title: string;
  sub?: string;
  badge?: string;
  badgeTone?: RecordTone;
  value?: string;
  valueLabel?: string;
  meta: string[];
  lines: string[];
}

export interface RecordCardGroup {
  key: string;
  label: string;
  note?: string;
  cards: RecordCard[];
}

type Row = Record<string, any>;

function compact(values: Array<string | false | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

function credit(value: unknown) {
  return typeof value === "number" ? `${value} 学分` : "";
}

function hours(value: unknown) {
  return typeof value === "number" && value > 0 ? `${value} 学时` : "";
}

function categoryTone(value?: string): RecordTone {
  if (!value) return "muted";
  if (/必修/.test(value)) return "accent";
  if (/公选|通识|任选/.test(value)) return "ok";
  return "muted";
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}

function keyed(cards: Omit<RecordCard, "key">[], prefix: string): RecordCard[] {
  return cards.map((card, index) => ({ ...card, key: `${prefix}-${index}` }));
}

function levelExamCards(data: Row) {
  return keyed(rows(data.list).map((row) => ({
    title: row.name,
    sub: compact([row.date, row.endDate && row.endDate !== row.date ? `至 ${row.endDate}` : ""]).join(" "),
    value: row.score ? String(row.score) : row.grade || "未出分",
    valueLabel: row.score ? "总成绩" : undefined,
    meta: compact([
      row.written ? `笔试 ${row.written}` : "",
      row.practical ? `机试 ${row.practical}` : "",
      row.score && row.grade ? `等级 ${row.grade}` : "",
    ]),
    lines: compact([row.note]),
  })), "level");
}

function termCourseCards(data: Row) {
  return keyed(rows(data.list).map((row) => ({
    title: row.courseName,
    sub: compact([row.teacher, row.courseCode]).join(" · "),
    badge: row.category,
    badgeTone: categoryTone(row.category),
    value: typeof row.credits === "number" ? String(row.credits) : undefined,
    valueLabel: typeof row.credits === "number" ? "学分" : undefined,
    meta: compact([
      row.nature,
      row.assessment ? `考核：${row.assessment}` : "",
      hours(row.hours),
      ...rows(row.hourBreakdown).map((item) => `${item.label} ${item.hours}`),
      typeof row.enrolled === "number"
        ? `已选 ${row.enrolled}${typeof row.capacity === "number" ? ` / ${row.capacity}` : ""} 人`
        : "",
      row.group,
    ]),
    lines: compact([...(Array.isArray(row.sessions) ? row.sessions : []), row.className ? `教学班：${row.className}` : ""]),
  })), "course");
}

function enrollmentGroups(data: Row): RecordCardGroup[] {
  const selected = keyed(rows(data.selected).map((row) => ({
    title: row.courseName,
    sub: compact([row.teacher, row.courseCode]).join(" · "),
    badge: row.category,
    badgeTone: categoryTone(row.category),
    value: typeof row.credits === "number" ? String(row.credits) : undefined,
    valueLabel: typeof row.credits === "number" ? "学分" : undefined,
    meta: compact([row.nature, hours(row.hours), row.department, row.status ? `审核：${row.status}` : ""]),
    lines: compact([
      ...(Array.isArray(row.sessions) ? row.sessions : []),
      row.className ? `教学班：${row.className}` : "",
      row.comment,
    ]),
  })), "selected");
  const dropped = keyed(rows(data.dropped).map((row) => ({
    title: row.courseName,
    sub: compact([row.teacher, row.courseCode]).join(" · "),
    badge: row.dropType || "已退课",
    badgeTone: "warn" as const,
    meta: compact([credit(row.credits), row.nature, row.selectionType, row.droppedAt ? `退课于 ${row.droppedAt}` : ""]),
    lines: compact([row.time, row.note]),
  })), "dropped");
  const groups: RecordCardGroup[] = [{
    key: "selected",
    label: "已选课程",
    note: selected.length ? `${selected.length} 门 · ${data.credits ?? 0} 学分` : undefined,
    cards: selected,
  }];
  if (dropped.length) groups.push({ key: "dropped", label: "退课记录", note: `${dropped.length} 门`, cards: dropped });
  return groups;
}

function textbookCards(data: Row) {
  return keyed(rows(data.list).map((row) => ({
    title: row.title,
    sub: compact([row.author, row.publisher, row.edition]).join(" · "),
    badge: row.ordered === "是" ? "已征订" : row.ordered === "否" ? "未征订" : undefined,
    badgeTone: row.ordered === "是" ? "ok" as const : "muted" as const,
    value: typeof row.price === "number" ? `¥${row.price.toFixed(2)}` : undefined,
    valueLabel: typeof row.price === "number" ? "定价" : undefined,
    meta: compact([row.courseName, row.teacher, row.nature]),
    lines: compact([row.isbn ? `ISBN ${row.isbn}` : ""]),
  })), "book");
}

function auditGroups(data: Row): RecordCardGroup[] {
  return rows(data.groups).map((group) => ({
    key: group.key,
    label: group.label,
    note: `${rows(group.list).length} 门 · ${group.credits ?? 0} 学分`,
    cards: keyed(rows(group.list).map((row) => ({
      title: row.courseName,
      sub: compact([row.semester, row.courseCode]).join(" · "),
      badge: row.category,
      badgeTone: categoryTone(row.category),
      value: row.score || (typeof row.credits === "number" ? String(row.credits) : undefined),
      valueLabel: row.score ? "成绩" : typeof row.credits === "number" ? "学分" : undefined,
      meta: compact([row.system, row.nature, row.score ? credit(row.credits) : "", hours(row.hours)]),
      lines: [],
    })), `audit-${group.key}`),
  }));
}

function roundState(row: Row, now: number): { label: string; tone: RecordTone } | null {
  const start = Date.parse(String(row.startsAt || "").replace(" ", "T"));
  const end = Date.parse(String(row.endsAt || "").replace(" ", "T"));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (now < start) return { label: "未开始", tone: "muted" };
  if (now > end) return { label: "已结束", tone: "muted" };
  return { label: "进行中", tone: "ok" };
}

function electionRoundCards(data: Row, now: number) {
  return keyed(rows(data.list).map((row) => {
    const state = roundState(row, now);
    return {
      title: row.name,
      sub: row.semester,
      badge: state?.label,
      badgeTone: state?.tone,
      meta: compact([row.policy]),
      lines: compact([row.startsAt && row.endsAt ? `${row.startsAt} 至 ${row.endsAt}` : row.startsAt || row.endsAt]),
    };
  }), "round");
}

function statusGroups(data: Row): RecordCardGroup[] {
  return [{
    key: "warnings",
    label: "学籍预警",
    note: rows(data.warnings).length ? `${rows(data.warnings).length} 条` : "无",
    cards: keyed(rows(data.warnings).map((row) => ({
      title: row.name,
      sub: row.semester,
      badge: row.result,
      badgeTone: "warn" as const,
      meta: compact([row.target, row.outcome]),
      lines: compact([row.reason]),
    })), "warning"),
  }, {
    key: "changes",
    label: "学籍异动",
    note: rows(data.changes).length ? `${rows(data.changes).length} 条` : "无",
    cards: keyed(rows(data.changes).map((row) => ({
      title: row.type,
      badge: row.review,
      badgeTone: "muted" as const,
      meta: [],
      lines: compact([
        Array.isArray(row.from) && row.from.length ? `原：${row.from.join(" / ")}` : "",
        Array.isArray(row.to) && row.to.length ? `现：${row.to.join(" / ")}` : "",
      ]),
    })), "change"),
  }];
}

function majorTransferCards(data: Row) {
  return keyed(rows(data.list).map((row) => ({
    title: row.major,
    sub: compact([row.college, row.grade ? `${row.grade} 级` : "", row.semester]).join(" · "),
    value: typeof row.quota === "number" ? `${row.applicants ?? 0} / ${row.quota}` : undefined,
    valueLabel: typeof row.quota === "number" ? "报名 / 拟接收" : undefined,
    meta: compact([row.assessment ? `考核：${row.assessment}` : "", row.window ? `申请时间 ${row.window}` : ""]),
    lines: compact([row.condition, row.excluded ? `不接收：${row.excluded}` : ""]),
  })), "transfer");
}

function retakeCards(data: Row) {
  return keyed(rows(data.list).map((row) => ({
    title: row.courseName,
    sub: compact([row.courseCode, row.examType]).join(" · "),
    badge: row.offered ? "本学期开课" : "本学期未开课",
    badgeTone: row.offered ? "ok" as const : "muted" as const,
    value: row.bestScore,
    valueLabel: row.bestScore ? "最好成绩" : undefined,
    meta: compact([
      row.category,
      row.nature,
      credit(row.credits),
      row.qualified ? "已取得资格" : "",
      row.registered ? "已报名" : "",
      row.selected ? "已选课" : "",
    ]),
    lines: [],
  })), "retake");
}

export function timetableCards(data: Row | null | undefined) {
  return keyed(rows(data?.list).map((row) => ({
    title: row.courseName,
    sub: compact([row.teacher, row.teacherTitle]).join(" · "),
    badge: row.category,
    badgeTone: categoryTone(row.category),
    meta: compact([
      compact([row.weekday, row.periods ? `${row.periods} 节` : ""]).join(" "),
      row.weeks ? `${row.weeks} 周${row.weekType ? `（${row.weekType}）` : ""}` : "",
      compact([row.building, row.room]).join(" "),
      typeof row.enrolled === "number" ? `${row.enrolled} 人` : "",
      row.assessment ? `考核：${row.assessment}` : "",
    ]),
    lines: compact([row.className, row.department]),
  })), "timetable");
}

/** 单组数据（没有分组标题）也按一组返回，页面统一渲染。 */
export function recordGroups(kind: RecordKind, data: Row | null | undefined, now = Date.now()): RecordCardGroup[] {
  if (!data) return [];
  const single = (cards: RecordCard[]): RecordCardGroup[] => [{ key: kind, label: "", cards }];
  switch (kind) {
    case "level-exams": return single(levelExamCards(data));
    case "term-courses": return single(termCourseCards(data));
    case "enrollment": return enrollmentGroups(data);
    case "textbooks": return single(textbookCards(data));
    case "graduation-audit": return auditGroups(data);
    case "election-rounds": return single(electionRoundCards(data, now));
    case "student-status": return statusGroups(data);
    case "major-transfer": return single(majorTransferCards(data));
    case "retake-options": return single(retakeCards(data));
    case "timetable-search": return single(timetableCards(data));
    default: return [];
  }
}

// ============ 空教室 ============

export interface FreeRoomSlot { name: string; periods: string; start: string; end: string }
export interface FreeRoom { name: string; type?: string; seats?: number; examSeats?: number; states: string[] }

/** “A104”“D106-1”归到 A 楼、D 楼，其余（礼堂、体育馆等）归到“其他”。 */
export function roomBuilding(name: string) {
  const match = /^([A-Za-z])\d/.exec(name.trim());
  return match ? `${match[1].toUpperCase()} 楼` : "其他";
}

export function roomBuildings(rooms: FreeRoom[]) {
  const names = Array.from(new Set(rooms.map((room) => roomBuilding(room.name))));
  return names.sort((a, b) => Number(a === "其他") - Number(b === "其他") || a.localeCompare(b));
}

/** 所选时段全部空闲才算空；没选时段时不按占用过滤。 */
export function filterRooms(rooms: FreeRoom[], options: { building?: string; slots?: number[] }) {
  const slots = options.slots ?? [];
  return rooms.filter((room) => {
    if (options.building && roomBuilding(room.name) !== options.building) return false;
    return slots.every((index) => !room.states[index]);
  });
}

/** 今天正在进行或即将开始的那个时段；全部结束后返回 -1。 */
export function currentSlotIndex(slots: FreeRoomSlot[], hhmm: string) {
  return slots.findIndex((slot) => slot.end > hhmm);
}

export function shanghaiDate(offsetDays = 0, now = new Date()) {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  if (!offsetDays) return base;
  const [year, month, day] = base.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

export function shanghaiClock(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export const ROOM_STATE_LABELS: Record<string, string> = {
  class: "课",
  graduate: "研",
  borrowed: "借",
  rescheduled: "调",
  busy: "占",
};
