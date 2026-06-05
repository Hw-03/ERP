---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/HandoverSectionPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-06-05
project: DEXCOWIN MES
---

# HandoverSectionPanel.tsx — 인수인계 탭 전체(작성·내 인수인계·인수 대기함)

## 이 파일은 무엇을 책임지나

창고 화면의 "인수인계" 섹션 전체를 묶는 컴포넌트입니다. 로그인한 작업자의 부서·권한에 따라 하위 탭을 보여 주고, 인수인계서 목록을 불러오며, 받는 부서가 "인수 확인"을 누르는 흐름(PIN 입력 → 재고 이동)을 처리합니다.

하위 탭 3개:

- **작성(compose)** — 튜브 부서만. 새 인수인계서 작성 폼.
- **내 인수인계(mine)** — 누구나. 내가 쓴 인수인계서 목록.
- **인수 대기함(inbox)** — 받는 부서(고압/진공) 또는 결재 권한자만. 내가 인수 확인해야 할 목록.

## 업무 흐름에서의 의미

인수인계 업무가 한 화면에서 끝나도록 묶어 줍니다. 튜브 작업자는 "작성"에서 인수인계서를 만들고, 받는 부서 담당자는 "인수 대기함"에서 도착한 문서를 확인합니다. "인수 확인"을 누르면 PIN을 입력하고, 확인되면 인수인계 품목 수량만큼 보내는 부서 → 받는 부서로 재고가 실제로 이동합니다. 각 문서는 인쇄 버튼으로 양식대로 출력할 수 있습니다. 상태(인수 대기·인수 완료·작성 중)는 색 배지로 구분됩니다.

## 언제 보면 좋나

- 인수인계 탭이 누구에게 보이는지(권한) 확인할 때
- 인수 확인 PIN/재고 이동 흐름을 손볼 때
- 인수인계서 카드의 표시 내용(상태·부서·수량·인수자)을 바꿀 때

## 중요한 내용

- `canCompose = operator?.department === "튜브"` — 작성 탭은 튜브 부서만.
- `canReceive` — 받는 부서(고압/진공) 소속이거나 부서 결재 권한자(`isDepartmentApprover`)면 인수 대기함을 봅니다.
- 초기 탭: 작성 가능하면 compose, 받을 수 있으면 inbox, 아니면 mine.
- `mine`/`inbox` 는 `api.listHandovers`/`api.listHandoverInbox` 로 받아오고, `refreshNonce`·`localNonce` 가 바뀌면 다시 부릅니다.
- `confirmReceive()` — `api.receiveHandover(handover_id, { actor_employee_id, pin })` 호출. 성공하면 목록 새로고침 + 상위 `onChanged()`.
- `STATUS_LABEL` — submitted=인수 대기(노랑), received=인수 완료(초록), draft=작성 중(회색).
- 내부 `HandoverCardList` — 문서 카드 목록. 인쇄 버튼은 항상, "인수 확인" 버튼은 inbox + 상태 submitted 일 때만.

## 연결되는 파일

### 먼저 같이 볼 파일

- [[ERP/frontend/app/legacy/_components/_warehouse_sections/HandoverComposeForm.tsx]] — "작성" 탭에 들어가는 입력 폼.
- [[ERP/frontend/app/legacy/_components/_warehouse_sections/handoverPrint.ts]] — 인쇄 버튼이 부르는 양식 출력.

## 조심할 점

- "인수 확인"은 단순 상태 변경이 아니라 **실제 재고 이동**을 일으킵니다(보내는 부서 → 받는 부서). PIN 모달의 안내 문구도 이 점을 강조합니다. 확인 흐름을 고칠 때 재고 영향까지 함께 생각하세요.
- 권한 분기(`canCompose`/`canReceive`)가 탭 노출과 동작을 동시에 좌우합니다. 한쪽만 바꾸면 보이는데 동작 안 하거나, 그 반대가 됩니다.

## 핵심 발췌

```tsx
const canCompose = (operator?.department ?? "") === "튜브";
const canReceive =
  isDepartmentApprover(operator) || ["고압", "진공"].includes(operator?.department ?? "");
// 인수 확인 시: 품목 수량만큼 from_department → to_department 재고 이동
```
