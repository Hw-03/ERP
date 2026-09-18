import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_SYSTEM_VERDICTS = new Set(["PASS", "DIFFERENCE", "BLOCKED"]);
const EMPLOYEE_SERVER_PATTERN = /(?:192\.168\.0\.63:|localhost:)(?:3000|8010)\b/i;
const CREDENTIAL_PATTERN = /(?:비밀번호|password|pin)[^\r\n]{0,24}\b\d{4,}\b/i;

function requiredText(value, field, id = "원장") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${id}: ${field} 문구가 없습니다.`);
  }
  return value.trim();
}

function assertSafeReviewText(value, id, field) {
  if (EMPLOYEE_SERVER_PATTERN.test(value)) {
    throw new Error(`${id}: ${field}에 직원 서버 주소가 포함되어 있습니다.`);
  }
  if (CREDENTIAL_PATTERN.test(value)) {
    throw new Error(`${id}: ${field}에 자격 증명 숫자가 포함되어 있습니다.`);
  }
}

/** 원장의 검토 필드만 남기고 독립형 HTML용 모델을 만든다. */
export function buildReviewModel(audit) {
  if (!audit || typeof audit !== "object") {
    throw new Error("원장 JSON 객체가 필요합니다.");
  }

  const auditRunId = requiredText(audit.run?.runId, "run.runId");
  if (!Array.isArray(audit.cases) || audit.cases.length === 0) {
    throw new Error("원장 cases가 비어 있습니다.");
  }

  const seenIds = new Set();
  const items = audit.cases.map((entry, index) => {
    const id = requiredText(entry?.id, `cases[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`중복 ID가 있습니다: ${id}`);
    }
    seenIds.add(id);

    const category = requiredText(entry.category, "category", id);
    const action = requiredText(entry.action, "action", id);
    const expected = requiredText(entry.staffExpected, "staffExpected", id);
    const actual = requiredText(entry.staffActual, "staffActual", id);
    const verdict = requiredText(entry.verdict, "verdict", id).toUpperCase();
    const note = typeof entry.note === "string" ? entry.note.trim() : "";

    if (!ALLOWED_SYSTEM_VERDICTS.has(verdict)) {
      throw new Error(`${id}: 알 수 없는 시스템 판정입니다: ${verdict}`);
    }
    for (const [field, value] of Object.entries({ category, action, expected, actual, note })) {
      assertSafeReviewText(value, id, field);
    }

    return { id, category, action, expected, actual, verdict, note };
  });

  return { auditRunId, items };
}

/** 내보낸 검토 결과를 검증하고 저장 가능한 판정 객체만 반환한다. */
export function normalizeReviewExport(payload, expectedRunId, validIds) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("검토 결과 JSON 객체가 아닙니다.");
  }
  if (payload.schemaVersion !== 2) {
    throw new Error("지원하지 않는 schemaVersion입니다.");
  }
  if (payload.auditRunId !== expectedRunId) {
    throw new Error(`실행 ID가 다릅니다. 현재: ${expectedRunId}, 파일: ${payload.auditRunId ?? "없음"}`);
  }
  if (!payload.reviews || typeof payload.reviews !== "object" || Array.isArray(payload.reviews)) {
    throw new Error("reviews 객체가 없습니다.");
  }

  const allowedIds = new Set(validIds);
  const allowedVerdicts = new Set(["approved", "revision", "hold"]);
  const normalized = {};
  for (const [id, review] of Object.entries(payload.reviews)) {
    if (!allowedIds.has(id)) {
      throw new Error(`현재 원장에 없는 항목 ID입니다: ${id}`);
    }
    if (!review || typeof review !== "object" || !allowedVerdicts.has(review.verdict)) {
      throw new Error(`${id}: 올바르지 않은 판정 값입니다.`);
    }
    normalized[id] = {
      verdict: review.verdict,
      note: typeof review.note === "string" ? review.note : "",
      updatedAt: typeof review.updatedAt === "string" ? review.updatedAt : new Date().toISOString(),
    };
  }
  return normalized;
}

