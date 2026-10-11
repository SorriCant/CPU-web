import assert from "node:assert/strict";
import test from "node:test";
import { importSessionSnapshot, logout } from "../src/services/jwxtClient";
import { getRecords } from "../src/services/jwxtFacade";
import { loadJwxtRecords, type JwxtRecordsSource } from "../src/services/jwxtRecords";

type Handler = (url: URL, form?: Record<string, string>) => string | undefined;

function fakeSource(handler: Handler) {
  const requests: string[] = [];
  const respond = (path: string, form?: Record<string, string>) => {
    const url = new URL(path, "https://jwxt.cpu.edu.cn");
    requests.push(`${form ? "POST" : "GET"} ${url.pathname}${url.search}`);
    const body = handler(url, form);
    if (body === undefined) throw new Error(`unexpected request: ${path}`);
    return body;
  };
  const source: JwxtRecordsSource = {
    get: async (path) => respond(path),
    post: async (path, form) => respond(path, form),
    pdf: async () => ({ contentType: "application/pdf", byteLength: 4, dataBase64: "JVBERg==" }),
    ecertPdf: async () => { throw new Error("unexpected e-certificate request"); },
  };
  return { source, requests };
}

const list = (data: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ msg: "", code: 0, data, count: data.length, ...extra });

test("level exams keep scores and drop the student's identity fields", async () => {
  const { source } = fakeSource((url) => {
    if (url.pathname !== "/jsxsd/kscj/djkscj_list") return undefined;
    assert.equal(url.searchParams.get("type"), "listData");
    return list([
      { xh: "S0001", xm: "测试学生", sfzjh: "110101200001010000", skkcmc: "英语考试", skdjmc: "国家英语六级", skkcdjmc: "英语考试(国家英语六级)", fslcj: 0, kssj: "2026-06-13", fslbscj: 0, fslsjcj: 0 },
      { xh: "S0001", xm: "测试学生", sfzjh: "110101200001010000", skkcmc: "英语考试", skdjmc: "国家英语四级", skkcdjmc: "英语考试(国家英语四级)", fslcj: 552, kssj: "2024-12-14" },
    ]);
  });
  const result = await loadJwxtRecords(source, { kind: "level-exams" });
  assert.equal(result.kind, "level-exams");
  if (result.kind !== "level-exams") return;
  assert.deepEqual(result.list.map((row) => [row.name, row.date, row.score]), [
    ["英语考试(国家英语六级)", "2026-06-13", undefined],
    ["英语考试(国家英语四级)", "2024-12-14", 552],
  ]);
  assert.doesNotMatch(JSON.stringify(result), /S0001|测试学生|110101200001010000/);
});

test("term courses pair time with place and name the hour breakdown", async () => {
  const { source, requests } = fakeSource((url) => {
    if (url.pathname !== "/jsxsd/xskb/xskb_list.do") return undefined;
    if (url.searchParams.get("needData") !== "1") {
      return `<form><input type="hidden" name="xsflMapListJsonStr" value="讲课学时,实践学时,">
        <select name="xnxq01id" id="xnxq01id"><option value="2026-2027-1" selected>2026-2027-1</option><option value="2025-2026-2">2025-2026-2</option></select></form>`;
    }
    assert.equal(url.searchParams.get("xnxq01id"), "2026-2027-1");
    return list([{
      kc_mc: "药剂学", kch: "C100", jg0101mc: "甲老师,乙老师", jsgh: "T001,T002", kt_mc: "药学1班", kkyx: "药学院",
      sktime: "周一第3、4节{1-4}全周;周一第3、4节{5-11}全周;周三第1、2节{1-8}全周", skddmc: "E104;E104;无",
      xf: 2, zxs: 34, zhouxs: "2", xsfl0: 30, xsfl1: 4, xkrs: 94, pkrs: 96, khfs: "笔试", kcxz: "专业核心课", kclb: "必修",
    }]);
  });
  const result = await loadJwxtRecords(source, { kind: "term-courses" });
  assert.equal(result.kind, "term-courses");
  if (result.kind !== "term-courses") return;
  assert.equal(result.semester, "2026-2027-1");
  assert.equal(result.semesters.length, 2);
  assert.deepEqual(result.list[0].sessions, [
    "周一第3、4节{1-4}全周 · E104",
    "周一第3、4节{5-11}全周 · E104",
    "周三第1、2节{1-8}全周",
  ]);
  assert.deepEqual(result.list[0].hourBreakdown, [{ label: "讲课学时", hours: 30 }, { label: "实践学时", hours: 4 }]);
  assert.equal(result.list[0].teacher, "甲老师、乙老师");
  assert.equal(result.credits, 2);
  assert.doesNotMatch(JSON.stringify(result), /T001/);
  assert.equal(requests.length, 2);
});

