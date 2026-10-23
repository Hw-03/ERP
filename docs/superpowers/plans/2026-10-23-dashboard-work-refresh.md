> **추천 모델: GPT-6.1 Sol** — 기존 React Query와 작업 예약 집계를 연결하는 국소 수정이다.
> **추천 추론 수준: High** — 최초 요청과 변경 알림의 경합, 목록·상세의 응답 순서, 삭제·권한 상태 회귀를 함께 검증해야 한다.
> **실행 방식: 단독 작업** — 표시 기준과 갱신 경계가 서로 연결되어 순차 구현·검증이 적합하다.

# 대시보드 작업 예약 반영 지연·표시 차이 조사 및 수정 계획

**GOAL:** 작업 예약 변경 후 대시보드와 선택 상세가 동일한 수량 기준으로 갱신되고, 변경 전의 진행 중 응답이 최신 상태로 남지 않도록 수정하고 검증한다.

**상태:** 2026-10-23 사용자 실행 승인 후 구현·검증 완료. 작업 1·2를 구현하고 작업 3은 변경한 프론트 갱신 경로에 맞춰 QA로 검증했다. 제품 백엔드·원본 DB·서버는 수정하지 않았다. 커밋·푸시는 후속 사용자 요청에 따라 진행하며 배포는 수행하지 않는다.

**완료 근거:** 관련 Vitest 15개 파일 192개 검사, 타입 검사, 제품 변경 파일 대상 lint 및 diff 검사 통과. QA 두 탭에서 저장·수정·삭제·입고 예정·즉시 반영을 UI로 실행하고 목록/열린 상세가 함께 바뀌는 것을 관찰했다. 상세 증거는 `_attic/runtime/mes-browser-regression/dashboard-refresh-20261023-a/results.md`와 `session.json`, 화면 및 DOM 기록에 있다.

**실행 결과의 범위:** 아래 조사 수치와 계획은 승인 당시 기록이다. 실제 구현은 요청 시작 시 목록 참조를 기록하는 경계를 추가해 목록 밖의 늦은 응답도 차단했고, 수량 공급원까지 재조회하는 재시도와 모바일 갱신 안내도 연결했다. 조건부 서버 집계·검색 설정 대기 최적화는 QA에서 별도 병목으로 입증되지 않아 적용하지 않았다. 승인 필요 작업의 부분·최종 승인 및 위치 이동 전체 UI 재실행은 하지 않았으며 관련 기존 테스트를 회귀 근거로 사용했다. 대량 품목 환경의 수정 전/후 속도 개선은 주장하지 않는다.

**작업 트리 주의:** 조사 중 다른 작업에서 useIoDraft 및 작업 중 표·타입 등의 변경이 추가되는 것을 확인했다. 이 문서만 이번 조사의 산출물이다. 실행 시작 시 해당 파일의 최신 diff를 다시 읽고 기존 변경을 보존한다. 아래 줄 번호는 조사 시점 기준이다.

**적용 스킬:** systematic-debugging, dispatching-parallel-agents, writing-plans, efficient-verification, verification-before-completion. 실행 때는 executing-plans와 test-driven-development를 적용한다. 실행 승인 없이 구현하거나 goal을 생성하지 않는다.

## 1. 결론과 조사 한계

현재 코드는 대시보드 목록, 선택 품목 상세, 작업 현황을 각각 조회한다. 목록과 상세 사이뿐 아니라 상세 카드 안에서도 서로 다른 응답의 수량을 섞는다. 이 구조와 실제 API 응답 시간 차이로 일시적인 불일치를 설명할 수 있다. 작업 현황 최초 요청 중 무효화가 발생하면 이전 응답이 최신으로 남을 수 있는 경합도 설치된 QueryClient로 재현했다.

운영 중인 사용자의 정확한 작업 한 건을 브라우저에서 저장·삭제하여 재현하지는 않았다. 개발 서버 8011의 GET만 측정했으며, 측정 품목은 작업 예약·입고 예정이 모두 0이었다. 따라서 활성 예약이 많은 상황이나 직원 서버 8010의 실제 체감 지연을 이 수치로 단정하지 않는다. 예약 저장 기능 도입 전후 성능 비교도 하지 않았다.

## 2. 실제 렌더·조회 경로

