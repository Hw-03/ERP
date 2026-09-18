import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPcAudit,
  finalizeBrowserCompletionAudit,
  linkLegacyBrowserTraceMetadata,
  mergeBrowserEvidence,
  recordCaseObservation,
  recordCaseResult,
  renderAuditMarkdown,
  validateAudit,
} from "./generate-mes-pc-audit.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md",
);

const RUN = {
  runId: "PC-AUDIT-20260917-151013",
  startedAt: "2026-09-17T15:10:13+09:00",
  head: "be653ce8369384ae028ff73bd6e1c800807dde90",
  frontendUrl: "http://192.168.0.63:3001",
  backendUrl: "http://192.168.0.63:8011",
  database: {
    source: "backend/mes.db",
    sha256: "01DA8E6848BD6DC85CBD0CCC79968A38672718DBBF38B20B7DA8EAF0D697C7E8",
    backupPath: "_attic/runtime/backups/sqlite/mes-before-pc-audit.db",
  },
};

test("실제 계약 270개를 실행 전 PC 감사 원장으로 만든다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });

  assert.equal(audit.schemaVersion, 1);
  assert.equal(audit.scope, "PC");
  assert.equal(audit.cases.length, 270);
  assert.equal(new Set(audit.cases.map((entry) => entry.id)).size, 270);
  assert.deepEqual(audit.summary, {
    total: 270,
    pending: 270,
    pass: 0,
    difference: 0,
    blocked: 0,
    deferredMobile: 0,
  });
  assert.deepEqual(audit.cases[0].steps, []);
  assert.equal(audit.cases[0].verdict, null);
  assert.ok(audit.cases.every((entry) => entry.source === "CONTRACT"));
});

test("delta 계약을 고유 ID로 추가하고 중복을 거부한다", () => {
  const markdown = fs.readFileSync(CONTRACT_PATH, "utf8");
  const delta = {
    id: "PC-DELTA-NOTIFICATION-01",
    category: "알림",
    scenario: "승인 후 관련 알림 자동 읽음",
    action: "다른 결재권자의 승인 완료 알림 상태를 확인한다.",
    expected: "관련 결재권자의 동일 업무 알림이 자동으로 읽음 처리된다.",
  };
  const audit = createPcAudit({ contractMarkdown: markdown, run: RUN, deltas: [delta] });

  assert.equal(audit.cases.length, 271);
  assert.equal(audit.cases.at(-1).source, "DELTA");
  assert.equal(audit.cases.at(-1).id, delta.id);
  assert.throws(
    () => createPcAudit({ contractMarkdown: markdown, run: RUN, deltas: [delta, delta] }),
    /중복 ID/,
  );
  assert.throws(
    () => createPcAudit({ contractMarkdown: markdown, run: RUN, deltas: [{ ...delta, id: "DELTA-1" }] }),
    /PC-DELTA/,
  );
});

test("PIN과 비밀번호를 원장 메타데이터에 기록하지 못하게 한다", () => {
  const markdown = fs.readFileSync(CONTRACT_PATH, "utf8");
  const audit = createPcAudit({ contractMarkdown: markdown, run: RUN });

  assert.throws(
    () => createPcAudit({ contractMarkdown: markdown, run: { ...RUN, pin: "0000" } }),
    /민감정보/,
  );
  assert.throws(
    () => createPcAudit({ contractMarkdown: markdown, run: { ...RUN, password: "secret" } }),
    /민감정보/,
  );
  assert.doesNotMatch(JSON.stringify(audit), /\b0000\b/);
  assert.match(JSON.stringify(audit), /PIN \[REDACTED\]/);
});

test("실행 결과는 허용 판정과 필수 증거를 검증하고 요약을 다시 계산한다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });

  recordCaseResult(audit, "8.1-01", {
    actor: "김현우(E06)",
    prerequisites: ["개발 서버 로그인"],
    steps: ["입출고 메뉴를 연다."],
    staffExpected: "로그인한 직원에게 허용된 입출고 메뉴가 바로 열려야 한다.",
    staffActual: "입출고 메뉴를 누르자 별도 오류 없이 요청 작성 화면이 열렸다.",
    actual: "입출고 메뉴가 열렸다.",
    evidence: [{ type: "UI", reference: "browser:history" }],
    recommendedTestLayer: "PLAYWRIGHT",
    verdict: "PASS",
  });

  assert.equal(audit.cases[0].verdict, "PASS");
  assert.equal(audit.summary.pending, 269);
  assert.equal(audit.summary.pass, 1);
  assert.throws(
    () => recordCaseResult(audit, "8.1-02", { actual: "실패", verdict: "UNKNOWN" }),
    /판정/,
  );
  assert.throws(
    () => recordCaseResult(audit, "8.1-02", { actual: "실패", verdict: "DIFFERENCE" }),
    /직원용 기대 반응/,
  );
});