test("enrollment reads the chosen term, trims old terms and lists dropped courses", async () => {
  const options = Array.from({ length: 20 }, (_, index) => {
    const year = 2026 - Math.floor(index / 2);
    const value = `${year}-${year + 1}-${index % 2 === 0 ? 2 : 1}`;
    return `<option value="${value}"${value === "2026-2027-1" ? " selected" : ""}>${value}</option>`;
  }).join("");
  const { source } = fakeSource((url) => {
    if (url.pathname !== "/jsxsd/xkgl/loadXsxkjgList") return undefined;
    if (url.searchParams.get("type") !== "list") return `<select name="xnxqid"><option value="">--请选择--</option>${options}</select>`;
    assert.equal(url.searchParams.get("xnxqid"), "2025-2026-2");
    if (url.searchParams.get("lx") === "tkrz") {
      assert.equal(url.searchParams.get("cxsj"), "tkjg");
      return list([{ kc_mc: "木材学", kch: "C300", xf: 1.5, skls: "丙老师", tklx: "学生退课", tksj: "2026-03-02 10:00" }]);
    }
    return list([{
      kc_mc: "药理学", kch: "C200", xm: "丁老师", zxs: 51, xf: 3, kclb_mc: "必修", kcxz_mc: "专业基础课",
      sksj: "星期一 0506节<br>星期一 0506节<br>星期二 0102节", skdd: "B204<br>B204<br>B204", jx0501id: "INTERNAL-ID",
    }]);
  });
  const result = await loadJwxtRecords(source, { kind: "enrollment", semester: "2025-2026-2" });
  assert.equal(result.kind, "enrollment");
  if (result.kind !== "enrollment") return;
  assert.equal(result.semester, "2025-2026-2");
  assert.equal(result.semesters[0].value, "2026-2027-1");
  assert.equal(result.semesters.length, 12);
  assert.deepEqual(result.selected[0].sessions, ["星期一 0506节 · B204", "星期二 0102节 · B204"]);
  assert.equal(result.dropped[0].dropType, "学生退课");
  assert.doesNotMatch(JSON.stringify(result), /INTERNAL-ID/);
});

test("a malformed term never reaches the upstream query", async () => {
  const { source } = fakeSource(() => '<select name="xnxqid"><option value="2026-2027-1" selected>2026-2027-1</option></select>');
  await assert.rejects(
    loadJwxtRecords(source, { kind: "textbooks", semester: "2026-2027-1&x=1" }),
    (error: { status?: number }) => error.status === 400,
  );
});

test("graduation audit follows fixed-size upstream pages until the count is reached", async () => {
  const earned = Array.from({ length: 45 }, (_, index) => ({
    xqmc: "2024-2025-1", kcbh: `K${index}`, kc_mc: `课程${index}`, xf: 1, zxs: 17, cjxs: "90", xs0101id: "S0001", kctx_mc: "通识教育",
  }));
  const { source, requests } = fakeSource((url) => {
    if (!url.pathname.startsWith("/jsxsd/bygl/bygl_ckxsList_")) return undefined;
    assert.equal(url.searchParams.get("bs"), "list");
    if (!url.pathname.endsWith("_yxsd")) return list([]);
    const page = Number(url.searchParams.get("pageNum"));
    // 这个接口不认 pageSize，每页固定 20 条。
    return JSON.stringify({ code: 0, count: earned.length, data: earned.slice((page - 1) * 20, page * 20) });
  });
  const result = await loadJwxtRecords(source, { kind: "graduation-audit" });
  assert.equal(result.kind, "graduation-audit");
  if (result.kind !== "graduation-audit") return;
  assert.deepEqual(result.groups.map((group) => [group.key, group.list.length]), [
    ["earned", 45], ["unearned", 0], ["extra", 0], ["remaining", 0],
  ]);
  assert.equal(result.groups[0].credits, 45);
  assert.equal(requests.filter((item) => item.includes("_yxsd")).length, 3);
  assert.doesNotMatch(JSON.stringify(result), /S0001/);
});