- `frontend/app/mes/page.tsx:17,87`: QueryProvider → DesktopMesShell.
- `frontend/app/mes/_components/DesktopMesShell.tsx:442`: DesktopInventoryView.
- `frontend/app/mes/_components/DesktopInventoryView.tsx:62`: useInventoryData와 useInventoryViewState.
- `frontend/app/mes/_components/_hooks/useInventoryData.ts:43`: 목록 `/api/items?limit=2000`.
- `frontend/app/mes/_components/_hooks/useInventoryViewState.ts:63-68`: 별도 `/api/items/{id}`를 우선 표시. 목록이 새로 와도 이전 상세 응답이 있으면 목록 값으로 바뀌지 않는다.
- `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx:109`: InventoryWorkStatusPanel.
- `frontend/app/mes/_components/_inventory_sections/InventoryWorkStatusPanel.tsx:24-40`: 예약·예정은 별도 `/api/inventory/work-status`, 사용 가능 재고는 전달받은 Item을 사용한다.
- `frontend/app/mes/_components/_inventory_sections/InventoryDetailLocations.tsx:34-41`: 위치별 재고는 다시 Item의 work_reservations를 사용한다.

## 3. 확인한 원인

### A. 독립 응답을 바로 표시하여 시점이 섞인다 — 코드 확인

목록, 품목 상세, 작업 현황의 완료 순서를 맞추거나 동일 스냅샷인지 확인하는 경계가 없다. 예약 합계가 새 값인데 사용 가능 재고·위치별 예약은 이전 값인 조합도 가능하다. 상세 쿼리는 기존 데이터를 유지하므로 새 목록보다 오래된 상세가 우선할 수 있다.

근거: 위 렌더 경로 및 `frontend/lib/queries/useItemsQuery.ts:18-35`, `frontend/lib/queries/useInventoryWorkStatus.ts:10-17`.

### B. 최초 작업 현황 요청을 변경 알림이 취소하지 않는다 — 경합 재현

`frontend/lib/queries/realtime.tsx:60`은 items 요청만 명시적으로 취소한다. 작업 현황은 inventory 아래에 있으며 invalidate만 한다. 설치된 `@tanstack/query-core`의 QueryObserver로 캐시 없는 최초 요청을 시작하고 inventory invalidate 후 이전 응답을 완료했을 때 다음 결과를 얻었다.

```json
{"calls":1,"data":{"snapshot":"before-change"},"invalidated":false}
```

즉 변경 후 새 요청 없이 이전 응답이 성공 캐시로 남을 수 있다. 기존 `realtime.test.tsx:107`의 최초 요청 회귀 검사는 items만 보호한다. 동일한 위험은 `frontend/lib/queries/workReservationInvalidation.ts:7-16`의 로컬 갱신 경로에도 있다.

### C. 변경 알림 뒤에 여러 대기 단계가 있다 — 코드 확인

- 서버는 DB revision을 기본 0.5초 간격으로 확인한다: `backend/app/services/realtime.py:101,157-168`.
- 프론트는 알림을 250ms 모은다: `frontend/lib/queries/realtime.tsx:11,120-132`.
- 모든 운영 조회 전에 검색 설정 API 완료를 기다린다. 검색 설정 실패 시 운영 데이터 갱신을 진행하지 않고 재시도한다: `frontend/lib/queries/realtime.tsx:53-63,105-117`.
- 활성 운영 쿼리들의 재조회 완료를 기다리는 동안 다음 revision 처리를 보류한다: `frontend/lib/queries/realtime.tsx:61-63,84-103`.
- 본인 저장 경로는 별도 무효화도 실행하므로 SSE 대기만으로 설명해서는 안 된다: `frontend/app/mes/_components/_warehouse_v2/useIoDraft.ts:195-205`.

250ms나 0.5초만 줄이는 것으로 데이터 출처 혼합과 최초 요청 경합은 해결되지 않는다. 검색 설정 실패가 이번 사용자 증상의 실제 발생 원인이었는지는 미확인이다.

### D. 전체 목록 조회가 단건 조회보다 느리다 — GET 측정

개발 서버 8011에서 같은 품목으로 세 차례 순차 GET했다. 전체 목록 응답은 약 1.50MB였다. 시간은 이 환경의 참고값이며 성능 보장치가 아니다.

| 조회 | 1회 | 2회 | 3회 |
|---|---:|---:|---:|
| 전체 목록 | 936ms | 1192ms | 1095ms |
| 단건 품목 | 38ms | 57ms | 46ms |
| 작업 현황 | 36ms | 61ms | 38ms |

목록은 summary만 사용하지만 공통 집계가 관련 작업 상세까지 조립한다. 중복 계산 구조는 확인했지만 이번 목록 지연 중 해당 계산의 비중은 프로파일링 전이다.

근거: `backend/app/routers/items.py:420,459`, `backend/app/services/work_reservation_queries.py:283-369`, `backend/app/routers/inventory/work_status.py:23`.

### E. 정상적인 표시 기준 차이는 보존한다

서버의 목록·단건·작업 현황은 같은 집계 함수를 사용한다. 서버 계산식이 서로 다르다고 판단할 근거는 없다.

