import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR_PATH = path.join(TEST_DIR, "generate-mes-pc-review.mjs");
const REQUIRE = createRequire(import.meta.url);

async function loadGenerator() {
  assert.equal(
    fs.existsSync(GENERATOR_PATH),
    true,
    "검토 HTML 생성기 파일이 아직 없습니다.",
  );
  return import(pathToFileURL(GENERATOR_PATH).href);
}

function makeAudit(overrides = {}) {
  const baseCase = {
    id: "8.1-01",
    category: "입출고",
    action: "요청 작성",
    staffExpected: "직원이 사용할 수 있는 요청만 보여야 한다.",
    staffActual: "사용할 수 있는 요청만 표시됐다.",
    verdict: "DIFFERENCE",
    note: "직접 주소 접근은 추가 확인이 필요하다.",
    actor: "SECRET_ACTOR",
    prerequisites: ["SECRET_PREREQUISITE"],
    steps: ["SECRET_STEP"],
    effects: { inventoryBefore: "SECRET_INVENTORY" },
    evidence: [{ reference: "SECRET_EVIDENCE" }],
    existingAutomatedTests: ["SECRET_TEST"],
    recommendedTestLayer: "SECRET_LAYER",
  };

  return {
    schemaVersion: 1,
    run: { runId: "PC-BROWSER-AUDIT-20260918" },
    cases: [{ ...baseCase, ...(overrides.case ?? {}) }],
    ...overrides.audit,
  };
}

test("원장 전체 ID와 검토 필드만 모델에 포함한다", async () => {
  const { buildReviewModel } = await loadGenerator();
  const audit = makeAudit({
    audit: {
      cases: [
        makeAudit().cases[0],
        {
          ...makeAudit().cases[0],
          id: "PC-DELTA-TEST-01",
          category: "테스트 거버넌스",
          verdict: "PASS",
        },
      ],
    },
  });

  const model = buildReviewModel(audit);

  assert.deepEqual(model.items.map((item) => item.id), ["8.1-01", "PC-DELTA-TEST-01"]);
  assert.deepEqual(Object.keys(model.items[0]).sort(), [
    "action",
    "actual",
    "category",
    "expected",
    "id",
    "note",
    "verdict",
  ]);
});

test("중복 ID와 기대·실제 문구 누락을 거부한다", async () => {
  const { buildReviewModel } = await loadGenerator();
  const duplicated = makeAudit();
  duplicated.cases.push({ ...duplicated.cases[0] });

  assert.throws(() => buildReviewModel(duplicated), /중복 ID/);
  assert.throws(
    () => buildReviewModel(makeAudit({ case: { staffExpected: "" } })),
    /staffExpected/,
  );
  assert.throws(
    () => buildReviewModel(makeAudit({ case: { staffActual: "   " } })),
    /staffActual/,
  );
});

test("직원 서버 주소와 자격 증명 숫자를 HTML 원본에서 차단한다", async () => {
  const { buildReviewModel } = await loadGenerator();

  assert.throws(
    () => buildReviewModel(makeAudit({ case: { staffActual: "http://192.168.0.63:3000 확인" } })),
    /직원 서버 주소/,
  );
  assert.throws(
    () => buildReviewModel(makeAudit({ case: { staffActual: "관리자 비밀번호 0000으로 로그인" } })),
    /자격 증명/,
  );
});

test("기본 필터는 DIFFERENCE + 미검토이고 불필요한 원장 정보는 출력하지 않는다", async () => {
  const { buildReviewModel, renderReviewHtml } = await loadGenerator();
  const html = renderReviewHtml(buildReviewModel(makeAudit()));

  assert.match(html, /data-default-scope="difference"/);
  assert.match(html, /id="unreviewedOnly"[^>]*checked/);
  assert.match(html, /기대값 맞음/);
  assert.match(html, /기대값 수정/);
  assert.match(html, /보류/);
  assert.doesNotMatch(html, /SECRET_ACTOR|SECRET_PREREQUISITE|SECRET_STEP/);
  assert.doesNotMatch(html, /SECRET_INVENTORY|SECRET_EVIDENCE|SECRET_TEST|SECRET_LAYER/);
  assert.doesNotMatch(html, /CSV|전체 펼치기|전체 접기/);
});

test("스크립트 종료 문자열과 JSON 경계 문자를 안전하게 이스케이프한다", async () => {
  const { buildReviewModel, renderReviewHtml } = await loadGenerator();
  const payload = "</script><script>alert('x')</script>&\u2028\u2029끝";
  const html = renderReviewHtml(
    buildReviewModel(makeAudit({ case: { staffActual: payload } })),
  );

  assert.doesNotMatch(html, /<script>alert\('x'\)<\/script>/);
  assert.match(html, /\\u003c\\\/script\\u003e/);
  assert.match(html, /\\u0026/);
  assert.match(html, /\\u2028/);
  assert.match(html, /\\u2029/);
});

