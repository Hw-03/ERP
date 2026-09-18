import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseEvidenceSections } from "./generate-mes-regression-review.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md",
);
const ALLOWED_VERDICTS = new Set(["PASS", "DIFFERENCE", "BLOCKED", "DEFERRED-MOBILE"]);
const ALLOWED_TEST_LAYERS = new Set(["BACKEND", "VITEST", "PLAYWRIGHT", "MANUAL", null]);
const ALLOWED_BROWSER_SURFACES = new Set([
  "CHROME",
  "CODEX_IN_APP_BROWSER",
  "LEGACY_DIRECT_BROWSER",
]);
const ALLOWED_BROWSER_COVERAGE = new Set([
  "REUSED_COMPLETE",
  "REUSED_PARTIAL_SUPPLEMENTED",
  "FRESH_IN_APP",
]);

function assertNoCredentials(value, trail = "run") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:pin|password|passwd|secret|credential)/i.test(key)) {
      throw new Error(`민감정보 필드(${trail}.${key})는 감사 원장에 기록할 수 없습니다.`);
    }
    assertNoCredentials(child, `${trail}.${key}`);
  }
}

function redactCredentialLiterals(value) {
  if (typeof value === "string") {
    return value.replace(/\b(PIN(?:\s*초기화)?\s*\(?\s*)\d{4}\b/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactCredentialLiterals);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, redactCredentialLiterals(child)]),
  );
}

function emptyEffects() {
  return {
    inventoryBefore: null,
    inventoryAfter: null,
    reservationBefore: null,
    reservationAfter: null,
    history: [],
  };
}

function contractCase(section, item) {
  return redactCredentialLiterals({
    id: item.id,
    source: "CONTRACT",
    section: section.id,
    category: section.category,
    scenario: section.title,
    action: item.action,
    actor: null,
    roleBoundary: null,
    prerequisites: [],
    steps: [],
    expected: item.expected,
    staffExpected: null,
    actual: null,
    staffActual: null,
    effects: emptyEffects(),
    evidence: [],
    existingAutomatedTests: [],
    recommendedTestLayer: null,
    verdict: null,
    note: null,
    baseline: {
      actual: item.actual,
      coverage: item.coverage,
      investigation: item.investigation,
    },
  });
}

function deltaCase(delta) {
  if (!/^PC-DELTA-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}$/.test(delta.id ?? "")) {
    throw new Error(`delta ID는 PC-DELTA-<영역>-NN 형식이어야 합니다: ${delta.id ?? "(없음)"}`);
  }
  for (const field of ["category", "scenario", "action", "expected"]) {
    if (!String(delta[field] ?? "").trim()) throw new Error(`${delta.id}의 ${field} 값이 없습니다.`);
  }
  return redactCredentialLiterals({
    id: delta.id,
    source: "DELTA",
    section: null,
    category: delta.category,
    scenario: delta.scenario,
    action: delta.action,
    actor: null,
    roleBoundary: null,
    prerequisites: [],
    steps: [],
    expected: delta.expected,
    staffExpected: null,
    actual: null,
    staffActual: null,
    effects: emptyEffects(),
    evidence: [],
    existingAutomatedTests: [],
    recommendedTestLayer: null,
    verdict: null,
    note: delta.note ?? null,
    baseline: null,
  });
}

function calculateSummary(cases) {
  const summary = {
    total: cases.length,
    pending: 0,
    pass: 0,
    difference: 0,
    blocked: 0,
    deferredMobile: 0,
  };
  for (const entry of cases) {
    if (entry.verdict === "PASS") summary.pass += 1;
    else if (entry.verdict === "DIFFERENCE") summary.difference += 1;
    else if (entry.verdict === "BLOCKED") summary.blocked += 1;
    else if (entry.verdict === "DEFERRED-MOBILE") summary.deferredMobile += 1;
    else summary.pending += 1;
  }
  return summary;
}

