> **추천 모델: GPT-6.1 Sol** — 기존 재고 목록에 예정 수량을 연결하는 국소 UI 작업이다.
> **추천 추론 수준: Medium** — 이미 제공되는 집계를 사용하며 불완전 예정과 예약 표시의 회귀를 확인한다.
> **실행 방식: 단독 작업** — 공통 품목 행을 수정하고 PC·모바일을 순서대로 검증한다.

# 대시보드 재고 목록의 입고 예정 배지

**GOAL:** 대시보드 재고 목록에서 입고 예정 여부와 수량을 바로 확인할 수 있도록 표시하고 기존 가용 재고·품절 상태·예약 표시를 유지한다.

상태: 2026-10-22 구현·검증 완료 후 사용자 요청으로 [현재고·예약·입고 예정 배치 통일](2026-10-22-inventory-stock-info-layout.md) 계획으로 대체했다. 아래 품목명 옆 배치는 이전 구현의 기록이며, 현재는 부서별 재고 칸과 모바일 막대 아래에 표시한다.

## 디자인 결정

- 품목명 옆에 작은 보조 배지를 표시한다. 현재 예시는 `↓ 입고 예정 10 EA`다.
- PC에서는 품목명 오른쪽에 둔다. 좁은 화면에서는 품목명 바로 아래로 배치한다. 긴 품목명·긴 수량은 서로 겹치거나 생략되지 않도록 줄바꿈한다.
- 글자 12px, 둥근 모서리, 기존 `LEGACY_COLORS.cyan`과 옅은 배경·얇은 테두리를 사용한다. 아이콘은 lucide-react의 `ArrowDownToLine`을 사용하고 장식 아이콘은 `aria-hidden` 처리한다.
- 배지는 정보 표시다. 별도 클릭 동작을 추가하지 않고 현재 행 선택으로 기존 상세 패널을 연다. 터치와 키보드 선택 동작은 기존 행의 계약을 따른다.
- 품절·부족 배지와 사용 가능 재고 값은 기존 상태를 유지한다. 예: `품절 / 사용 가능 0 / 입고 예정 10 EA`.
- 현물 분포 막대에 예정량을 포함하거나 예정 수량을 가용량에 더하지 않는다. 예약 사선·위치 칩과 B급·구형·불량 표시는 유지한다.
- 새 열, 새 필터, 작업자명·작업 건수, 애니메이션은 추가하지 않는다.

검토한 대안은 게이지에 미래 재고를 겹치는 방식과 새 열을 만드는 방식이다. 첫 방식은 현물·예약의 현재 의미를 흐릴 수 있고, 새 열은 좁은 목록의 품목명 공간을 줄인다. 품목명 옆의 보조 배지가 현재 표 구조에 가장 작게 들어간다.

## 표시 계약

| 목록 응답 | 표시 |
| --- | --- |
| 집계 있음, 예정 양수, `forecast_complete=true` | 청록색 `입고 예정 10 EA` |
| 집계 있음, 예정 0, `forecast_complete=true` | 배지 생략 |
| 집계 있음, 예정 양수, `forecast_complete=false` | 경고색 `확인된 입고 10 EA` |
| 집계 있음, 예정 0, `forecast_complete=false` | 경고색 `입고 예정 확인 필요` |
| `work_reservations` 집계 필드 없음 | 배지 생략. 수량을 0으로 대체해 표시하지 않음 |
| 위치 이동 예정만 있음 | 입고 예정 배지 생략. 전체 재고 증가로 표시하지 않음 |

- 표시 값은 `item.work_reservations.expected_in_quantity`, 단위는 `item.unit`, 숫자 포맷은 `formatQty`를 사용한다.
- 작업 목표 수량이나 BOM 상위 수량을 클라이언트에서 합산하지 않는다.
- 상세 패널과 같은 서버 집계를 사용한다. 예정의 완전성도 상세와 같은 `forecast_complete` 계약을 따른다.
- 저장·수정·제출·취소 후에는 기존 재고 쿼리 갱신 흐름으로 배지도 갱신된다. 품목 행별 상세 API 조회를 추가하지 않는다.
- 목록 응답과 상세 응답이 다른 시점에 도착하는 문제는 이 UI 변경에서 새 상태 관리로 확대하지 않는다.

## 확인한 렌더·데이터 경로

- `frontend/app/mes/_components/DesktopInventoryView.tsx`와 `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx`가 `InventoryItemsTable`을 사용한다.
- `InventoryItemsTable.tsx`가 `InventoryItemRow.tsx`에 품목과 `compact`를 전달한다.
- `frontend/lib/api/types/items.ts`의 Item에 선택적 `work_reservations`가 있으며 `frontend/lib/api/types/inventory.ts`의 `InventoryReservationSummary`에 예정량과 완전성 필드가 있다.
- `backend/app/routers/items.py`의 목록 직렬화에서 이미 `work_status_by_item[item.item_id]["summary"]`를 연결한다.
- `InventoryStockSummary.tsx`는 현물 분포와 예약 사선을 처리한다. 이 파일에 입고 예정을 섞지 않는다.

## 작업 1: 기존 품목 행에 예정 배지 연결 `[GPT-6.1 Sol] [순차]`

추천 추론 수준: Medium. 표시 조건을 한 컴포넌트에서 정리하고 기존 공통 행을 사용한다.

수정 중심:

- `frontend/app/mes/_components/_inventory_sections/InventoryItemRow.tsx`
- `frontend/app/mes/_components/_inventory_sections/__tests__/InventoryItemRow.quantitySummary.test.tsx`

- [x] 현재 행의 이름·막대·예약 표시와 키보드 이벤트 계약을 읽는다.
- [x] 행 안에서 다음 표시 모델을 계산한다. 새 공용 컴포넌트나 라이브러리는 만들지 않는다.