function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("/", "\\/")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** 브라우저에서 파일로 직접 열 수 있는 단일 HTML을 렌더링한다. */
export function renderReviewHtml(model) {
  const data = scriptSafeJson(model);
  const importValidator = normalizeReviewExport.toString();

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>DEXCOWIN MES 기대·실제 동작 검토</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef4f8;
      --surface: #ffffff;
      --surface-muted: #f7fafc;
      --text: #162536;
      --muted: #647487;
      --line: #d9e3ec;
      --blue: #1769e0;
      --blue-soft: #eaf2ff;
      --green: #127a53;
      --green-soft: #e7f7f0;
      --amber: #9a5b00;
      --amber-soft: #fff4d9;
      --red: #b42318;
      --red-soft: #feebe9;
      --shadow: 0 14px 40px rgba(42, 73, 102, .10);
      --radius: 20px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --bg: #101820;
        --surface: #17222d;
        --surface-muted: #1d2a36;
        --text: #edf4fa;
        --muted: #aab9c7;
        --line: #324352;
        --blue: #75a9ff;
        --blue-soft: #213b60;
        --green: #68d3a6;
        --green-soft: #173e32;
        --amber: #ffca67;
        --amber-soft: #463719;
        --red: #ff9187;
        --red-soft: #4e2727;
        --shadow: 0 16px 44px rgba(0, 0, 0, .28);
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-width: 320px;
      background: var(--bg);
      color: var(--text);
      font-family: Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.65;
    }
    button, input, select, textarea { font: inherit; }
    button, select, input[type="search"] { min-height: 44px; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--blue) 35%, transparent);
      outline-offset: 2px;
    }
    .page { width: min(1440px, calc(100% - 40px)); margin: 0 auto; padding: 32px 0 64px; }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 28px;
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .eyebrow { margin: 0 0 4px; color: var(--blue); font-weight: 800; letter-spacing: .04em; }
    h1 { margin: 0; font-size: clamp(26px, 3vw, 40px); line-height: 1.2; letter-spacing: -.035em; }
    .subtitle { margin: 8px 0 0; color: var(--muted); }
    .run { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .toolbar {
      position: sticky;
      top: 12px;
      z-index: 5;
      display: grid;
      gap: 12px;
      padding: 16px;
      margin-bottom: 18px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: color-mix(in srgb, var(--surface) 94%, transparent);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }
    .toolbar-main, .toolbar-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .search { flex: 1 1 280px; }
    input[type="search"], select, textarea {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
    }
    input[type="search"], select { padding: 9px 13px; }
    select { min-width: 160px; }
    .scope {
      display: inline-flex;
      min-height: 44px;
      padding: 4px;
      gap: 4px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--surface-muted);
    }
    .scope button, .button, .verdict-button {
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      cursor: pointer;
      font-weight: 750;
    }
    .scope button { min-height: 36px; padding: 6px 13px; }
    .scope button[aria-pressed="true"] { background: var(--blue); color: white; box-shadow: 0 4px 12px rgba(23, 105, 224, .25); }
    .check { display: inline-flex; min-height: 44px; align-items: center; gap: 8px; padding: 0 5px; font-weight: 700; }
    .check input { width: 18px; height: 18px; accent-color: var(--blue); }
    .button { min-height: 44px; padding: 8px 14px; border-color: var(--line); background: var(--surface); }
    .button.primary { border-color: var(--blue); background: var(--blue); color: white; }
    .button:hover, .verdict-button:hover { border-color: var(--blue); }
    .status-row { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 13px; }
    .status-message[data-kind="error"] { color: var(--red); font-weight: 750; }
    .status-message[data-kind="success"] { color: var(--green); font-weight: 750; }
    .cards { display: grid; gap: 18px; }
    .card {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .card-head { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; padding: 20px 22px 15px; border-bottom: 1px solid var(--line); }
    .identity { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .id { color: var(--blue); font-weight: 850; letter-spacing: .02em; }
    .category { padding: 3px 9px; border-radius: 999px; background: var(--blue-soft); color: var(--blue); font-size: 12px; font-weight: 800; }
    .action { margin: 6px 0 0; font-size: 20px; line-height: 1.35; letter-spacing: -.02em; }
    .system-verdict { padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 850; white-space: nowrap; }
    .system-verdict.difference { color: var(--amber); background: var(--amber-soft); }
    .system-verdict.pass { color: var(--green); background: var(--green-soft); }
    .system-verdict.blocked { color: var(--red); background: var(--red-soft); }
    .comparison { display: grid; grid-template-columns: 1fr 1fr; }
    .pane { min-width: 0; padding: 22px; }
    .pane + .pane { border-left: 1px solid var(--line); }
    .pane-label { margin: 0 0 10px; color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: .06em; }
    .pane-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .difference-note { margin: 0 22px 20px; padding: 13px 15px; border-radius: 12px; background: var(--amber-soft); color: var(--amber); }
    .difference-note strong { display: block; margin-bottom: 2px; font-size: 12px; }
    .review { padding: 18px 22px 22px; border-top: 1px solid var(--line); background: var(--surface-muted); }
    .review-label { margin: 0 0 10px; font-weight: 800; }
    .verdicts { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)); gap: 9px; }
    .verdict-button { min-height: 46px; padding: 9px 12px; border-color: var(--line); background: var(--surface); }
    .verdict-button[data-selected="true"][data-verdict="approved"] { border-color: var(--green); background: var(--green-soft); color: var(--green); }
    .verdict-button[data-selected="true"][data-verdict="revision"] { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
    .verdict-button[data-selected="true"][data-verdict="hold"] { border-color: var(--amber); background: var(--amber-soft); color: var(--amber); }
    .note-wrap { margin-top: 12px; }
    .note-wrap[hidden] { display: none; }
    textarea { width: 100%; min-height: 96px; resize: vertical; padding: 11px 13px; }
    .note-help { margin: 5px 2px 0; color: var(--muted); font-size: 12px; }
    .note-help.error { color: var(--red); font-weight: 700; }
    .empty { padding: 64px 20px; border: 1px dashed var(--line); border-radius: var(--radius); text-align: center; color: var(--muted); background: var(--surface); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
    @media (max-width: 780px) {
      .page { width: min(100% - 24px, 1440px); padding-top: 22px; }
      .hero { display: block; }
      .run { margin-top: 12px; white-space: normal; }
      .toolbar { top: 6px; padding: 12px; }
      .toolbar-main > * { width: 100%; }
      .scope { display: grid; grid-template-columns: repeat(3, 1fr); }
      .toolbar-actions .button { flex: 1 1 135px; }
      .status-row { display: block; }
      .card-head { padding: 17px; }
      .comparison { grid-template-columns: 1fr; }
      .pane { padding: 18px; }
      .pane + .pane { border-left: 0; border-top: 1px solid var(--line); }
      .difference-note { margin: 0 17px 17px; }
      .review { padding: 17px; }
      .verdicts { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body data-default-scope="difference">
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">DEXCOWIN MES</p>
        <h1>기대·실제 동작 검토</h1>
        <p class="subtitle">직원 관점의 기대값과 실측 결과만 비교해 판정하세요.</p>
      </div>
      <div class="run" id="runLabel"></div>
    </header>

    <section class="toolbar" aria-label="검토 필터와 결과 관리">
      <div class="toolbar-main">
        <label class="search">
          <span class="sr-only">검색</span>
          <input id="search" type="search" placeholder="ID, 확인 항목, 기대·실제 검색" autocomplete="off">
        </label>
        <label>
          <span class="sr-only">업무 분류</span>
          <select id="category"><option value="">모든 업무 분류</option></select>
        </label>
        <div class="scope" aria-label="시스템 판정 범위">
          <button id="scope-difference" type="button" data-scope="difference" aria-pressed="true">검토 필요</button>
          <button type="button" data-scope="pass" aria-pressed="false">일치</button>
          <button type="button" data-scope="all" aria-pressed="false">전체</button>
        </div>
        <label class="check"><input id="unreviewedOnly" type="checkbox" checked> 미검토만</label>
      </div>
      <div class="toolbar-actions">
        <button class="button primary" id="nextUnreviewed" type="button">다음 미검토</button>
        <button class="button" id="exportButton" type="button">결과 저장</button>
        <button class="button" id="importButton" type="button">결과 불러오기</button>
        <input class="sr-only" id="importFile" type="file" accept="application/json,.json">
      </div>
      <div class="status-row">
        <span id="summary" aria-live="polite"></span>
        <span class="status-message" id="statusMessage" aria-live="polite"></span>
      </div>
    </section>

    <section class="cards" id="cards" aria-label="검토 항목"></section>
  </main>

  <script id="review-data" type="application/json">${data}</script>
  <script>
    "use strict";
    const MODEL = JSON.parse(document.getElementById("review-data").textContent);
    const VALID_IDS = MODEL.items.map(function (item) { return item.id; });
    const STORAGE_KEY = "dexcowin-mes-pc-review-v2:" + MODEL.auditRunId;
    const normalizeReviewExport = ${importValidator};
    const state = { search: "", category: "", scope: "difference", unreviewedOnly: true };
    let reviews = {};

    const cards = document.getElementById("cards");
    const search = document.getElementById("search");
    const category = document.getElementById("category");
    const unreviewedOnly = document.getElementById("unreviewedOnly");
    const summary = document.getElementById("summary");
    const statusMessage = document.getElementById("statusMessage");

    function reviewPayload() {
      return { schemaVersion: 2, auditRunId: MODEL.auditRunId, exportedAt: new Date().toISOString(), reviews: reviews };
    }

    function setStatus(message, kind) {
      statusMessage.textContent = message || "";
      statusMessage.dataset.kind = kind || "";
    }

    function saveReviews() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewPayload()));
        setStatus("자동 저장됨", "success");
      } catch (error) {
        setStatus("자동 저장 실패: " + error.message, "error");
      }
    }

    function loadReviews() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      try {
        reviews = normalizeReviewExport(JSON.parse(raw), MODEL.auditRunId, VALID_IDS);
      } catch (error) {
        reviews = {};
        setStatus("저장된 검토 결과를 읽지 못했습니다: " + error.message, "error");
      }
    }

    function isReviewed(id) {
      const review = reviews[id];
      if (!review) return false;
      return review.verdict !== "revision" || review.note.trim().length > 0;
    }

    function filteredItems() {
      const needle = state.search.trim().toLocaleLowerCase("ko-KR");
      return MODEL.items.filter(function (item) {
        if (state.category && item.category !== state.category) return false;
        if (state.scope === "difference" && item.verdict !== "DIFFERENCE") return false;
        if (state.scope === "pass" && item.verdict !== "PASS") return false;
        if (state.unreviewedOnly && isReviewed(item.id)) return false;
        if (!needle) return true;
        return [item.id, item.category, item.action, item.expected, item.actual, item.note]
          .join(" ").toLocaleLowerCase("ko-KR").includes(needle);
      });
    }

    function make(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function updateSummary(visibleCount) {
      const reviewedCount = MODEL.items.filter(function (item) { return isReviewed(item.id); }).length;
      summary.textContent = "표시 " + visibleCount + "개 / 전체 " + MODEL.items.length + "개 · 검토 완료 " + reviewedCount + "개";
    }

    function syncReviewUi(card, id) {
      const review = reviews[id];
      card.querySelectorAll("[data-verdict]").forEach(function (button) {
        button.dataset.selected = String(Boolean(review && review.verdict === button.dataset.verdict));
        button.setAttribute("aria-pressed", button.dataset.selected);
      });
      const noteWrap = card.querySelector(".note-wrap");
      const textarea = card.querySelector("textarea");
      const showNote = Boolean(review && (review.verdict === "revision" || review.verdict === "hold"));
      noteWrap.hidden = !showNote;
      textarea.required = Boolean(review && review.verdict === "revision");
      const help = card.querySelector(".note-help");
      help.textContent = textarea.required && textarea.value.trim() === ""
        ? "기대값 수정 내용을 입력해야 검토 완료로 집계됩니다."
        : "의견은 이 실행의 검토 결과에만 저장됩니다.";
      help.classList.toggle("error", textarea.required && textarea.value.trim() === "");
    }

    function buildCard(item) {
      const card = make("article", "card");
      card.id = "item-" + item.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      card.dataset.itemId = item.id;

      const head = make("header", "card-head");
      const titleBox = make("div");
      const identity = make("div", "identity");
      identity.append(make("span", "id", item.id), make("span", "category", item.category));
      titleBox.append(identity, make("h2", "action", item.action));
      const systemVerdict = make("span", "system-verdict " + item.verdict.toLowerCase(), item.verdict);
      head.append(titleBox, systemVerdict);

      const comparison = make("div", "comparison");
      [["기대 동작", item.expected], ["실제 동작", item.actual]].forEach(function (content) {
        const pane = make("section", "pane");
        pane.append(make("h3", "pane-label", content[0]), make("p", "pane-text", content[1]));
        comparison.append(pane);
      });

      card.append(head, comparison);
      if (item.verdict === "DIFFERENCE" && item.note) {
        const differenceNote = make("p", "difference-note");
        differenceNote.append(make("strong", "", "차이 요약"), document.createTextNode(item.note));
        card.append(differenceNote);
      }

      const reviewSection = make("section", "review");
      reviewSection.append(make("p", "review-label", "내 검토 판정"));
      const verdicts = make("div", "verdicts");
      [["approved", "기대값 맞음"], ["revision", "기대값 수정"], ["hold", "보류"]].forEach(function (choice) {
        const button = make("button", "verdict-button", choice[1]);
        button.type = "button";
        button.dataset.verdict = choice[0];
        button.dataset.selected = "false";
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", function () {
          const previousNote = reviews[item.id] ? reviews[item.id].note : "";
          reviews[item.id] = { verdict: choice[0], note: previousNote, updatedAt: new Date().toISOString() };
          saveReviews();
          syncReviewUi(card, item.id);
          updateSummary(filteredItems().length);
          if (choice[0] === "revision" || choice[0] === "hold") textarea.focus();
        });
        verdicts.append(button);
      });

      const noteWrap = make("div", "note-wrap");
      noteWrap.hidden = true;
      const noteLabel = make("label", "sr-only", "검토 의견");
      const textarea = make("textarea");
      textarea.placeholder = "수정할 기대값 또는 보류 사유를 적어 주세요.";
      textarea.value = reviews[item.id] ? reviews[item.id].note : "";
      noteLabel.htmlFor = "note-" + card.id;
      textarea.id = "note-" + card.id;
      textarea.addEventListener("input", function () {
        if (!reviews[item.id]) return;
        reviews[item.id].note = textarea.value;
        reviews[item.id].updatedAt = new Date().toISOString();
        saveReviews();
        syncReviewUi(card, item.id);
        updateSummary(filteredItems().length);
      });
      noteWrap.append(noteLabel, textarea, make("p", "note-help", "의견은 이 실행의 검토 결과에만 저장됩니다."));
      reviewSection.append(verdicts, noteWrap);
      card.append(reviewSection);
      syncReviewUi(card, item.id);
      return card;
    }

    function render() {
      const items = filteredItems();
      cards.replaceChildren();
      if (items.length === 0) {
        cards.append(make("div", "empty", "현재 조건에 맞는 검토 항목이 없습니다."));
      } else {
        const fragment = document.createDocumentFragment();
        items.forEach(function (item) { fragment.append(buildCard(item)); });
        cards.append(fragment);
      }
      updateSummary(items.length);
    }

    function initializeCategories() {
      Array.from(new Set(MODEL.items.map(function (item) { return item.category; })))
        .sort(function (a, b) { return a.localeCompare(b, "ko"); })
        .forEach(function (value) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          category.append(option);
        });
    }

    search.addEventListener("input", function () { state.search = search.value; render(); });
    category.addEventListener("change", function () { state.category = category.value; render(); });
    unreviewedOnly.addEventListener("change", function () { state.unreviewedOnly = unreviewedOnly.checked; render(); });
    document.querySelectorAll("[data-scope]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.scope = button.dataset.scope;
        document.querySelectorAll("[data-scope]").forEach(function (candidate) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        });
        render();
      });
    });
    document.getElementById("nextUnreviewed").addEventListener("click", function () {
      const next = filteredItems().find(function (item) { return !isReviewed(item.id); });
      if (!next) {
        setStatus("현재 조건에 미검토 항목이 없습니다.", "success");
        return;
      }
      const target = document.getElementById("item-" + next.id.replace(/[^a-zA-Z0-9_-]/g, "-"));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.querySelector(".verdict-button").focus({ preventScroll: true });
      }
    });
    document.getElementById("exportButton").addEventListener("click", function () {
      const blob = new Blob([JSON.stringify(reviewPayload(), null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = MODEL.auditRunId + "-expected-actual-reviews.json";
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus("검토 결과 JSON을 저장했습니다.", "success");
    });
    document.getElementById("importButton").addEventListener("click", function () { document.getElementById("importFile").click(); });
    document.getElementById("importFile").addEventListener("change", async function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        reviews = normalizeReviewExport(JSON.parse(await file.text()), MODEL.auditRunId, VALID_IDS);
        saveReviews();
        render();
        setStatus("검토 결과를 불러왔습니다.", "success");
      } catch (error) {
        setStatus("불러오기 실패: " + error.message, "error");
      } finally {
        event.target.value = "";
      }
    });

    document.getElementById("runLabel").textContent = "실행 ID · " + MODEL.auditRunId;
    initializeCategories();
    loadReviews();
    render();
  </script>
</body>
</html>\n`;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input" || argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} 경로가 필요합니다.`);
      }
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자입니다: ${argument}`);
    }
  }
  if (!options.input || !options.output) {
    throw new Error("사용법: node generate-mes-pc-review.mjs --input <browser-audit.json> --output <review.html>");
  }
  return options;
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const audit = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const model = buildReviewModel(audit);
  const html = renderReviewHtml(model);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  process.stdout.write(`검토 HTML 생성 완료: ${outputPath} (${model.items.length}개)\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`생성 실패: ${error.message}\n`);
    process.exitCode = 1;
  }
}
