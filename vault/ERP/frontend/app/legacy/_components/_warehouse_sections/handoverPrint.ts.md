---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/handoverPrint.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# handoverPrint.ts — 인수인계서를 새 창에 양식대로 띄워 인쇄

## 이 파일은 무엇을 책임지나

인수인계서 한 건을 받아 새 브라우저 창을 열고, 회사 양식(결재란·본문 표·품목 표·분석 내용·비고)으로 HTML을 그려 자동으로 인쇄 대화상자를 띄웁니다. 외부 인쇄 라이브러리 없이 `window.open` + `window.print` 만 씁니다.

## 업무 흐름에서의 의미

화면으로 본 인수인계서를 종이로 출력하거나 PDF로 저장할 때 쓰는 기능입니다. 인수인계 목록의 인쇄 버튼이 이 함수를 부릅니다. 출력물에는 결재란(작성·인수·승인), 공정 내용, 제품명, 작성·인수자, 인수인계 품목 표, 분석 내용, 비고가 양식대로 들어가, 현장에서 바로 결재·보관용 문서로 쓸 수 있습니다.

## 언제 보면 좋나

- 인쇄 양식(표 구성·문구·서식)을 바꿀 때
- 인쇄가 안 될 때(팝업 차단 등)
- 출력에 들어가는 항목을 추가/제거할 때

## 중요한 내용

- `printHandover(doc)` — 새 창을 열고(`window.open`) 양식 HTML을 써넣은 뒤, 로드되면 `window.print()` 자동 실행.
- `esc()` — 제목·내용 등 텍스트의 `& < >` 를 이스케이프해 HTML 깨짐을 막습니다.
- `fmtDate()` — 날짜를 `YYYY-MM-DD` 로 표기. 작성 날짜는 `doc.doc_date` 우선, 없으면 `created_at`.
- 품목 표는 `doc.lines` 를 품목명·코드·수량 행으로 그립니다.
- 결재란 첫 칸에 "DEXCOWIN" 브랜드 표기.
- 분석 내용·비고는 `white-space: pre-wrap` 으로 줄바꿈을 살려 출력.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — 인쇄 버튼(`onPrint`)이 이 함수를 부릅니다.

## 조심할 점

- 팝업 창이 차단되면 `window.open` 이 `null` 을 반환해 조용히 끝납니다(아무 일도 안 일어남). 인쇄가 안 되면 브라우저 팝업 차단부터 의심하세요.
- 출력 양식은 코드 안 HTML 문자열로 박혀 있습니다. 양식을 고치려면 이 파일의 템플릿 문자열을 직접 수정해야 합니다.

## 핵심 발췌

```ts
export function printHandover(doc: Handover): void {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  // ... 양식 HTML 작성 ...
  // <script>window.onload = function(){ window.print(); };</script>
}
```
