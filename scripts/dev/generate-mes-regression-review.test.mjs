import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "../../frontend/node_modules/jsdom/lib/api.js";

import {
  deriveTestTarget,
  generateReview,
  parseEvidenceSections,
  reviewToCsv,
} from "./generate-mes-regression-review.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md",
);
const REVIEW_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-14-mes-functional-regression-review.html",
);
const RESULT_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-16-mes-functional-regression-review-result.json",
);

test("4열과 5열 실측 표를 동일한 검수 항목으로 정규화한다", () => {
  const markdown = `
### 8.1 첫 화면

설명 문장

| 화면/행동 | 확인한 현행 | 테스트에 포함할 내용 | 기대값 제안 | 확인 상태 |
|---|---|---|---|---|
| 버튼 확인 | 현재 문구 | 문구 검증 | 완료 안내 | **화면 확인** |

### 8.2 실제 제출

| 항목 | 기대값 제안 | 실제 반응 | 판정/후속 |
|---|---|---|---|
| 재고 | 창고 +1 | 창고 0→1 | 실제 반응 일치 |

## 9. 다음 장
`;

  const sections = parseEvidenceSections(markdown);

  assert.equal(sections.length, 2);
  assert.equal(sections[0].id, "8.1");
  assert.equal(sections[0].context, "설명 문장");
  assert.deepEqual(sections[0].items[0], {
    id: "8.1-01",
    action: "버튼 확인",
    expected: "완료 안내",
    actual: "현재 문구",
    coverage: "문구 검증",
    investigation: "**화면 확인**",
  });
  assert.deepEqual(sections[1].items[0], {
    id: "8.2-01",
    action: "재고",
    expected: "창고 +1",
    actual: "창고 0→1",
    coverage: "",
    investigation: "실제 반응 일치",
  });
});

test("사용자 기대값 승인과 실측 상태를 테스트 대상으로 변환한다", () => {
  assert.equal(deriveTestTarget("approved", "실제 반응 일치"), "정상 동작 보호 테스트");
  assert.equal(deriveTestTarget("approved", "**표시 문구 불일치**"), "버그 재현 테스트");
  assert.equal(deriveTestTarget("approved", "화면 확인"), "추가 실측 필요");
  assert.equal(deriveTestTarget("revision", "실제 반응 일치"), "기대값 수정 대기");
  assert.equal(deriveTestTarget("hold", "실제 반응 일치"), "판단 보류");
  assert.equal(deriveTestTarget("", "실제 반응 일치"), "미확인");
});

test("CSV는 판정과 줄바꿈을 손실 없이 인용한다", () => {
  const csv = reviewToCsv(
    [{ id: "8.1", title: "첫 화면", category: "입출고", items: [{ id: "8.1-01", action: "버튼, 확인", expected: "첫째\n둘째", actual: "실제", coverage: "", investigation: "일치" }] }],
    { "8.1-01": { verdict: "approved", note: "확정" } },
  );

  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /"버튼, 확인"/);
  assert.match(csv, /"첫째\n둘째"/);
  assert.match(csv, /기대값 맞음/);
});