test("최종 판정에는 직원이 이해할 기대·실제 반응을 모두 기록한다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });
  const common = {
    actual: "기술 확인 결과",
    evidence: [{ type: "UI", reference: "browser:warehouse" }],
    verdict: "PASS",
  };

  assert.throws(
    () => recordCaseResult(audit, "8.1-01", common),
    /직원용 기대 반응/,
  );
  assert.throws(
    () => recordCaseResult(audit, "8.1-01", {
      ...common,
      staffExpected: "직원이 메뉴를 누르면 요청 화면이 열려야 한다.",
    }),
    /직원용 실제 반응/,
  );
});

test("부분 실행 증거는 판정을 확정하지 않고 누적한다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });

  recordCaseObservation(audit, "8.1-03", {
    actual: "빈 상태와 초안 저장·복원을 확인했다. 오래된 초안 차단은 미실행이다.",
    evidence: [{ type: "UI", reference: "warehouse?section=cart" }],
  });

  assert.equal(audit.cases[2].verdict, null);
  assert.equal(audit.cases[2].evidence.length, 1);
  assert.equal(audit.summary.pending, 270);
  assert.throws(
    () => recordCaseObservation(audit, "8.1-03", { verdict: "PASS" }),
    /recordCaseResult/,
  );
});

test("Markdown은 전체 요약과 사용자 확인 목록을 함께 렌더링한다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });
  recordCaseResult(audit, "8.1-01", {
    actor: "관리자(E31)",
    staffExpected: "로그인 후 맡은 업무를 시작할 수 있는 화면이 보여야 한다.",
    staffActual: "로그인했지만 예상과 다른 화면이 먼저 표시됐다. 텅스텐 필라멘트 [70kV](8-TR-0002)를 확인했다.",
    actual: "기대와 다른 시작 화면이 표시됐다.",
    evidence: [{ type: "SCREENSHOT", reference: "evidence/8.1-01.png" }],
    verdict: "DIFFERENCE",
    note: "현재 동작을 새 기준으로 채택할지 사용자 확인 필요",
  });
  audit.run.completion = {
    completedAt: "2026-09-18T15:41:38+09:00",
    temporaryPermissionsRestored: true,
    finalFrontendUrl: "http://192.168.0.63:3001/mes?tab=dashboard",
    qaArtifactsDeleted: false,
    qaArtifactsCleanupPerformed: true,
    qaArtifactsPreservedReason: "창고 지도 편집 권한과 확인 가능한 본인 PIN이 없어 지도 데이터만 보존",
    qaArtifactsRemoved: ["QA-PC-AUDIT-ITEM-RENAMED 품목 소프트 삭제"],
    qaArtifacts: ["QA-PC-AUDIT-A10 지도 박스·앵글"],
    auditHistoryDeleted: false,
  };

  const output = renderAuditMarkdown(audit);

  assert.match(output, /PC 전수 업무 검수 결과/);
  assert.match(output, /총 270건/);
  assert.match(output, /DIFFERENCE 1건/);
  assert.match(output, /사용자 확인 필요/);
  assert.match(output, /8\.1-01/);
  assert.match(output, /기대 반응\(직원용\)/);
  assert.match(output, /실제 반응\(직원용\)/);
  assert.match(output, /로그인했지만 예상과 다른 화면이 먼저 표시됐다/);
  assert.doesNotMatch(output, /\[70kV\]\(8-TR-0002\)/);
  assert.match(output, /\[70kV\]\\\(8-TR-0002\\\)/);
  assert.match(output, /재고·예약·내역 전후값/);
  assert.match(output, /종료 상태/);
  assert.match(output, /임시 권한 원복: 완료/);
  assert.match(output, /QA 데이터 삭제: 일부 완료/);
  assert.match(output, /삭제한 QA 데이터: QA-PC-AUDIT-ITEM-RENAMED 품목 소프트 삭제/);
  assert.match(output, /QA-PC-AUDIT-A10 지도 박스·앵글/);
});