```tsx
const forecast = item.work_reservations;
const incomingQty = forecast?.expected_in_quantity ?? 0;
const incomingLabel = !forecast ? null
  : !forecast.forecast_complete
    ? incomingQty > 0
      ? `확인된 입고 ${formatQty(incomingQty)} ${item.unit}`
      : "입고 예정 확인 필요"
    : incomingQty > 0
      ? `입고 예정 ${formatQty(incomingQty)} ${item.unit}`
      : null;
const incomingColor = forecast?.forecast_complete
  ? LEGACY_COLORS.cyan : LEGACY_COLORS.yellow;
```

- [x] 기존 품목명 요소와 배지를 하나의 감싸는 영역에 배치한다. 넓은 화면은 가로 정렬, 좁은 화면은 세로 정렬하며 `min-w-0`, `break-words`, `flex-wrap`으로 긴 내용을 처리한다. 이름의 기존 compact 표시를 읽고 배지 때문에 품목명이 추가로 잘리지 않도록 조정한다.
- [x] `incomingLabel`이 있을 때만 아이콘·문구 배지를 렌더한다. background 10~14%, border 30%의 기존 색 토큰을 사용한다.
- [x] 일반 0·양수·불완전 0·불완전 양수·집계 없음·이동만 있는 경우를 기존 테스트의 품목 fixture로 검증한다. 가용량과 현물 막대가 바뀌지 않는지도 확인한다.

검증할 핵심 계약 예시:

```tsx
expect(screen.getByText("입고 예정 10 EA")).toBeInTheDocument();
expect(screen.getByTestId("inventory-total-stock")).toHaveTextContent("0");
expect(screen.getByText("품절")).toBeInTheDocument();
```

## 작업 2: 관련 회귀와 실제 목록 검증 `[GPT-6.1 Sol] [순차]`

추천 추론 수준: Medium. 예약·예정의 의미와 좁은 화면에서의 배치가 검증 대상이다.

- [x] 관련 테스트를 실행한다. 변경이 없는 상세·예약 회귀 테스트는 기존 계약이 유지되는지 함께 확인한다.

```powershell
& 'C:\ERP\_attic\runtime\tools\node-v20.20.2-win-x64\node.exe' node_modules/vitest/vitest.mjs run app/mes/_components/_inventory_sections/__tests__/InventoryItemRow.quantitySummary.test.tsx app/mes/_components/_inventory_sections/__tests__/InventoryStockSummary.workReservations.test.tsx app/mes/_components/_inventory_sections/__tests__/InventoryReservationPresentation.test.tsx --reporter=dot
```

- [x] PC 1912·1366px, 모바일 390px에서 양수 배지, 긴 이름·큰 수량, 선택 행, 예약과 입고 예정 동시 표시를 확인한다. PC·모바일 모두 예정 배지가 한 번만 표시되어야 한다.
- [x] 실제 3120 전극 품목에서 목록·상세의 입고 예정 10 EA와 가용량 214 일치를 확인했다. 품절·가용 0·입고 예정 10 조합은 실제 공통 행을 사용하는 DB 없는 검증 페이지와 테스트에서 확인했다.
- [x] 실데이터에 없는 불완전 예정 등의 사례는 기존 DB 없는 검증 페이지 또는 테스트 fixture로 확인한다. DB에 테스트 작업을 저장하지 않는다.
- [x] 라이트·다크에서 대비와 가로 넘침을 확인한다. 계정 테마를 저장하지 않고 임시 화면 크기를 복원한다.
- [x] 변경 파일 lint, `tsc --noEmit --incremental false`, 변경 파일 `git diff --check`을 실행한다. 전체 게이트는 이 국소 UI 변경의 기본 검증으로 실행하지 않는다.
- [x] 실제 변경 파일·검증 결과·남은 제한을 보고하고 이 계획의 체크리스트를 갱신한다.

## 작업 경계

- `3120`의 기존 `work-reservations-ui` 워크트리에서 수행한다.
- 현재 다른 미커밋 변경을 보존한다.
- 사용자 승인 후에만 제품 코드를 수정했다.
- API·타입·백엔드 집계·DB·브랜치 변경·커밋·푸시는 수행하지 않는다.
- 재고 상세 카드, 입출고 작업 화면, 실사 화면과 동결 영역은 이번 변경 대상이 아니다.

## 검증 결과

- 품목 행의 예정 표시·품절 보존·행 선택에 대해 기존 구현에서 실패 8건을 먼저 확인하고 구현했다. 직접 관련 Vitest 3파일 49개가 통과했다. 변경 파일 lint, 프론트엔드 타입 검사, diff 검사도 통과했다.
- 실제 3120의 PC 1912·1366px 및 모바일 390px에서 배지 표시와 가용 수량을 확인했고 가로 넘침이 없었다. 임시 화면 크기는 해제했다.
- DB 없는 가상 데이터 페이지에서 실제 InventoryItemsTable·InventoryItemRow·CSS·폰트를 사용해 긴 품목명, 큰 수량, 예약과 입고 예정 동시 표시, 불완전 예정, 0 생략을 라이트·다크로 확인했다. 초기 검증 페이지의 Tailwind 설정 탐색 경로 누락을 수정한 뒤 최종 화면을 다시 검증했다.
- 증거는 ignored 경로 `_attic/runtime/inventory-detail-cards-20261022/`의 `incoming-live-pc1912.png`, `incoming-live-mobile390.png`, `incoming-qa-dark-pc.png`, `incoming-qa-dark-mobile390.png`, `incoming-qa-light-mobile390.png`에 저장했다.
- 계정 테마·DB를 변경하지 않았고 QA 탭·서버를 정리했다. 다른 미커밋 변경을 보존했다.