test("an upstream that ignores the page number is read once", async () => {
  const { source, requests } = fakeSource((url) => {
    if (url.pathname !== "/jsxsd/yxszzy/yxszzy_list") return undefined;
    return JSON.stringify({ code: 0, count: 9, data: [
      { xnxq: "2025-2026-2", dwmc: "药学院", zymc: "药物化学", nj: "2025", njsrs: "12", ysqrs: 0, khfs: "笔试+面试", sqsj: "-" },
    ] });
  });
  const result = await loadJwxtRecords(source, { kind: "major-transfer" });
  assert.equal(result.kind, "major-transfer");
  if (result.kind !== "major-transfer") return;
  assert.equal(result.list.length, 1);
  assert.deepEqual([result.list[0].quota, result.list[0].applicants, result.list[0].window], [12, 0, undefined]);
  assert.equal(requests.length, 2);
});

test("retake options put courses offered this term first, lowest best score first", async () => {
  const { source } = fakeSource((url) => {
    if (url.pathname === "/jsxsd/kscj/cxbmxk_query") return "<div>重修报名选课 报名时间: 2026-09-09 09:00:00 ~ 2026-09-14 22:00:00</div>";
    if (url.pathname !== "/jsxsd/kscj/cxbmxk_query1") return undefined;
    return list([
      { kcmc: "高等数学", kch: "M1", zhcj: 62, iskk: "否", qdzg: "×", sfbm: "0", sfxk: "0", xf: 3, xs0101id: "S0001" },
      { kcmc: "有机化学", kch: "M2", zhcj: 88, iskk: "是", qdzg: "√", sfbm: "1", sfxk: "0", xf: 3 },
      { kcmc: "物理学", kch: "M3", zhcj: 71, iskk: "是", qdzg: "×", sfbm: "0", sfxk: "0", xf: 2 },
    ]);
  });
  const result = await loadJwxtRecords(source, { kind: "retake-options" });
  assert.equal(result.kind, "retake-options");
  if (result.kind !== "retake-options") return;
  assert.equal(result.window, "2026-09-09 09:00:00 ~ 2026-09-14 22:00:00");
  assert.deepEqual(result.list.map((row) => row.courseName), ["物理学", "有机化学", "高等数学"]);
  assert.deepEqual([result.list[1].qualified, result.list[1].registered, result.list[2].offered], [true, true, false]);
});

test("the school's own grade summary comes from the list envelope", async () => {
  const { source } = fakeSource((url) => {
    if (url.pathname !== "/jsxsd/kscj/cjcx_list") return undefined;
    return list([{ kc_mc: "药理学", xs0101id: "S0001" }], { pjcj: "78.6", pjxfj: "81.51", pjxfjd: "0.0", sxzxf: "121.05", sxms: "73", tjsj: "2026-04-21 10:57:22" });
  });
  const result = await loadJwxtRecords(source, { kind: "grade-summary" });
  assert.deepEqual(result, {
    kind: "grade-summary",
    averageScore: 78.6,
    creditWeightedAverage: 81.51,
    gradePoint: undefined,
    totalCredits: 121.05,
    courseCount: 73,
    computedAt: "2026-04-21 10:57:22",
  });
});