test("검증기는 누락된 계약과 직원 서버 주소를 거부한다", () => {
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });
  audit.cases.pop();
  assert.throws(() => validateAudit(audit), /270개/);

  const wrongServer = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
  });
  wrongServer.run.frontendUrl = "http://192.168.0.63:3000";
  assert.throws(() => validateAudit(wrongServer), /직원 서버/);
});

test("브라우저 완료 검증은 앱 342건과 엔지니어링 3건을 분리한다", () => {
  const deltas = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, "docs/superpowers/specs/2026-09-17-mes-pc-full-audit-deltas.json"),
    "utf8",
  ));
  const audit = createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
    deltas,
  });
  for (const entry of audit.cases) {
    entry.staffExpected = entry.expected;
    entry.staffActual = "직접 검수 결과";
    entry.actual = "직접 검수 결과";
    entry.verdict = "PASS";
    if (entry.category === "테스트 거버넌스") {
      entry.verificationClass = "ENGINEERING";
      entry.evidence = [{ type: "TEST", reference: "생성기 검증 통과" }];
    } else {
      entry.verificationClass = "APP_BROWSER";
      entry.browserCoverage = "FRESH_IN_APP";
      entry.actor = "브라우저 검수자";
      entry.steps = ["화면 진입", "기대 반응 대조"];
      entry.evidence = [{
        type: "UI",
        reference: "대시보드에서 화면 반응 확인",
        browserSurface: "CODEX_IN_APP_BROWSER",
        observedAt: "2026-09-18T13:00:00+09:00",
        url: "http://192.168.0.63:3001/mes?tab=dashboard",
      }];
    }
  }

  finalizeBrowserCompletionAudit(audit);

  assert.deepEqual(audit.browserCompletion, {
    appCases: 342,
    engineeringCases: 3,
    reusedComplete: 0,
    reusedPartialSupplemented: 0,
    freshInApp: 342,
    reusedSourceCounts: {
      codexInAppBrowser: 0,
      chrome: 0,
      legacyDirectBrowser: 0,
    },
  });
  assert.match(renderAuditMarkdown(audit), /앱 브라우저 검수 342건/);
  assert.match(renderAuditMarkdown(audit), /신규 인앱 브라우저 실측 342건/);
  assert.match(renderAuditMarkdown(audit), /기존 명시적 인앱 브라우저 0건/);
  assert.match(renderAuditMarkdown(audit), /기존 혼합 검수 보고서는 원본 증거 추적용 참고자료/);
});

test("브라우저 완료 검증은 앱의 UI 증거와 인앱 보완 출처를 강제한다", () => {
  const deltas = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, "docs/superpowers/specs/2026-09-17-mes-pc-full-audit-deltas.json"),
    "utf8",
  ));
  const makeAudit = () => createPcAudit({
    contractMarkdown: fs.readFileSync(CONTRACT_PATH, "utf8"),
    run: RUN,
    deltas,
  });
  const prepare = (audit) => {
    for (const entry of audit.cases) {
      entry.staffExpected = entry.expected;
      entry.staffActual = "직접 검수 결과";
      entry.actual = "직접 검수 결과";
      entry.verdict = "PASS";
      entry.verificationClass = entry.category === "테스트 거버넌스" ? "ENGINEERING" : "APP_BROWSER";
      entry.browserCoverage = entry.category === "테스트 거버넌스" ? null : "REUSED_COMPLETE";
      entry.actor = entry.category === "테스트 거버넌스" ? null : "이전 브라우저 검수자";
      entry.steps = entry.category === "테스트 거버넌스" ? [] : ["이전 화면 진입", "기대 반응 대조"];
      entry.evidence = entry.category === "테스트 거버넌스"
        ? [{ type: "TEST", reference: "생성기 검증 통과" }]
        : [{
          type: "UI",
          reference: "이전 직접 브라우저 증거",
          browserSurface: "LEGACY_DIRECT_BROWSER",
          observedAt: "2026-09-17T15:18:00+09:00",
          url: "http://192.168.0.63:3001/mes?tab=dashboard",
        }];
    }
  };

  const noUi = makeAudit();
  prepare(noUi);
  noUi.cases.find((entry) => entry.category !== "테스트 거버넌스").evidence = [
    { type: "TEST", reference: "자동 테스트만 있음" },
  ];
  assert.throws(() => finalizeBrowserCompletionAudit(noUi), /직접 브라우저 UI 증거/);

  const missingInApp = makeAudit();
  prepare(missingInApp);
  const partial = missingInApp.cases.find((entry) => entry.category !== "테스트 거버넌스");
  partial.browserCoverage = "REUSED_PARTIAL_SUPPLEMENTED";
  assert.throws(() => finalizeBrowserCompletionAudit(missingInApp), /인앱 브라우저 보완 증거/);

  const missingTrace = makeAudit();
  prepare(missingTrace);
  const traceTarget = missingTrace.cases.find((entry) => entry.category !== "테스트 거버넌스");
  traceTarget.actor = null;
  traceTarget.steps = [];
  assert.throws(() => finalizeBrowserCompletionAudit(missingTrace), /작업자와 조작 순서/);
});