export function validateAudit(audit) {
  assertNoCredentials(audit.run);
  if (audit.schemaVersion !== 1 || audit.scope !== "PC") throw new Error("지원하지 않는 PC 감사 원장 형식입니다.");
  if (/:(?:3000|8010)(?:\/|$)/.test(audit.run.frontendUrl ?? "") || /:(?:3000|8010)(?:\/|$)/.test(audit.run.backendUrl ?? "")) {
    throw new Error("직원 서버(3000/8010)는 PC 개발 검수 대상에 포함할 수 없습니다.");
  }
  const contractCases = audit.cases.filter((entry) => entry.source === "CONTRACT");
  if (contractCases.length !== 270) throw new Error(`기존 계약은 정확히 270개여야 합니다: ${contractCases.length}개`);
  const ids = audit.cases.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new Error("감사 원장에 중복 ID가 있습니다.");
  for (const entry of audit.cases) {
    if (entry.source === "DELTA" && !/^PC-DELTA-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}$/.test(entry.id)) {
      throw new Error(`delta ID는 PC-DELTA-<영역>-NN 형식이어야 합니다: ${entry.id}`);
    }
    if (entry.verdict !== null && !ALLOWED_VERDICTS.has(entry.verdict)) throw new Error(`${entry.id}의 판정이 올바르지 않습니다.`);
    if (entry.verdict !== null && !String(entry.staffExpected ?? "").trim()) {
      throw new Error(`${entry.id}의 직원용 기대 반응이 없습니다.`);
    }
    if (entry.verdict !== null && !String(entry.staffActual ?? "").trim()) {
      throw new Error(`${entry.id}의 직원용 실제 반응이 없습니다.`);
    }
    if (!ALLOWED_TEST_LAYERS.has(entry.recommendedTestLayer)) throw new Error(`${entry.id}의 권장 테스트 계층이 올바르지 않습니다.`);
  }
  return audit;
}

function directBrowserEvidence(entry) {
  return entry.evidence.filter((item) => (
    item.type === "UI"
    && ALLOWED_BROWSER_SURFACES.has(item.browserSurface)
    && String(item.observedAt ?? "").trim()
    && /^http:\/\/192\.168\.0\.63:3001(?:\/|$)/.test(item.url ?? "")
  ));
}

