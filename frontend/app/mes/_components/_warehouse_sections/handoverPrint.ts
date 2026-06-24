import type { Handover } from "@/lib/api/types";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

/**
 * 인수인계서 인쇄 — 실물 양식(DEXCOWIN 양식지) 기반 A4 문서.
 *
 * 설계 기준:
 *   - @page margin 13mm × 4 → 내용 영역 184mm × 271mm
 *   - 헤더 40mm / 공정내용 13mm / 제품명+날짜 14mm / 작성자+인수자 14mm /
 *     품목 26mm / 분석내용 104mm / 비고 60mm = 271mm
 *   - 섹션 라벨은 셀 상단 좌측 소형 볼드, 내용은 그 아래
 *   - 분석내용만 20pt 볼드 (실물 양식 동일)
 */
export async function printHandover(doc: Handover): Promise<void> {
  const w = window.open("", "_blank", "width=860,height=1150");
  if (!w) return;

  // 이미지를 base64로 변환해 팝업 창에서도 안정적으로 표시
  let logoSrc = "";
  try {
    const resp = await fetch("/dexcowin-logo.png");
    if (resp.ok) {
      const blob = await resp.blob();
      logoSrc = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // 로고 없이 진행
  }

  const docDate = fmtDate(doc.doc_date || doc.created_at);
  const receivedDate = fmtDateTime(doc.received_at);

  const lineRows = doc.lines
    .map(
      (l) =>
        `<tr>
          <td class="tc">${esc(l.mes_code_snapshot ?? "-")}</td>
          <td>${esc(l.item_name_snapshot)}</td>
          <td class="tc">${l.quantity}</td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"/>
<title>${esc(doc.title)}</title>
<style>
/* ─── 인쇄 기준 ─── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: A4 portrait; margin: 13mm; }

body {
  font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
  font-size: 11pt;
  color: #000;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ─── 외곽 테이블 ─── */
table.form {
  width: 100%;
  border-collapse: collapse;
  border: 2px solid #000;
}
table.form td {
  border: 1px solid #000;
  vertical-align: top;
  padding: 0;
}

/* ─── 헤더 행 (40mm) ─── */
.h-header { height: 40mm; }

.logo-cell {
  width: 108px;
  border-right: 1.5px solid #000 !important;
  text-align: center;
  vertical-align: middle;
  padding: 8pt;
}
.logo-cell img {
  max-width: 88px;
  max-height: 38px;
  object-fit: contain;
}
.title-cell {
  vertical-align: middle;
  text-align: center;
  padding: 6pt 12pt;
}
.title-num {
  font-size: 8pt;
  color: #666;
  margin-bottom: 5pt;
}
.title-text {
  font-size: 17pt;
  font-weight: 900;
  letter-spacing: -0.3pt;
}

/* 결재 블록 */
.sign-outer {
  width: 168px;
  padding: 0 !important;
  border-left: 1.5px solid #000 !important;
  vertical-align: top;
}
table.sign {
  width: 100%;
  height: 100%;
  border-collapse: collapse;
}
table.sign td {
  border: 1px solid #000;
  text-align: center;
  padding: 2pt 3pt;
  vertical-align: middle;
}
.sign-key {
  background: #f0f0f0;
  font-weight: bold;
  font-size: 8.5pt;
}
.sign-name { height: 24pt; font-size: 10pt; }
.sign-date { height: 14pt; font-size: 8pt; color: #444; }

/* ─── 일반 섹션 공통 ─── */
/* 섹션 라벨: 상단 좌측 소형 볼드 */
.lbl {
  font-size: 9pt;
  font-weight: bold;
  padding: 4pt 7pt 0;
  line-height: 1.2;
}
.lbl-n { color: #888; margin-right: 1px; }

/* 내용 텍스트 */
.val {
  font-size: 11pt;
  padding: 3pt 9pt 6pt;
  line-height: 1.5;
}

/* 분리 행(3+4, 5+6) 반반 */
.split { padding: 0 !important; }
table.half {
  width: 100%;
  border-collapse: collapse;
}
table.half td {
  border: none;
  width: 50%;
  vertical-align: top;
  padding: 0;
}
table.half td + td { border-left: 1px solid #000; }

/* 행 높이 */
.h-sm   { height: 13mm; }   /* 공정내용 */
.h-md   { height: 14mm; }   /* 3+4 / 5+6 */
.h-item { height: 26mm; }   /* 인수인계 품목 */
.h-ana  { height: 104mm; }  /* 분석내용 */
.h-note { height: 60mm; }   /* 비고 */

/* 인수인계 품목 내부 테이블 */
table.items {
  width: 100%;
  border-collapse: collapse;
}
table.items th {
  background: #f5f5f5;
  font-size: 9pt;
  font-weight: bold;
  text-align: center;
  padding: 3pt 5pt;
  border-bottom: 1px solid #bbb;
  border-right: 1px solid #bbb;
}
table.items th:last-child { border-right: none; }
table.items td {
  font-size: 10pt;
  padding: 3pt 6pt;
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #eee;
  vertical-align: middle;
}
table.items td:last-child { border-right: none; }
table.items tr:last-child td { border-bottom: none; }
.tc { text-align: center; }

/* 분석내용 — 실물 양식과 동일하게 큰 볼드 폰트 */
.analysis {
  font-size: 20pt;
  font-weight: bold;
  line-height: 1.9;
  white-space: pre-wrap;
  padding: 6pt 9pt;
}
.notice {
  font-size: 9.5pt;
  color: #222;
  padding: 5pt 9pt;
  border-top: 1px solid #ccc;
  margin-top: 4pt;
}

/* 비고 */
.notes {
  font-size: 10pt;
  line-height: 1.7;
  white-space: pre-wrap;
  padding: 4pt 9pt 6pt;
}
</style>
</head>
<body>

<table class="form">

  <!-- ① 헤더: 로고 | 1.TITLE + 제목 | 결재 -->
  <tr class="h-header">
    <td class="logo-cell">
      ${logoSrc ? `<img src="${logoSrc}" alt="" />` : ""}
    </td>
    <td class="title-cell">
      <div class="title-num">1. TITLE</div>
      <div class="title-text">${esc(doc.title)}</div>
    </td>
    <td class="sign-outer">
      <table class="sign">
        <tr>
          <td class="sign-key" rowspan="3" style="width:22px">결재</td>
          <td class="sign-key">작성</td>
          <td class="sign-key">인수</td>
          <td class="sign-key">승인</td>
        </tr>
        <tr>
          <td class="sign-name">${esc(doc.author_name)}</td>
          <td class="sign-name">${esc(doc.received_by_name)}</td>
          <td class="sign-name"></td>
        </tr>
        <tr>
          <td class="sign-date">${fmtDate(doc.created_at)}</td>
          <td class="sign-date">${receivedDate}</td>
          <td class="sign-date"></td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ② 공정 내용 -->
  <tr class="h-sm">
    <td colspan="3">
      <div class="lbl"><span class="lbl-n">2.</span>공정 내용</div>
      <div class="val">${esc(doc.process_content)}</div>
    </td>
  </tr>

  <!-- ③ 제품명 및 적용 범위 / ④ 작성 날짜 -->
  <tr class="h-md">
    <td colspan="3" class="split">
      <table class="half">
        <tr>
          <td>
            <div class="lbl"><span class="lbl-n">3.</span>제품명 및 적용 범위</div>
            <div class="val">${esc(doc.product_name)}</div>
          </td>
          <td>
            <div class="lbl"><span class="lbl-n">4.</span>작성 날짜</div>
            <div class="val">${docDate}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ⑤ 작성자 / ⑥ 인수자 -->
  <tr class="h-md">
    <td colspan="3" class="split">
      <table class="half">
        <tr>
          <td>
            <div class="lbl"><span class="lbl-n">5.</span>작성자</div>
            <div class="val">${esc(doc.author_name)}</div>
          </td>
          <td>
            <div class="lbl"><span class="lbl-n">6.</span>${esc(doc.to_department)}인수자</div>
            <div class="val">${esc(doc.received_by_name)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- 인수인계 품목 (MES 재고 이동 대상) -->
  <tr class="h-item">
    <td colspan="3">
      <div class="lbl">인수인계 품목</div>
      <table class="items" style="margin-top:2pt">
        <tr>
          <th style="width:130px">품목코드</th>
          <th>품목명</th>
          <th style="width:60px">수량</th>
        </tr>
        ${lineRows || `<tr><td class="tc" colspan="3" style="color:#aaa;font-size:9pt">-</td></tr>`}
      </table>
    </td>
  </tr>

  <!-- ⑦ 분석 내용 -->
  <tr class="h-ana">
    <td colspan="3">
      <div class="lbl"><span class="lbl-n">7.</span>분석 내용</div>
      <div class="analysis">${esc(doc.analysis_text)}</div>
      <div class="notice">1. 튜브는 적합 판정 후 인계되었으며, 인지하고 이에 동의합니다.</div>
    </td>
  </tr>

  <!-- ⑧ 비고 -->
  <tr class="h-note">
    <td colspan="3">
      <div class="lbl"><span class="lbl-n">8.</span>비고</div>
      <div class="notes">${esc(doc.notes)}</div>
    </td>
  </tr>

</table>

<script>window.onload = function(){ window.print(); };</script>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