test("인앱 브라우저 증거를 중복 없이 합치고 작업자와 조작 순서를 보완한다", () => {
  const observations = [{
    id: "PC-DELTA-AUTH-01",
    actor: null,
    steps: [],
    actual: "기존 관찰",
    staffActual: "기존 직원용 관찰",
    evidence: [],
  }];
  const records = [{
    id: "PC-DELTA-AUTH-01",
    evidence: {
      type: "UI",
      reference: "인앱 로그인 오류 확인",
      browserSurface: "CODEX_IN_APP_BROWSER",
      observedAt: "2026-09-18T14:18:00+09:00",
      url: "http://192.168.0.63:3001/mes",
      actor: "유승범(E18)",
      steps: ["오류 PIN 제출", "정상 PIN 로그인"],
    },
  }];

  mergeBrowserEvidence(observations, records);
  mergeBrowserEvidence(observations, records);

  assert.equal(observations[0].evidence.length, 1);
  assert.equal(observations[0].actor, "유승범(E18)");
  assert.deepEqual(observations[0].steps, ["오류 PIN 제출", "정상 PIN 로그인"]);
  assert.equal(
    observations[0].staffActual,
    "기존 직원용 관찰\n\n보완 브라우저 실측: 인앱 로그인 오류 확인",
  );
  assert.equal(
    observations[0].actual,
    "기존 관찰\n\n보완 브라우저 실측: 인앱 로그인 오류 확인",
  );
  assert.throws(
    () => mergeBrowserEvidence(observations, [{ id: "UNKNOWN", evidence: records[0].evidence }]),
    /찾을 수 없습니다/,
  );
});

test("같은 화면에서 확인한 여러 계약과 BLOCKED 판정을 함께 합친다", () => {
  const observations = [
    { id: "A", verdict: "PASS", actual: "기존", staffActual: "기존", evidence: [] },
    { id: "B", verdict: "PASS", actual: "기존", staffActual: "기존", evidence: [] },
  ];
  const records = [{
    ids: ["A", "B"],
    outcome: {
      verdict: "BLOCKED",
      actual: "화면 경계까지만 확인",
      staffActual: "실제 제출은 안전상 실행하지 못했습니다.",
      note: "직접 실행 증거 없음",
    },
    evidence: {
      type: "UI",
      reference: "확인창까지 직접 확인",
      browserSurface: "CODEX_IN_APP_BROWSER",
      observedAt: "2026-09-18T14:30:00+09:00",
      url: "http://192.168.0.63:3001/mes?tab=shipping",
      actor: "유승범(E18)",
      steps: ["화면 진입", "확인창 열기", "취소"],
    },
  }];

  mergeBrowserEvidence(observations, records);

  for (const entry of observations) {
    assert.equal(entry.verdict, "BLOCKED");
    assert.equal(entry.evidence.length, 1);
    assert.equal(entry.actor, "유승범(E18)");
    assert.deepEqual(entry.steps, ["화면 진입", "확인창 열기", "취소"]);
  }
});

test("기존 직접 브라우저 증거는 원본 스레드 연결을 이용해 추적 메타데이터를 보완한다", () => {
  const observations = [{
    id: "LEGACY",
    action: "기존 화면 확인",
    browserCoverage: "REUSED_COMPLETE",
    actor: null,
    steps: [],
    evidence: [{
      type: "UI",
      reference: "2026-09-17 15:18 KST 요청 작성 화면",
      browserSurface: "LEGACY_DIRECT_BROWSER",
      observedAt: "2026-09-17 15:18 KST",
      url: "http://192.168.0.63:3001/mes?tab=warehouse",
      sourceThreadId: "thread-1",
    }],
  }];

  linkLegacyBrowserTraceMetadata(observations);

  assert.equal(observations[0].actor, "이전 직접 브라우저 작업자(원문 미기재)");
  assert.match(observations[0].steps[0], /thread-1/);
  assert.match(observations[0].steps[1], /요청 작성 화면/);
});