export function finalizeBrowserCompletionAudit(audit) {
  validateAudit(audit);
  if (audit.cases.length !== 345) {
    throw new Error(`브라우저 완료 원장은 정확히 345개여야 합니다: ${audit.cases.length}개`);
  }
  const engineeringCases = audit.cases.filter((entry) => entry.category === "테스트 거버넌스");
  const appCases = audit.cases.filter((entry) => entry.category !== "테스트 거버넌스");
  if (engineeringCases.length !== 3 || appCases.length !== 342) {
    throw new Error(`앱 342건과 엔지니어링 3건으로 분리해야 합니다: 앱 ${appCases.length}건, 엔지니어링 ${engineeringCases.length}건`);
  }
  for (const entry of appCases) {
    if (entry.verificationClass !== "APP_BROWSER") {
      throw new Error(`${entry.id}는 앱 브라우저 검증 항목이어야 합니다.`);
    }
    if (!["PASS", "DIFFERENCE", "BLOCKED"].includes(entry.verdict)) {
      throw new Error(`${entry.id}의 앱 브라우저 판정이 완료되지 않았습니다.`);
    }
    if (!ALLOWED_BROWSER_COVERAGE.has(entry.browserCoverage)) {
      throw new Error(`${entry.id}의 브라우저 검수 분류가 올바르지 않습니다.`);
    }
    const browserEvidence = directBrowserEvidence(entry);
    if (browserEvidence.length === 0) {
      throw new Error(`${entry.id}에 직접 브라우저 UI 증거가 없습니다.`);
    }
    if (!String(entry.actor ?? "").trim() || !Array.isArray(entry.steps) || entry.steps.length === 0) {
      throw new Error(`${entry.id}에 작업자와 조작 순서가 없습니다.`);
    }
    if (
      ["REUSED_PARTIAL_SUPPLEMENTED", "FRESH_IN_APP"].includes(entry.browserCoverage)
      && !browserEvidence.some((item) => item.browserSurface === "CODEX_IN_APP_BROWSER")
    ) {
      throw new Error(`${entry.id}에 인앱 브라우저 보완 증거가 없습니다.`);
    }
  }
  for (const entry of engineeringCases) {
    if (entry.verificationClass !== "ENGINEERING") {
      throw new Error(`${entry.id}는 엔지니어링 검증 항목이어야 합니다.`);
    }
    if (!["PASS", "DIFFERENCE", "BLOCKED"].includes(entry.verdict)) {
      throw new Error(`${entry.id}의 엔지니어링 판정이 완료되지 않았습니다.`);
    }
    if (!entry.evidence.some((item) => item.type === "TEST")) {
      throw new Error(`${entry.id}에 엔지니어링 테스트 증거가 없습니다.`);
    }
  }
  const reusedCases = appCases.filter((entry) => entry.browserCoverage !== "FRESH_IN_APP");
  const reusedCodexInApp = reusedCases.filter((entry) => entry.evidence.some((item) => (
    item.type === "UI"
    && item.browserSurface === "CODEX_IN_APP_BROWSER"
    && String(item.sourceRunId ?? "").trim()
  )));
  const reusedChrome = reusedCases.filter((entry) => entry.evidence.some((item) => (
    item.type === "UI"
    && item.browserSurface === "CHROME"
    && String(item.sourceRunId ?? "").trim()
  )));
  audit.browserCompletion = {
    appCases: appCases.length,
    engineeringCases: engineeringCases.length,
    reusedComplete: appCases.filter((entry) => entry.browserCoverage === "REUSED_COMPLETE").length,
    reusedPartialSupplemented: appCases.filter((entry) => entry.browserCoverage === "REUSED_PARTIAL_SUPPLEMENTED").length,
    freshInApp: appCases.filter((entry) => entry.browserCoverage === "FRESH_IN_APP").length,
    reusedSourceCounts: {
      codexInAppBrowser: reusedCodexInApp.length,
      chrome: reusedChrome.length,
      legacyDirectBrowser: reusedCases.length - reusedCodexInApp.length - reusedChrome.length,
    },
  };
  return audit;
}

export function createPcAudit({ contractMarkdown, run, deltas = [] }) {
  assertNoCredentials(run);
  const sections = parseEvidenceSections(contractMarkdown);
  const cases = sections.flatMap((section) => section.items.map((item) => contractCase(section, item)));
  cases.push(...deltas.map(deltaCase));
  const audit = {
    schemaVersion: 1,
    scope: "PC",
    contractSource: "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md",
    run: structuredClone(run),
    summary: calculateSummary(cases),
    cases,
  };
  return validateAudit(audit);
}

export function recordCaseResult(audit, id, result) {
  const entry = audit.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`감사 항목을 찾을 수 없습니다: ${id}`);
  if (!ALLOWED_VERDICTS.has(result.verdict)) throw new Error(`${id}의 판정이 올바르지 않습니다: ${result.verdict}`);
  if (!String(result.actual ?? "").trim()) throw new Error(`${id}의 실제 반응이 없습니다.`);
  if (!String(result.staffExpected ?? "").trim()) throw new Error(`${id}의 직원용 기대 반응이 없습니다.`);
  if (!String(result.staffActual ?? "").trim()) throw new Error(`${id}의 직원용 실제 반응이 없습니다.`);
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) throw new Error(`${id}의 증거가 없습니다.`);
  if (result.recommendedTestLayer !== undefined && !ALLOWED_TEST_LAYERS.has(result.recommendedTestLayer)) {
    throw new Error(`${id}의 권장 테스트 계층이 올바르지 않습니다.`);
  }
  const { verdict, ...observation } = result;
  recordCaseObservation(audit, id, observation);
  entry.verdict = verdict;
  audit.summary = calculateSummary(audit.cases);
  validateAudit(audit);
  return entry;
}

