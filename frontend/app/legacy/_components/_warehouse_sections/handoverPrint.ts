import type { Handover } from "@/lib/api/types";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 인수인계서를 별도 창에 양식대로 렌더 후 인쇄. (window.print — 외부 라이브러리 없음) */
export function printHandover(doc: Handover): void {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;

  const lineRows = doc.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.item_name_snapshot)}</td><td>${esc(l.mes_code_snapshot)}</td><td style="text-align:right">${l.quantity}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>${esc(doc.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
  .brand { font-weight: 900; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td, th { border: 1px solid #333; padding: 6px 8px; font-size: 13px; vertical-align: top; }
  .label { background: #f2f2f2; font-weight: 700; width: 130px; white-space: nowrap; }
  .sign td { height: 48px; text-align: center; }
  .section-title { font-weight: 700; margin-top: 14px; font-size: 13px; }
  .free { white-space: pre-wrap; min-height: 60px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <table class="sign">
    <tr>
      <td class="label">결재</td><td class="label">작성</td><td class="label">인수</td><td class="label">승인</td>
    </tr>
    <tr>
      <td class="brand">DEXCOWIN</td>
      <td>${esc(doc.author_name)}</td>
      <td>${esc(doc.received_by_name)}</td>
      <td></td>
    </tr>
  </table>

  <h1 style="margin-top:12px">${esc(doc.title)}</h1>

  <table>
    <tr><td class="label">공정 내용</td><td colspan="3">${esc(doc.process_content)}</td></tr>
    <tr><td class="label">제품명 / 적용 범위</td><td>${esc(doc.product_name)}</td>
        <td class="label">작성 날짜</td><td>${fmtDate(doc.doc_date || doc.created_at)}</td></tr>
    <tr><td class="label">작성자 (${esc(doc.from_department)})</td><td>${esc(doc.author_name)}</td>
        <td class="label">인수자 (${esc(doc.to_department)})</td><td>${esc(doc.received_by_name)}</td></tr>
  </table>

  <div class="section-title">인수인계 품목</div>
  <table>
    <tr><th>품목명</th><th>코드</th><th style="width:80px">수량</th></tr>
    ${lineRows || '<tr><td colspan="3"></td></tr>'}
  </table>

  <div class="section-title">분석 내용</div>
  <div class="free" style="border:1px solid #333;padding:8px">${esc(doc.analysis_text)}</div>

  <div class="section-title">비고</div>
  <div class="free" style="border:1px solid #333;padding:8px">${esc(doc.notes)}</div>

  <script>window.onload = function(){ window.print(); };</script>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