`reservation_by_location`은 실제 출발 재고 위치, `reservation_by_requester_department`는 예약 당시 요청자 부서다. 대시보드의 부서 배지와 상세 위치별 재고는 이 차이를 유지한다. 관련 작업 건수와 예약 수량도 같을 필요가 없다. 제출 시 작업 예약에서 승인 예약으로 옮겨가며, 순수 입고 작업은 예약 없이 예정만 생긴다.

근거: `frontend/app/mes/_components/_inventory_sections/InventoryStockSummary.tsx:22,136`, `backend/app/services/work_reservation_queries.py:307-343`.

## 4. 선택할 접근

1. **권장: 수량의 공통 표시 기준 + 최초 요청 경합 차단부터 수정한다.** API 계약을 유지하고 측정된 불일치 경로에 집중한다. 전체 목록이 도착하기 전에는 양쪽이 같은 이전 수량을 유지하고 갱신 중임을 표시한다.
2. 폴링 주기만 단축하는 방법은 호출량을 늘리고 응답 혼합을 남기므로 선택하지 않는다.
3. 서버 revision을 모든 응답에 넣고 전역 캐시 구조를 재설계하는 방법은 범위가 크다. 아래 수정·측정으로도 요구를 충족하지 못할 때 별도 계획으로 검토한다.

## 5. 구현 작업

### 작업 1: 최초 응답 경합 회귀 검사와 갱신 경계 보강 `[GPT-6.1 Sol / 순차]`

**추천 추론 수준: High** — 데이터 없는 초기 요청은 일반 재조회와 취소 동작이 다르다.

대상: `frontend/lib/queries/realtime.tsx`, `frontend/lib/queries/workReservationInvalidation.ts`, `frontend/lib/queries/realtime.test.tsx`, `frontend/app/mes/_components/_warehouse_v2/__tests__/useIoDraft.inventoryRefresh.test.tsx`.

- [x] 기존 items 최초 요청 테스트를 실제 `queryKeys.inventory.workStatus("item-1")`에도 적용했다. 이전 동작에서 변경 전 응답 3이 남아 실패하는 것을 확인하고, 보강 후 최신 응답 5를 확인했다.
- [x] 로컬 예약 변경 경로의 기본/throwOnError 양쪽 최초 요청 경합, 기존 요청 실패·연속 revision·품목 전환 검사를 통과했다.
- [x] items와 inventory work-status의 최초 요청도 취소한 뒤 무효화한다. 공통 helper를 SSE와 로컬 경로에 적용했다.

취소 대상의 구체적인 판정은 다음과 같다. 기존 키 계약을 바꾸지 않는다.

```ts
const cancelInventoryReads = () => Promise.all([
  client.cancelQueries({ queryKey: queryKeys.items.all }),
  client.cancelQueries({
    predicate: (query) => query.queryKey[0] === "inventory"
      && query.queryKey[1] === queryKeys.inventory.workStatus("")[1],
  }),
]);
```

위 코드는 계획의 동작 명세다. 실제 함수 추출 여부는 두 호출부의 오류·반환 계약을 보존하며 결정한다. 명령이 성공한 뒤 재조회 실패를 명령 실패로 바꾸지 않는다. 본인 예약을 재고에 잘못 가산하지 않는 기존 경계도 유지한다.

### 작업 2: 목록·상세 수량의 출처 통일 `[GPT-6.1 Sol / 순차]`

**추천 추론 수준: High** — 수량 통일이 삭제 감지와 권한 오류 처리를 덮으면 안 된다.

대상: `frontend/app/mes/_components/_hooks/useInventoryViewState.ts`, `frontend/app/mes/_components/_hooks/useInventoryData.ts`, `frontend/app/mes/_components/_inventory_sections/InventoryWorkStatusPanel.tsx`, 필요한 상태 전달부 `DesktopInventoryView.tsx`와 `DesktopInventoryRightPanel.tsx`.

검사: `frontend/app/mes/_components/_hooks/__tests__/useInventoryViewState.test.tsx`, `frontend/app/mes/_components/_inventory_sections/__tests__/InventoryWorkStatusPanel.test.tsx`, `frontend/app/mes/_components/_inventory_sections/__tests__/InventoryDetailPanel.workReservations.test.tsx`.

- [x] 목록 7/상세 10 및 서로 다른 예약·예정 응답을 주는 실패 테스트를 먼저 작성한 뒤 통과했다.
- [x] 현재 목록에 선택 품목이 있으면 목록 Item을 공통 기준으로 사용한다. 목록 밖에서는 마지막 공통 표시를 유지하고 그 이후 시작한 단건 조회로 갱신한다. 삭제·404·401·403 상태와 actionsDisabled를 보존했다.
- [x] InventoryWorkStatusPanel의 수량 요약은 `item.work_reservations`, 관련 작업은 work-status 응답을 사용한다. 누락은 0으로 바꾸지 않으며 재시도는 활성 품목 조회까지 갱신한다.

