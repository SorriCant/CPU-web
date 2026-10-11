import assert from "node:assert/strict";
import test from "node:test";
import { importSessionSnapshot, logout } from "../src/services/jwxtClient";
import { getRecords } from "../src/services/jwxtFacade";
import { loadJwxtRecords, type JwxtRecordsSource } from "../src/services/jwxtRecords";

type Handler = (url: URL) => string | undefined;

function fakeSource(handler: Handler) {
  const requests: string[] = [];
  const source: JwxtRecordsSource = {
    get: async (path) => {
      const url = new URL(path, "https://jwxt.cpu.edu.cn");
      requests.push(`GET ${url.pathname}${url.search}`);
      const body = handler(url);
      if (body === undefined) throw new Error(`unexpected request: ${path}`);
      return body;
    },
    post: async (path) => { throw new Error(`unexpected post: ${path}`); },
    pdf: async () => ({ contentType: "application/pdf", byteLength: 4, dataBase64: Buffer.from("%PDF").toString("base64") }),
    ecertPdf: async (language) => {
      requests.push(`ECERT ${language}`);
      return { contentType: "application/pdf", byteLength: 5, dataBase64: Buffer.from(`%PDF${language === "en" ? "E" : "C"}`).toString("base64") };
    },
  };
  return { source, requests };
}

const list = (data: unknown[]) => JSON.stringify({ msg: "", code: 0, data, count: data.length });

test("textbooks do not pass on the school's ordering flag as if the student had ordered", async () => {
  const { source } = fakeSource((url) => {
    if (url.pathname === "/jsxsd/nxsjc/jccx") return '<select name="xnxqid"><option value="2026-2027-1" selected>2026-2027-1</option></select>';
    if (url.pathname !== "/jsxsd/nxsjc/xsjcqr") return undefined;
    return list([{ jcmc: "波谱解析", isbn: "9787117343053", jcdj: "79.00", zdzt: "是", isxy: "1", kcmc: "药物光谱分析与解析" }]);
  });
  const result = await loadJwxtRecords(source, { kind: "textbooks" });
  assert.equal(result.kind, "textbooks");
  if (result.kind !== "textbooks") return;
  assert.equal("ordered" in result.list[0], false);
  assert.doesNotMatch(JSON.stringify(result.list), /"是"/);
  assert.equal(result.list[0].price, 79);
});

test("a transcript comes from the e-certificate platform unless the JWXT export is asked for", async () => {
  const { source, requests } = fakeSource(() => undefined);
  const decode = (result: Awaited<ReturnType<typeof loadJwxtRecords>>) => (
    result.kind === "transcript" ? Buffer.from(result.file.dataBase64, "base64").toString("latin1") : ""
  );
  assert.equal(decode(await loadJwxtRecords(source, { kind: "transcript", variant: "ecert-zh" })), "%PDFC");
  assert.equal(decode(await loadJwxtRecords(source, { kind: "transcript", variant: "ecert-en" })), "%PDFE");
  assert.equal(decode(await loadJwxtRecords(source, { kind: "transcript", variant: "jwxt" })), "%PDF");
  assert.deepEqual(requests, ["ECERT zh", "ECERT en"]);
});