function freeRoomsHandler(posted: Array<Record<string, string>>): Handler {
  return (url, form) => {
    if (url.pathname === "/jsxsd/kbxx/jsjy_query") {
      return `<form id="Form1">
        <select name="xnxq"><option value="2026-2027-1" selected>2026-2027-1</option></select>
        <select name="kbjcmsid"><option value="MODE-1">默认节次模式</option></select>
        <select name="xqbh"><option value="">请选择</option><option value="01">江宁校区</option></select>
        <input type="checkbox" name="jc" value="0102"><input type="checkbox" name="jc" value="0304"><input type="checkbox" name="jc" value="1516">
      </form>`;
    }
    if (url.pathname === "/jsxsd/kbxx/jsjy_rqAjax") {
      assert.equal(url.searchParams.get("zc"), "1");
      assert.equal(url.searchParams.get("xq"), "1");
      return JSON.stringify({ mxrq: "2026-08-31" });
    }
    if (url.pathname === "/jsxsd/kbxx/jsjy_query2" && form) {
      posted.push(form);
      return JSON.stringify([
        [
          { djmc: "第一大节", jc1: "1", jc2: "2", kssj: "08:00", jssj: "09:40" },
          { djmc: "第五大节", jc1: "9", jc2: "10", kssj: "18:30", jssj: "20:10" },
          { djmc: "中午", jc1: "13", jc2: "14", kssj: "11:40", jssj: "13:15" },
        ],
        1, 7, ["一"],
        [
          ["A104", null, '<span class="y-icon"></span>', null, "10070104", "(100/42)", "多媒体教室"],
          ["E101", '<iconpark-icon name="shangke"></iconpark-icon>', null, '<iconpark-icon name="jieyong"></iconpark-icon>', "10110101", "(72/41)", "PBL智慧教室"],
        ],
        1, [""], null,
      ]);
    }
    return undefined;
  };
}