export function recordCaseObservation(audit, id, observation) {
  const entry = audit.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`감사 항목을 찾을 수 없습니다: ${id}`);
  if (Object.hasOwn(observation, "verdict")) {
    throw new Error("판정 확정은 recordCaseResult를 사용해야 합니다.");
  }
  if (observation.recommendedTestLayer !== undefined && !ALLOWED_TEST_LAYERS.has(observation.recommendedTestLayer)) {
    throw new Error(`${id}의 권장 테스트 계층이 올바르지 않습니다.`);
  }
  Object.assign(entry, redactCredentialLiterals(structuredClone(observation)));
  audit.summary = calculateSummary(audit.cases);
  validateAudit(audit);
  return entry;
}

export function mergeBrowserEvidence(observations, records) {
  for (const record of records) {
    const targetIds = record.ids ?? (record.id ? [record.id] : []);
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      throw new Error("브라우저 증거에는 id 또는 ids가 필요합니다.");
    }
    if (record.outcome?.verdict && !["PASS", "DIFFERENCE", "BLOCKED"].includes(record.outcome.verdict)) {
      throw new Error(`브라우저 증거 판정이 올바르지 않습니다: ${record.outcome.verdict}`);
    }
    for (const id of targetIds) {
      const entry = observations.find((candidate) => candidate.id === id);
      if (!entry) throw new Error(`브라우저 증거 대상 항목을 찾을 수 없습니다: ${id}`);
      const { actor, steps, ...evidence } = structuredClone(record.evidence);
      entry.evidence ??= [];
      const duplicate = entry.evidence.some((item) => (
        item.type === evidence.type
        && item.reference === evidence.reference
        && item.browserSurface === evidence.browserSurface
        && item.observedAt === evidence.observedAt
        && item.url === evidence.url
      ));
      if (!duplicate) entry.evidence.push(evidence);
      if (
        evidence.type === "UI"
        && evidence.browserSurface === "CODEX_IN_APP_BROWSER"
        && String(evidence.reference ?? "").trim()
      ) {
        const supplementalActual = `보완 브라우저 실측: ${evidence.reference}`;
        for (const field of ["actual", "staffActual"]) {
          const current = String(entry[field] ?? "").trim();
          if (!current.includes(supplementalActual)) {
            entry[field] = current ? `${current}\n\n${supplementalActual}` : supplementalActual;
          }
        }
      }
      if (!entry.actor && actor) entry.actor = actor;
      if (Array.isArray(steps) && steps.length > 0) {
        entry.steps = [...new Set([...(entry.steps ?? []), ...steps])];
      }
      if (record.outcome) Object.assign(entry, structuredClone(record.outcome));
    }
  }
  return observations;
}

export function linkLegacyBrowserTraceMetadata(observations) {
  for (const entry of observations.filter((candidate) => candidate.browserCoverage === "REUSED_COMPLETE")) {
    const linkedEvidence = entry.evidence?.find((item) => (
      item.type === "UI"
      && item.sourceThreadId
      && String(item.reference ?? "").trim()
    ));
    if (!linkedEvidence) {
      throw new Error(`${entry.id}의 기존 직접 브라우저 증거를 원본 스레드와 연결할 수 없습니다.`);
    }
    if (!String(entry.actor ?? "").trim()) {
      entry.actor = "이전 직접 브라우저 작업자(원문 미기재)";
    }
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
      entry.steps = [
        `이전 스레드 ${linkedEvidence.sourceThreadId} 직접 브라우저 증거 재연결`,
        `원본 화면 기록 대조: ${linkedEvidence.reference}`,
      ];
    }
  }
  return observations;
}

function markdownCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  const text = Array.isArray(value) ? value.map((item, index) => `${index + 1}. ${typeof item === "string" ? item : JSON.stringify(item)}`).join("<br>") : String(value);
  return text
    .replace(/\]\(([^)\n]+)\)/g, "]\\($1\\)")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, "<br>");
}

function effectSummary(effects) {
  return [
    `재고 ${markdownCell(effects.inventoryBefore)} → ${markdownCell(effects.inventoryAfter)}`,
    `예약 ${markdownCell(effects.reservationBefore)} → ${markdownCell(effects.reservationAfter)}`,
    `내역 ${markdownCell(effects.history)}`,
  ].join("<br>");
}

function evidenceSummary(evidence) {
  if (!evidence.length) return "—";
  return evidence.map((item) => `${item.type}: ${item.reference}`).join("<br>");
}

function caseTable(cases) {
  const header = "| ID | 작업자/권한 | 선행 조건 | 조작 순서 | 기대 반응(직원용) | 실제 반응(직원용) | 재고·예약·내역 전후값 | 증거 | 기존 자동 테스트 | 권장 테스트 계층 | 판정 |";
  const separator = "|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = cases.map((entry) => [
    entry.id,
    [entry.actor, entry.roleBoundary].filter(Boolean).join(" / "),
    entry.prerequisites,
    entry.steps,
    entry.staffExpected ?? entry.expected,
    entry.staffActual ?? entry.actual,
    effectSummary(entry.effects),
    evidenceSummary(entry.evidence),
    entry.existingAutomatedTests,
    entry.recommendedTestLayer,
    entry.verdict ?? "PENDING",
  ].map(markdownCell).join(" | "));
  return [header, separator, ...rows.map((row) => `| ${row} |`)].join("\n");
}

export function renderAuditMarkdown(audit) {
  validateAudit(audit);
  audit.summary = calculateSummary(audit.cases);
  const s = audit.summary;
  const completion = audit.run.completion;
  const qaArtifacts = completion?.qaArtifacts ?? [];
  const qaArtifactsRemoved = completion?.qaArtifactsRemoved ?? [];
  const qaCleanupStatus = completion?.qaArtifactsDeleted
    ? "완료"
    : completion?.qaArtifactsCleanupPerformed
      ? `일부 완료 · ${completion.qaArtifactsPreservedReason}`
      : `미실행 · ${completion?.qaArtifactsPreservedReason}`;
  const completionSection = completion
    ? `\n## 종료 상태\n\n- 종료 시각: ${completion.completedAt}\n- 임시 권한 원복: ${completion.temporaryPermissionsRestored ? "완료" : "미완료"}\n- 최종 화면: ${completion.finalFrontendUrl}\n- QA 데이터 삭제: ${qaCleanupStatus}\n- 삭제한 QA 데이터: ${qaArtifactsRemoved.length > 0 ? qaArtifactsRemoved.join(", ") : "없음"}\n- 보존된 QA 데이터: ${qaArtifacts.length > 0 ? qaArtifacts.join(", ") : "없음"}\n- 감사 이력 삭제: ${completion.auditHistoryDeleted ? "실행" : "미실행"}\n`
    : "";
  const browserCompletionSection = audit.browserCompletion
    ? `\n## 브라우저 완료 집계\n\n- 앱 브라우저 검수 ${audit.browserCompletion.appCases}건\n- 기존 완전 실측 재사용 ${audit.browserCompletion.reusedComplete}건\n- 기존 부분 실측 보완 ${audit.browserCompletion.reusedPartialSupplemented}건\n- 신규 인앱 브라우저 실측 ${audit.browserCompletion.freshInApp}건\n- 엔지니어링 검증 ${audit.browserCompletion.engineeringCases}건\n- 기존 명시적 인앱 브라우저 ${audit.browserCompletion.reusedSourceCounts.codexInAppBrowser}건\n- 기존 Chrome 직접 실측 ${audit.browserCompletion.reusedSourceCounts.chrome}건\n- 기존 스레드 연결 직접 브라우저 ${audit.browserCompletion.reusedSourceCounts.legacyDirectBrowser}건\n- 기존 혼합 검수 보고서는 원본 증거 추적용 참고자료이며, 최종 판정은 본 원장을 기준으로 한다.\n`
    : "";
  const decisions = audit.cases.filter((entry) => entry.verdict === "DIFFERENCE" || entry.verdict === "BLOCKED");
  const decisionLines = decisions.length
    ? decisions.map((entry) => `- **${entry.id}** ${entry.action} — ${entry.verdict}: ${entry.note ?? entry.actual}`).join("\n")
    : "- 없음";
  return `# DEXCOWIN MES PC 전수 업무 검수 결과

## 실행 정보

- Run ID: \`${audit.run.runId}\`
- 시작 시각: ${audit.run.startedAt}
- Git HEAD: \`${audit.run.head}\`
- 프런트엔드: ${audit.run.frontendUrl}
- 백엔드: ${audit.run.backendUrl}
- DB SHA256: \`${audit.run.database.sha256}\`
- DB 백업: \`${audit.run.database.backupPath}\`
${completionSection}

## 판정 요약

- 총 ${s.total}건
- PENDING ${s.pending}건
- PASS ${s.pass}건
- DIFFERENCE ${s.difference}건
- BLOCKED ${s.blocked}건
- DEFERRED-MOBILE ${s.deferredMobile}건
${browserCompletionSection}

## 사용자 확인 필요

${decisionLines}

## 전체 검수표

${caseTable(audit.cases)}
`;
}