test("실제 계약서의 8.1~8.25와 모든 표 행을 고유 ID로 읽는다", () => {
  const markdown = fs.readFileSync(CONTRACT_PATH, "utf8");
  const sections = parseEvidenceSections(markdown);
  const ids = sections.flatMap((section) => section.items.map((item) => item.id));

  assert.equal(sections.length, 25);
  assert.equal(sections[0].id, "8.1");
  assert.equal(sections.at(-1).id, "8.25");
  assert.ok(ids.length > 100, `검수 항목이 너무 적습니다: ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(sections.every((section) => section.items.length > 0));
  assert.match(markdown, /먼저 볼 문서.*2026-09-14-mes-functional-regression-review\.html/);
});

test("완료한 사용자 판정은 원본 270개 항목과 빠짐없이 연결된다", () => {
  const markdown = fs.readFileSync(CONTRACT_PATH, "utf8");
  const expectedIds = parseEvidenceSections(markdown)
    .flatMap((section) => section.items.map((item) => item.id));
  const result = JSON.parse(fs.readFileSync(RESULT_PATH, "utf8"));
  const actualIds = Object.keys(result.reviews);
  const counts = Object.values(result.reviews).reduce((acc, review) => {
    acc[review.verdict] = (acc[review.verdict] ?? 0) + 1;
    return acc;
  }, {});

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.source, "browser-localStorage");
  assert.deepEqual(actualIds.sort(), expectedIds.sort());
  assert.deepEqual(counts, { approved: 235, hold: 28, revision: 7 });
  assert.ok(Object.values(result.reviews).every((review) => review.updatedAt));
});

test("생성 HTML은 독립 실행형 검수 기능을 포함한다", () => {
  const html = fs.readFileSync(REVIEW_PATH, "utf8");

  assert.match(html, /실화면 조사 판정표/);
  assert.match(html, /localStorage/);
  assert.match(html, /JSON 내보내기/);
  assert.match(html, /CSV 내보내기/);
  assert.match(html, /기대값 수정 필요/);
  assert.match(html, /8\.25/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  assert.doesNotMatch(html, /<link[^>]+href=/);
});

test("같은 원본을 다시 생성해도 HTML 내용이 달라지지 않는다", async () => {
  generateReview();
  const first = fs.readFileSync(REVIEW_PATH, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 5));
  generateReview();
  const second = fs.readFileSync(REVIEW_PATH, "utf8");
  assert.equal(second, first);
});

test("판정·필수 의견·새로고침 복원·필터가 실제 HTML에서 동작한다", async () => {
  const html = fs.readFileSync(REVIEW_PATH, "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://review.local/" });
  const { document, localStorage, Event } = dom.window;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  assert.equal(document.querySelectorAll(".scenario").length, 25);
  assert.equal(document.querySelectorAll(".review-item").length, 270);

  document.querySelector('[data-section="8.1"]').open = true;
  document.querySelector('[data-item="8.1-01"][data-verdict="approved"]').click();
  assert.equal(document.querySelector("#approvedCount").textContent, "1");
  assert.equal(document.querySelector("#pendingCount").textContent, "269");
  assert.equal(document.querySelector('[data-section="8.1"]').open, true);
  assert.ok(document.getElementById("item-8.1-02"));

  const revision = document.querySelector('[data-item="8.1-02"][data-verdict="revision"]');
  revision.click();
  const note = document.querySelector('[data-note="8.1-02"]');
  assert.ok(note.classList.contains("invalid"));
  assert.equal(document.activeElement, note);
  assert.equal(document.querySelector("#pendingCount").textContent, "269");
  note.value = "완료 문구를 즉시 처리로 변경";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(document.querySelector("#revisionCount").textContent, "1");
  assert.equal(document.querySelector("#pendingCount").textContent, "268");

  const saved = localStorage.getItem("dexcowin-mes-regression-review-v1");
  const reloaded = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://review.local/",
    beforeParse(window) { window.localStorage.setItem("dexcowin-mes-regression-review-v1", saved); },
  });
  assert.equal(reloaded.window.document.querySelector("#approvedCount").textContent, "1");
  assert.equal(reloaded.window.document.querySelector("#revisionCount").textContent, "1");

  const verdictFilter = reloaded.window.document.querySelector("#verdict");
  verdictFilter.value = "approved";
  verdictFilter.dispatchEvent(new reloaded.window.Event("change", { bubbles: true }));
  assert.equal(reloaded.window.document.querySelectorAll(".review-item").length, 1);
  assert.equal(reloaded.window.document.querySelector(".review-item").id, "item-8.1-01");

  dom.window.close();
  reloaded.window.close();
});