test("free rooms turn a date into the teaching week and order slots by start time", async () => {
  const posted: Array<Record<string, string>> = [];
  const { source } = fakeSource(freeRoomsHandler(posted));
  // 2026-10-11 是从 2026-08-31 起算的第 6 周周日。
  const result = await loadJwxtRecords(source, { kind: "free-rooms", date: "2026-10-11" });
  assert.equal(result.kind, "free-rooms");
  if (result.kind !== "free-rooms") return;
  assert.deepEqual([result.week, result.day, result.semester], [6, 7, "2026-2027-1"]);
  assert.deepEqual(
    { zc: posted[0].zc, zc2: posted[0].zc2, xq: posted[0].xq, jc: posted[0].jc, jc2: posted[0].jc2, mode: posted[0].kbjcmsid, campus: posted[0].xqbh },
    { zc: "6", zc2: "6", xq: "7", jc: "01", jc2: "16", mode: "MODE-1", campus: "01" },
  );
  assert.deepEqual(result.slots.map((slot) => [slot.name, slot.periods, slot.start]), [
    ["第一大节", "1-2", "08:00"], ["中午", "13-14", "11:40"], ["第五大节", "9-10", "18:30"],
  ]);
  assert.deepEqual(result.rooms, [
    { name: "A104", type: "多媒体教室", seats: 100, examSeats: 42, states: ["", "", "graduate"] },
    { name: "E101", type: "PBL智慧教室", seats: 72, examSeats: 41, states: ["class", "borrowed", ""] },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /10070104/);
});

test("free rooms reject dates outside the teaching weeks", async () => {
  const { source } = fakeSource(freeRoomsHandler([]));
  await assert.rejects(
    loadJwxtRecords(source, { kind: "free-rooms", date: "2026-08-01" }),
    (error: { status?: number }) => error.status === 400,
  );
  await assert.rejects(
    loadJwxtRecords(source, { kind: "free-rooms", date: "2026-02-30" }),
    (error: { status?: number }) => error.status === 400,
  );
});

test("timetable search needs two characters, strips staff numbers and sorts by weekday", async () => {
  const { source } = fakeSource((url) => {
    if (url.pathname === "/jsxsd/kbcx/kbxx_teacher") {
      return '<select name="xnxq01id"><option value="2026-2027-1" selected>2026-2027-1</option></select><select name="kbjcmsid"><option value="MODE-1">默认</option></select>';
    }
    if (url.pathname !== "/jsxsd/kbcx/kbxx_teacher_ifr") return undefined;
    assert.equal(url.searchParams.get("jsxx"), "甲老师");
    assert.equal(url.searchParams.get("kbjcmsid"), "MODE-1");
    return JSON.stringify({ code: 0, count: 320, data: [
      { kcmc: "药剂学", xm: "甲老师", jgh: "T001", jszc: "教授", jsmc: "E203", zzdweek: "星期三", jc: "3-4", kkzc: "5-9", sjbz: "全部", xkrs: 16 },
      { kcmc: "工业药剂学", jsxm: "甲老师[T001]", jsmc: "D204", zzdweek: "星期一", jc: "9-11", kkzc: "1-8", sjbz: "单周" },
      { kcmc: "药剂学实验", jsxm: "null", jsmc: "实验楼", zzdweek: "星期一", jc: "1-4", kkzc: "3-14" },
    ] });
  });
  await assert.rejects(
    loadJwxtRecords(source, { kind: "timetable-search", scope: "teacher", keyword: "甲" }),
    (error: { status?: number }) => error.status === 400,
  );
  const result = await loadJwxtRecords(source, { kind: "timetable-search", scope: "teacher", keyword: " 甲老师 " });
  assert.equal(result.kind, "timetable-search");
  if (result.kind !== "timetable-search") return;
  assert.deepEqual(result.list.map((row) => [row.courseName, row.teacher, row.weekType]), [
    ["药剂学实验", undefined, undefined],
    ["工业药剂学", "甲老师", "单周"],
    ["药剂学", "甲老师", undefined],
  ]);
  assert.deepEqual([result.total, result.truncated], [320, true]);
  assert.doesNotMatch(JSON.stringify(result), /T001/);
});

test("a page that is not JSON is reported as an upstream failure, not as empty data", async () => {
  const { source } = fakeSource(() => "<html><title>no-open</title>系统功能暂未开放，敬请等待</html>");
  await assert.rejects(
    loadJwxtRecords(source, { kind: "election-rounds" }),
    (error: { status?: number }) => error.status === 502,
  );
});

test("the facade posts the room form and exports the transcript through the modern session", async () => {
  const token = "records-facade-test-token";
  const now = Date.now();
  await importSessionSnapshot(token, {
    version: 1,
    jar: { "jwxt.cpu.edu.cn": { JSESSIONID: "modern-valid" }, "id.cpu.edu.cn": { SESSION: "unified-session" } },
    username: "S0001",
    createdAt: now,
    lastSeenAt: now,
  });
  const posted: Array<Record<string, string>> = [];
  const handler = freeRoomsHandler(posted);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    assert.equal(url.hostname, "jwxt.cpu.edu.cn");
    assert.match(new Headers(init?.headers).get("cookie") || "", /JSESSIONID=modern-valid/);
    if (url.pathname === "/jsxsd/kscj/printXscjk") {
      assert.equal(init?.method, "POST");
      return new Response(Buffer.from("%PDF-1.4 transcript"), { status: 200, headers: { "content-type": "application/x-msdownload" } });
    }
    const form = init?.method === "POST"
      ? Object.fromEntries(new URLSearchParams(String(init.body || "")))
      : undefined;
    const body = handler(url, form);
    if (body === undefined) throw new Error(`unexpected request: ${url.toString()}`);
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  try {
    const rooms = await getRecords(token, { kind: "free-rooms", date: "2026-10-05" });
    assert.equal(rooms.kind, "free-rooms");
    assert.equal(rooms.source, "modern");
    assert.deepEqual([posted[0].zc, posted[0].xq], ["6", "1"]);

    const transcript = await getRecords(token, { kind: "transcript" });
    assert.equal(transcript.kind, "transcript");
    if (transcript.kind !== "transcript") return;
    assert.equal(transcript.file.contentType, "application/pdf");
    assert.equal(Buffer.from(transcript.file.dataBase64, "base64").toString("latin1"), "%PDF-1.4 transcript");
  } finally {
    globalThis.fetch = originalFetch;
    await logout(token);
  }
});

test("a transcript export that returns a page instead of a PDF fails loudly", async () => {
  const token = "records-transcript-html-token";
  const now = Date.now();
  await importSessionSnapshot(token, {
    version: 1,
    jar: { "jwxt.cpu.edu.cn": { JSESSIONID: "modern-valid" } },
    username: "S0001",
    createdAt: now,
    lastSeenAt: now,
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html><title>no-open</title>系统功能暂未开放，敬请等待</html>", { status: 200 })) as typeof fetch;
  try {
    await assert.rejects(
      getRecords(token, { kind: "transcript" }),
      (error: { status?: number }) => error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await logout(token);
  }
});