export function writeAuditFiles(audit, { jsonPath, markdownPath }) {
  validateAudit(audit);
  fs.writeFileSync(jsonPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownPath, renderAuditMarkdown(audit), "utf8");
  return { jsonPath, markdownPath, caseCount: audit.cases.length };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runCli() {
  const metadataPath = argValue("--run");
  const jsonPath = argValue("--json");
  const markdownPath = argValue("--markdown");
  const deltasPath = argValue("--deltas");
  const resultsPath = argValue("--results");
  const browserEvidencePath = argValue("--browser-evidence");
  const shouldFinalizeBrowser = process.argv.includes("--finalize-browser");
  if (!metadataPath || !jsonPath || !markdownPath) {
    throw new Error("사용법: --run <metadata.json> --json <audit.json> --markdown <audit.md> [--deltas <deltas.json>] [--results <observations.json>] [--browser-evidence <evidence.json>] [--finalize-browser]");
  }
  const run = JSON.parse(fs.readFileSync(path.resolve(metadataPath), "utf8"));
  const deltas = deltasPath ? JSON.parse(fs.readFileSync(path.resolve(deltasPath), "utf8")) : [];
  const audit = createPcAudit({ contractMarkdown: fs.readFileSync(DEFAULT_CONTRACT_PATH, "utf8"), run, deltas });
  if (resultsPath) {
    const results = JSON.parse(fs.readFileSync(path.resolve(resultsPath), "utf8"));
    for (const result of results) {
      const { id, ...values } = result;
      if (values.verdict) recordCaseResult(audit, id, values);
      else recordCaseObservation(audit, id, values);
    }
  }
  if (browserEvidencePath) {
    const browserEvidence = JSON.parse(fs.readFileSync(path.resolve(browserEvidencePath), "utf8"));
    mergeBrowserEvidence(audit.cases, browserEvidence);
  }
  if (shouldFinalizeBrowser) {
    linkLegacyBrowserTraceMetadata(audit.cases);
    finalizeBrowserCompletionAudit(audit);
  }
  const result = writeAuditFiles(audit, { jsonPath: path.resolve(jsonPath), markdownPath: path.resolve(markdownPath) });
  console.log(`PC 감사 원장 생성 완료: ${result.caseCount}개`);
  console.log(result.jsonPath);
  console.log(result.markdownPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCli();
