---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/HandoverComposeForm.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# HandoverComposeForm.tsx — 튜브 인수인계서 작성 폼

## 이 파일은 무엇을 책임지나

튜브 부서가 고압/진공 부서로 넘기는 "인수인계서"를 작성하는 입력 폼입니다. 제목·인수 부서·제품명·공정 내용·분석 내용·비고를 적고, 실제 재고를 옮길 품목과 수량을 골라 제출합니다. 제출하면 `api.createHandover` 로 서버에 인수인계서를 만듭니다.

## 업무 흐름에서의 의미

튜브에서 만든 물건을 다음 공정(고압·진공)으로 넘길 때, 종이 인수인계서 대신 이 폼으로 작성합니다. 여기서 고른 품목·수량은 단순 메모가 아니라 **실제 재고 이동 대상**입니다. 받는 부서가 "인수 확인"을 누르면 그 수량만큼 튜브 → 받는 부서로 재고가 자동으로 넘어갑니다. 그래서 품목·수량을 정확히 골라야 합니다.

분석 내용(시리얼 목록 등)과 비고는 문서·인쇄용 텍스트로, 재고 이동과는 무관합니다.

## 언제 보면 좋나

- 인수인계서 작성 항목(필드)을 바꾸거나 추가할 때
- 품목 선택지가 이상할 때 (TF 품목만 노출하는 필터)
- 제출 가능 조건(작성자·제목·품목)이 안 맞을 때

## 중요한 내용

- `RECEIVE_DEPARTMENTS = ["고압", "진공"]` — 인수 부서 선택지(받는 쪽).
- `available` — 선택지 품목 필터. 코드(`mes_code`)에 "TF"가 들어간 품목만, 그리고 이미 추가한 것은 빼고 보여 줍니다(튜브 TF 품목 대상).
- `lines` — 추가한 인수인계 품목과 수량. `setQty` 는 최소 1, 정수만 허용.
- `canSubmit` — 작성자 있음 + 제목 있음 + 품목 1건 이상 + 진행 중 아님일 때만 제출 가능.
- `submit()` — `api.createHandover` 호출. `lines` 는 `{ item_id, quantity }` 만 보내고, 분석/비고 등 빈 값은 `null` 로 정리. 성공하면 토스트 + 폼 일부 초기화 후 `onCreated()`.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_sections/HandoverSectionPanel.tsx]] — 이 폼을 "작성" 탭에 띄우고 제출 후 목록을 새로고침하는 부모.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/handoverPrint.ts]] — 제출한 인수인계서를 양식대로 인쇄.

## 조심할 점

- 여기서 고른 품목·수량은 **실제 재고가 이동하는 대상**입니다(받는 부서의 인수 확인 시점에 이동). 표시용 텍스트(분석·비고)와 헷갈리지 마세요.
- 품목 선택지는 코드에 "TF"가 포함된 것만 노출됩니다. 원하는 품목이 안 보이면 품목 코드(`mes_code`)부터 확인하세요.

## 핵심 발췌

```tsx
const available = useMemo(
  () =>
    items.filter(
      (it) =>
        (it.mes_code ?? "").toUpperCase().includes("TF") &&
        !lines.some((l) => l.item_id === it.item_id),
    ),
  [items, lines],
);
```