```ts
const summary = item.work_reservations;
const reservedTotal = summary
  ? summary.work_reserved_quantity + summary.approval_reserved_quantity
    + summary.shipping_reserved_quantity
  : undefined;
```

- [x] 늦은 단건이 목록 수량을 덮지 않도록 요청 시작 당시 목록 참조를 기록했다. 검색으로 목록에서 사라진 후 이전 단건이 도착하는 경우와 이후 재조회 복구까지 검사했다.
- [x] 수량 갱신 중 이전의 일관된 수량과 안내를 유지하며, 관련 작업에도 별도 조회 상태를 표시한다. 데스크톱·모바일 전달부를 연결했다.
- [x] 닫기·재열기, 목록 탈락, 삭제, 직원 전환, 모바일 공유 컴포넌트 회귀를 통과했다.

### 작업 3: 변경 후 재측정 및 필요한 성능 보강 `[GPT-6.1 Sol / 순차]`

**추천 추론 수준: High** — 검색 메타데이터 정합성과 작업 예약 소유자 보호가 실시간 갱신 순서에 의존한다.

- [x] 격리 QA에서 UI 저장·수량 수정·삭제·순수 입고 예정·즉시 반영을 실행했다. 열린 상세와 목록의 DOM 변경을 기록했고, 관련 수량이 달랐던 기록은 없었다. 승인 UI 전체 재실행은 위 실행 범위 설명에 따라 제외했다.
- [x] 같은 직원의 작성 탭과 관찰 탭을 나눠 SSE 갱신을 확인했다. 재연결·연속 revision·실패 복구·위치별 표시 의미는 관련 자동 검사로 검증했다.
- [x] 조건부 검토 완료: QA에서 서버 상세 직렬화가 병목이라는 근거를 얻지 못해 서버 집계는 수정하지 않았다.
- [x] 조건부 검토 완료: 검색 설정 정합성 경계는 유지했다. 관찰된 응답 이후 공통 수량 반영 지연은 466~835ms였으며, 무관 쿼리 대기를 바꿀 근거는 얻지 못했다.
- [x] 기존 0.5초/250ms 설정을 유지했다.

조건부 성능 작업은 원인이 입증될 때만 시행한다. 전체 API 재설계·캐시 라이브러리 교체·전역 낙관적 수량 계산은 범위에 포함하지 않는다.

## 6. 검증과 완료 기준

이번 조사에서 기존 테스트를 실행하여 3개 파일의 41개 검사가 통과했다. 최초 inventory 요청 경합은 기존 테스트 밖에서 QueryClient로 별도 재현했다. 기존 테스트 통과는 보고된 증상이 없다는 뜻이 아니다.

프론트 실행 명령(저장소 전용 Node, frontend 디렉터리):

```powershell
& (Get-Content ..\_attic\runtime\frontend-node-path.txt).Trim() node_modules/vitest/vitest.mjs run lib/queries/realtime.test.tsx lib/queries/__tests__/useInventoryWorkStatus.test.tsx app/mes/_components/_hooks/__tests__/useInventoryViewState.test.tsx app/mes/_components/_inventory_sections/__tests__/InventoryWorkStatusPanel.test.tsx app/mes/_components/_inventory_sections/__tests__/InventoryDetailPanel.workReservations.test.tsx app/mes/_components/_warehouse_v2/__tests__/useIoDraft.inventoryRefresh.test.tsx
```

백엔드 집계를 실제로 수정한 경우에만 backend 디렉터리에서 `python -m pytest tests/services/test_work_reservation_queries.py`를 실행하고, 수정한 API 소비자의 관련 검사를 추가한다. 프론트 변경 파일에는 대상 lint와 필요한 타입 검사를 적용한다. 전체 게이트는 국소 수정이라는 이유만으로 실행하지 않는다.

완료 기준:

- [x] 같은 의미의 수량이 목록·상세에서 같고, 상세 카드 수량이 한 Item에 근거한다. QA DOM 기록에서 불일치 0개.
- [x] 최초 요청 경합을 SSE 및 로컬 기본/throwOnError 경로 모두 실패 재현 후 통과했다.
- [x] 오류·재연결·재시도 복구 검사를 통과하고 누락을 0으로 표현하지 않는다.
- [x] 구현 후 명령 응답부터 공통 반영까지 466~835ms를 기록했다. 수정 전과 동등한 대량 자료 속도 비교는 미실시로 명시했으며 속도 개선을 보장하지 않는다.
- [x] 요청자 부서/재고 위치, 예약/승인/예정 의미 및 삭제·권한 방어 관련 검사를 통과했다.
- [x] 구현 검증 시점에는 커밋·푸시·배포 없이 변경과 증거를 보존했다. 커밋·푸시는 후속 사용자 요청에 따라 별도로 수행한다.