test("a class timetable is reached one level at a time: grade, major, class", async () => {
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
  const { source, requests } = fakeSource((url) => {
    if (url.pathname === "/jsxsd/kbcx/kbxx_xzb") {
      return `<select name="xnxq01id"><option value="2026-2027-1" selected>2026-2027-1</option></select>
        <select name="kbjcmsid"><option value="MODE-1">默认</option></select>
        <select name="ksnd"><option value=""></option>${years.map((year) => `<option value="${year}">${year}</option>`).join("")}</select>`;
    }
    if (url.pathname === "/jsxsd/comm/getZy") {
      assert.deepEqual([url.searchParams.get("xx0301id"), url.searchParams.get("ksnd")], ["", "2024"]);
      return JSON.stringify({ success: true, data: [
        { jx01id: "H100813s", zyh: "10070601", zymc: "药物化学", zymc2: "[10070601]药物化学" },
        { jx01id: "bad id!", zymc: "不该出现" },
      ] });
    }
    if (url.pathname === "/jsxsd/comm/getBj") {
      assert.deepEqual([url.searchParams.get("rxnf"), url.searchParams.get("jx01id")], ["2024", "H100813s"]);
      return JSON.stringify({ success: true, data: [
        { xx04id: "CLASS0005", bj: "药化24201505", bj2: "[24201505]药化24201505", bjrs: 32 },
      ] });
    }
    if (url.pathname === "/jsxsd/kbcx/kbxx_xzb_ifr") {
      assert.equal(url.searchParams.get("skbj"), "CLASS0005");
      return list([
        { kcmc: "药事管理", jsxm: "杜老师[T0099]", jsmc: "B311", zzdweek: "星期五", jc: "1-2", kkzc: "8-17", sjbz: "全部", bj: "药化24201505", xf: 2, jx0404id: "INTERNAL" },
        { kcmc: "人工智能药学", jsxm: "孙老师[T0207]", jsmc: "B211", zzdweek: "星期二", jc: "9-10", kkzc: "15-17", sjbz: "全部", bj: "药化24201505", xf: 2 },
        { kcmc: "人工智能药学", jsxm: "徐老师[T0301]", jsmc: "B211", zzdweek: "星期二", jc: "9-10", kkzc: "1-8", sjbz: "全部", bj: "药化24201505", xf: 2 },
      ]);
    }
    return undefined;
  });

  const top = await loadJwxtRecords(source, { kind: "class-timetable" });
  assert.equal(top.kind, "class-timetable");
  if (top.kind !== "class-timetable") return;
  assert.deepEqual(
    [top.grades.length, top.grades[0], top.majors.length, top.list.length],
    [8, { value: "2026", label: "2026 级" }, 0, 0],
  );

  const majors = await loadJwxtRecords(source, { kind: "class-timetable", grade: "2024" });
  assert.deepEqual(majors.kind === "class-timetable" && majors.majors, [{ value: "H100813s", label: "药物化学" }]);

  const full = await loadJwxtRecords(source, { kind: "class-timetable", grade: "2024", major: "H100813s", classId: "CLASS0005" });
  assert.equal(full.kind, "class-timetable");
  if (full.kind !== "class-timetable") return;
  assert.equal(full.className, "药化24201505");
  assert.deepEqual(full.list.map((row) => [row.weekday, row.periods, row.weeks, row.courseName, row.teacher]), [
    ["星期二", "9-10", "1-8", "人工智能药学", "徐老师"],
    ["星期二", "9-10", "15-17", "人工智能药学", "孙老师"],
    ["星期五", "1-2", "8-17", "药事管理", "杜老师"],
  ]);
  assert.doesNotMatch(JSON.stringify(full), /T0099|INTERNAL/);
  assert.equal(requests.filter((item) => item.includes("kbxx_xzb_ifr")).length, 1);

  await assert.rejects(
    loadJwxtRecords(source, { kind: "class-timetable", grade: "2024", classId: "x or 1=1" }),
    (error: { status?: number }) => error.status === 400,
  );
});