test("검토 결과 스키마와 실행 ID를 검증한다", async () => {
  const { normalizeReviewExport } = await loadGenerator();
  const validIds = ["8.1-01"];
  const valid = {
    schemaVersion: 2,
    auditRunId: "PC-BROWSER-AUDIT-20260918",
    exportedAt: "2026-09-18T00:00:00.000Z",
    reviews: {
      "8.1-01": {
        verdict: "revision",
        note: "기대값을 더 구체적으로 수정",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    },
  };

  assert.deepEqual(
    normalizeReviewExport(valid, "PC-BROWSER-AUDIT-20260918", validIds),
    valid.reviews,
  );
  assert.throws(
    () => normalizeReviewExport({ ...valid, auditRunId: "OTHER-RUN" }, "PC-BROWSER-AUDIT-20260918", validIds),
    /실행 ID/,
  );
  assert.throws(
    () => normalizeReviewExport({ ...valid, schemaVersion: 1 }, "PC-BROWSER-AUDIT-20260918", validIds),
    /schemaVersion/,
  );
  assert.throws(
    () => normalizeReviewExport({ ...valid, reviews: { "8.1-01": { verdict: "maybe" } } }, "PC-BROWSER-AUDIT-20260918", validIds),
    /판정 값/,
  );
});

test("생성된 HTML은 원장 345개 ID와 실행 가능한 인라인 스크립트를 담는다", () => {
  const repoRoot = path.resolve(TEST_DIR, "../..");
  const reviewPath = path.join(
    repoRoot,
    "docs/superpowers/specs/2026-09-18-mes-pc-expected-actual-review.html",
  );
  assert.equal(fs.existsSync(reviewPath), true, "검토 HTML을 먼저 생성해야 합니다.");

  const html = fs.readFileSync(reviewPath, "utf8");
  const dataStartMarker = '<script id="review-data" type="application/json">';
  const dataStart = html.indexOf(dataStartMarker);
  const dataEnd = html.indexOf("</script>", dataStart);
  assert.notEqual(dataStart, -1, "내장 검토 데이터가 없습니다.");
  assert.notEqual(dataEnd, -1, "내장 검토 데이터가 닫히지 않았습니다.");

  const model = JSON.parse(html.slice(dataStart + dataStartMarker.length, dataEnd));
  const outputIds = model.items.map((item) => item.id);
  assert.equal(outputIds.length, 345);
  assert.equal(new Set(outputIds).size, outputIds.length);

  const runtimeStart = html.lastIndexOf("<script>");
  const runtimeEnd = html.indexOf("</script>", runtimeStart);
  assert.doesNotThrow(() => new Function(html.slice(runtimeStart + 8, runtimeEnd)));
  assert.doesNotMatch(html, /192\.168\.0\.63:(?:3000|8010)/);
  assert.doesNotMatch(html, /(?:비밀번호|password|pin)[^\r\n]{0,24}\b\d{4,}\b/i);
});

test("생성된 HTML에서 필터·판정·의견 자동 저장과 새로고침 복원이 동작한다", () => {
  const repoRoot = path.resolve(TEST_DIR, "../..");
  const { JSDOM } = REQUIRE(path.join(repoRoot, "frontend/node_modules/jsdom"));
  const reviewPath = path.join(
    repoRoot,
    "docs/superpowers/specs/2026-09-18-mes-pc-expected-actual-review.html",
  );
  const html = fs.readFileSync(reviewPath, "utf8");
  const dataStartMarker = '<script id="review-data" type="application/json">';
  const dataStart = html.indexOf(dataStartMarker);
  const dataEnd = html.indexOf("</script>", dataStart);
  const model = JSON.parse(html.slice(dataStart + dataStartMarker.length, dataEnd));
  const differenceCount = model.items.filter((item) => item.verdict === "DIFFERENCE").length;
  const passCount = model.items.filter((item) => item.verdict === "PASS").length;
  const storageKey = `dexcowin-mes-pc-review-v2:${model.auditRunId}`;

  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://review.local/expected-actual.html",
  });
  const { document, Event } = dom.window;
  assert.equal(document.querySelectorAll(".card").length, differenceCount);

  const firstDifference = model.items.find((item) => item.verdict === "DIFFERENCE");
  const search = document.getElementById("search");
  search.value = firstDifference.id;
  search.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(document.querySelectorAll(".card").length, 1);
  search.value = "";
  search.dispatchEvent(new Event("input", { bubbles: true }));

  document.querySelector('[data-scope="pass"]').click();
  assert.equal(document.querySelectorAll(".card").length, passCount);
  document.querySelector('[data-scope="difference"]').click();

  const reviewCards = document.querySelectorAll(".card");
  const approvedId = reviewCards[0].dataset.itemId;
  reviewCards[0].querySelector('[data-verdict="approved"]').click();
  const revisionId = reviewCards[1].dataset.itemId;
  reviewCards[1].querySelector('[data-verdict="revision"]').click();
  const textarea = reviewCards[1].querySelector("textarea");
  assert.equal(textarea.closest(".note-wrap").hidden, false);
  textarea.value = "직원 기대 문구를 실제 업무 기준으로 수정";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));

  const stored = dom.window.localStorage.getItem(storageKey);
  const payload = JSON.parse(stored);
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.auditRunId, model.auditRunId);
  assert.equal(payload.reviews[approvedId].verdict, "approved");
  assert.equal(payload.reviews[revisionId].note, textarea.value);
  dom.window.close();

  const restored = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://review.local/expected-actual.html",
    beforeParse(window) {
      window.localStorage.setItem(storageKey, stored);
    },
  });
  assert.equal(
    restored.window.document.querySelectorAll(".card").length,
    differenceCount - 2,
  );
  restored.window.close();
});