function ecertFetch(options: { ssoExpired?: boolean; previewFails?: boolean } = {}) {
  const seen: string[] = [];
  const handler = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const headers = new Headers(init?.headers);
    seen.push(`${url.hostname}${url.pathname}`);
    if (url.hostname === "id.cpu.edu.cn" && url.pathname === "/sso/login") {
      assert.equal(url.searchParams.get("service"), "https://dzpzstu.cpu.edu.cn/student/");
      assert.match(headers.get("cookie") || "", /SESSION=unified-session/);
      if (options.ssoExpired) return new Response("<html><form id=loginForm></form></html>", { status: 200 });
      return new Response(null, { status: 302, headers: { location: "https://dzpzstu.cpu.edu.cn/student/?ticket=ST-one-time" } });
    }
    assert.equal(url.hostname, "dzpzstu.cpu.edu.cn");
    if (url.pathname === "/student/cas/client/validateLogin") {
      assert.deepEqual(
        [url.searchParams.get("ticket"), url.searchParams.get("service")],
        ["ST-one-time", "https://dzpzstu.cpu.edu.cn/student/"],
      );
      return Response.json({ success: true, result: { token: "ecert-access-token", userInfo: { username: "S0001" } } });
    }
    assert.equal(headers.get("x-access-token"), "ecert-access-token");
    if (url.pathname === "/student/student/caTemplate/ykdxlist") {
      return Response.json({ success: true, result: { records: [
        { id: "e6015729b33a002dc780d8fdb7aa379b", serviceName: "在读证明", serviceNameEn: "Certification of Enrolment", status: "1" },
        { id: "c370eb40050aecab5b51bc608cb6e47f", serviceName: "英文成绩单", serviceNameEn: "Transcript in English", status: "1" },
        { id: "af019d192f1010497f0e8d1c9875ad54", serviceName: "中文成绩单", serviceNameEn: "Transcript in Chinese", status: "1" },
      ] } });
    }
    if (url.pathname === "/student/student/caTemplate/preview_file") {
      if (options.previewFails) return Response.json({ success: false, message: "操作失败" });
      return Response.json({ success: true, message: `students/20/abcdef/preview_${url.searchParams.get("templateId")}.pdf` });
    }
    if (url.pathname.startsWith("/student/sys/common/view/students/20/abcdef/preview_")) {
      const english = url.pathname.includes("c370eb40050aecab5b51bc608cb6e47f");
      return new Response(Buffer.from(`%PDF-1.4 ${english ? "english" : "chinese"} transcript`), { status: 200 });
    }
    // 下单、支付、邮件这些接口一概不该被碰到。
    throw new Error(`unexpected request: ${url.toString()}`);
  }) as typeof fetch;
  return { handler, seen };
}

async function ecertSession(token: string) {
  const now = Date.now();
  await importSessionSnapshot(token, {
    version: 1,
    jar: { "jwxt.cpu.edu.cn": { JSESSIONID: "modern-valid" }, "id.cpu.edu.cn": { SESSION: "unified-session" } },
    username: "S0001",
    createdAt: now,
    lastSeenAt: now,
  });
}

test("the e-certificate transcript is the platform's own preview, fetched with a ticket from the SSO session", async () => {
  const token = "records-ecert-test-token";
  await ecertSession(token);
  const { handler, seen } = ecertFetch();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    const english = await getRecords(token, { kind: "transcript", variant: "ecert-en" });
    assert.equal(english.kind, "transcript");
    if (english.kind !== "transcript") return;
    assert.equal(Buffer.from(english.file.dataBase64, "base64").toString("latin1"), "%PDF-1.4 english transcript");
    assert.deepEqual(seen, [
      "id.cpu.edu.cn/sso/login",
      "dzpzstu.cpu.edu.cn/student/cas/client/validateLogin",
      "dzpzstu.cpu.edu.cn/student/student/caTemplate/ykdxlist",
      "dzpzstu.cpu.edu.cn/student/student/caTemplate/preview_file",
      "dzpzstu.cpu.edu.cn/student/sys/common/view/students/20/abcdef/preview_c370eb40050aecab5b51bc608cb6e47f.pdf",
    ]);
    const chinese = await getRecords(token, { kind: "transcript", variant: "ecert-zh" });
    assert.match(Buffer.from(chinese.kind === "transcript" ? chinese.file.dataBase64 : "", "base64").toString("latin1"), /chinese/);
  } finally {
    globalThis.fetch = originalFetch;
    await logout(token);
  }
});

test("an expired SSO session or a platform refusal fails clearly instead of returning a broken file", async () => {
  const token = "records-ecert-failure-token";
  await ecertSession(token);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = ecertFetch({ ssoExpired: true }).handler;
    await assert.rejects(
      getRecords(token, { kind: "transcript", variant: "ecert-zh" }),
      (error: { status?: number }) => error.status === 401,
    );
    globalThis.fetch = ecertFetch({ previewFails: true }).handler;
    await assert.rejects(
      getRecords(token, { kind: "transcript", variant: "ecert-zh" }),
      (error: { status?: number }) => error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await logout(token);
  }
});
