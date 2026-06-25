# DEXCOWIN MES Screen Baseline Cleanup Log

작성일: 2026-06-25

## 목적

이 문서는 DEXCOWIN MES의 실제 웹 화면을 기준으로, 현재 업무에 필요한 기능과 과거 잔재 삭제 후보를 분리하기 위한 작업 기록이다.

컨텍스트에만 의존하지 않도록 화면별로 다음 내용을 계속 누적한다.

- 실제 화면에서 확인한 기능
- 보존해야 하는 프론트엔드/백엔드 경로
- 삭제 후보
- 개선 후보
- 삭제 전 검증 체크리스트

## 판정 원칙

1. 실제 웹 화면과 실제 코드가 기준이다.
2. 화면에서 보이지 않더라도 권한, 역할, 로딩 상태 때문에 숨겨졌을 수 있으면 즉시 삭제 후보로 보지 않는다.
3. 삭제 후보는 참조 추적 결과와 함께 기록한다.
4. 업무 화면에서 쓰는 API, 훅, 컴포넌트는 이름이 오래되어 보여도 먼저 보존 대상으로 둔다.
5. 삭제 작업 전후로 같은 화면이 같은 흐름으로 동작하는지 확인한다.
6. 주간보고 화면 관련 고정 파일은 별도 명시 요청 없이는 수정하지 않는다.

## 전체 진행 상태

| 화면 | 상태 | 현재 판정 |
| --- | --- | --- |
| 로그인 | 기준선 확정 | 보존 대상. 큰 삭제 후보 없음. |
| 대시보드 | 기준선 확정 | 보존 대상 경로와 삭제 후보 1차 분리 완료 |
| 입출고 | 기준선 1차 확정 | 실제 화면 흐름과 보존/정리 후보 1차 분리 완료 |
| 불량 | 기준선 1차 확정 | 실제 화면 흐름과 보존/삭제 후보 1차 분리 완료 |
| 입출고 내역 | 기준선 1차 확정 | 실제 화면 흐름과 보존/정리 후보 1차 분리 완료 |
| 창고 지도 | 기준선 1차 확정 | 실제 화면 흐름과 보존/정리 후보 1차 분리 완료 |
| 주간보고 | 고정 영역 기록 완료 | 삭제/수정 대상에서 제외. 신규 TransactionTypeEnum 분류만 예외 |
| 관리 | 기준선 1차 확정 | 실제 PIN 해제 화면 렌더까지 확인 완료. 서버 권한/잔재 후보 1차 분리 완료 |
| 모바일 화면 | 기준선 1차 확정 | 실제 모바일 라우팅과 보존/정리 후보 1차 분리 완료 |
| 공통 셸 | 기준선 1차 확정 | 데스크톱 사이드바/상단바/알림/테마/작업자 메뉴 실제 렌더 확인 완료 |
| 루트/오류 화면 | 기준선 확정 | `/`·`/mes` 진입점과 오류 fallback 보존 판정 완료 |


### 전체 화면 Playwright Smoke

검증일: 2026-06-25

공통 조건:
- URL: `http://127.0.0.1:3001/mes`
- 프론트 dev 서버: `3001`
- 프론트 rewrite 기준 백엔드: `8011`
- 작업자 세션: 활성 직원 `E22` 우선 사용
- 검증 범위: 저장/삭제/승인/내보내기 버튼은 누르지 않고, 탭 이동과 본문 마커 렌더만 확인

데스크톱 viewport `1440x1000` 확인 결과:

| 탭 | URL | 확인 마커 | 결과 |
| --- | --- | --- | --- |
| 대시보드 | `/mes?tab=dashboard` | `자재 목록` | 표시 |
| 입출고 | `/mes?tab=warehouse` | `입출고` | 표시 |
| 불량 | `/mes?tab=defect` | `불량` | 표시 |
| 입출고 내역 | `/mes?tab=history` | `입출고 내역` | 표시 |
| 창고 지도 | `/mes?tab=warehouseMap` | `창고 지도` | 표시 |
| 주간보고 | `/mes?tab=weekly` | `주간보고` | 표시 |
| 관리 | `/mes?tab=admin` | `관리자 인증` -> PIN `0000` 해제 후 `모델 목록` | 표시 |

모바일 viewport `390x844` 확인 결과:

| 탭/하위화면 | URL | 확인 마커 | 결과 |
| --- | --- | --- | --- |
| 대시보드 | `/mes?tab=dashboard` | `대시보드` | 표시 |
| 입출고 | `/mes?tab=warehouse` | `입출고` | 표시 |
| 불량 | `/mes?tab=defect` | `불량` | 표시 |
| 내역 | `/mes?tab=history` | `내역` | 표시 |
| 더보기 | `/mes?tab=more` | `더보기` | 표시 |
| 주간보고 | `/mes?tab=weekly` | `주간보고` | 표시 |
| 창고지도 | `/mes?tab=warehouseMap` | `창고지도` | 표시 |

메모:
- 모바일 더보기 화면 안의 `주간보고` 클릭 smoke는 숨은 텍스트 요소를 먼저 잡아 실패했다. 딥링크 렌더 방식으로 하위화면 표시 여부를 재확인했다.
- 관리 탭은 진입 불가가 아니라 `DesktopPinLock`을 거치는 구조다. PIN `0000` 해제 후 8개 관리 섹션 본문 마커까지 확인했다.
- 이 smoke는 “화면이 살아 있음” 검증이며, 저장/삭제/승인 등 데이터 변경 플로우 검증은 각 삭제 실행 단계의 별도 체크리스트에서 수행한다.

### 화면 범위 대조

- Next App Router 기준 실제 page 파일은 `frontend/app/page.tsx`와 `frontend/app/mes/page.tsx`뿐이다. `/`는 `/mes/page`를 re-export한다.
- 데스크톱 업무 탭은 코드상 7개다: `dashboard`, `warehouse`, `warehouseMap`, `defect`, `history`, `weekly`, `admin` (`DesktopMesShell.tsx` 30, `DesktopSidebar.tsx` 10-25).
- 모바일 업무 탭/하위 화면은 코드상 7개다: `dashboard`, `warehouse`, `defect`, `history`, `more`, `weekly`, `warehouseMap` (`MobileShell.tsx` 39-69).
- 모바일에서 `admin`은 의도적으로 제외되어 있다: `MobileShell.tsx` 37.
- 따라서 이 문서의 화면 단위는 루트/오류, 로그인, 데스크톱 7개 탭, 모바일 7개 탭/하위 화면, 공통 셸을 기준으로 닫는다.
## 로그인

상태: 기준선 확정

### 실제 화면에서 확인한 기능

- 직원 선택
- 직원 검색/목록 드롭다운
- PIN 번호 입력
- 직원 선택 및 PIN 4자리 입력 전 로그인 비활성화
- 로그인 실패 시 오류 표시
- PIN 초기화 요청 안내 표시
- 로그인 완료 후 대시보드 진입

### 보존해야 하는 경로

- `frontend/app/mes/page.tsx`
  - `/mes` 전체를 로그인 게이트로 감싼다.
- `frontend/app/mes/_components/login/MesLoginGate.tsx`
  - 저장된 작업자 확인, 서버 재시작 감지, 로그인 화면/메인 화면 전환.
- `frontend/app/mes/_components/login/OperatorLoginCard.tsx`
  - 직원 선택, PIN 입력, PIN 검증 요청, 로그인 성공 처리.
- `frontend/app/mes/_components/login/EmployeeCombobox.tsx`
  - 직원 검색, 초성/한글 입력 보정, 키보드 선택.
- `frontend/app/mes/_components/login/useLoginEmployees.ts`
  - 활성 직원 목록 조회.
- `frontend/app/mes/_components/login/useCurrentOperator.ts`
  - 현재 작업자 저장/조회/로그아웃/구독 이벤트.
- `frontend/lib/api/employees.ts`
  - `getEmployees`
  - `verifyEmployeePin`
  - `changeMyPin`
  - `resetEmployeePin`
  - `setEmployeeTheme`
- `frontend/lib/api/departments.ts`
  - `getAppSession`
- `backend/app/routers/employees.py`
  - `GET /api/employees`
  - `POST /api/employees/{employee_id}/verify-pin`
  - `POST /api/employees/{employee_id}/change-pin`
  - `POST /api/employees/{employee_id}/reset-pin`
  - `PUT /api/employees/{employee_id}/theme`
- `backend/app/main.py`
  - `GET /api/app-session`

### 참조상 보존 근거

- `MesLoginGate`는 `frontend/app/mes/page.tsx`에서 전체 화면 진입을 감싼다.
- `OperatorLoginCard`는 `MesLoginGate` 내부에서 직접 렌더된다.
- `EmployeeCombobox`는 `OperatorLoginCard`의 직원 선택 UI다.
- `useCurrentOperator`는 데스크톱 상단바, 모바일 쉘, 알림, 테마, 업무 화면 권한 판단에서 사용된다.
- `verifyEmployeePin`은 로그인뿐 아니라 창고 지도 민감 작업 PIN 재확인에서도 사용된다.
- `changeMyPin`, `resetEmployeePin`, `setEmployeeTheme`은 상단바/모바일/관리 화면에서 이어지는 살아있는 기능이다.

### 삭제 후보

현재 없음.

### 개선 후보

- `PIN 초기화 요청`은 실제 요청 기능이 아니라 안내에 가깝다. 버튼처럼 보이는 표현을 유지할지, 안내 텍스트로 정리할지 결정 필요.
- 로그인 플로우 화면 테스트가 부족하다. 직원 선택, PIN 입력, 성공/실패, 현재 작업자 저장을 검증하는 테스트를 추가하는 것이 좋다.
- 로그인 관련 파일 일부의 오래된 라운드 주석과 불필요한 설명은 정리할 수 있다.
- 현재 구조는 작업자 식별 중심이다. 운영 보안 강화는 삭제 작업과 분리된 후속 과제로 둔다.

### 삭제 전 검증 체크리스트

- 로그아웃 상태에서 로그인 화면이 표시된다.
- 직원 목록이 표시되고 검색/선택이 된다.
- PIN 4자리 입력 전 로그인 버튼이 비활성화된다.
- PIN 오류 시 오류 메시지가 표시된다.
- 로그인 성공 시 대시보드로 진입한다.
- 새로고침 후 저장된 작업자로 메인 화면에 진입한다.
- 서버 재시작 후 저장된 작업자가 무효화되어 다시 로그인 화면으로 돌아간다.
- 상단바 로그아웃이 현재 작업자를 지우고 로그인 화면으로 돌아간다.
- 테마 변경 후 현재 작업자 정보가 유지된다.


## 대시보드

상태: 기준선 확정

확인 URL: `http://192.168.0.63:3001/mes?tab=dashboard`

확인 조건:

- 데스크톱 Chrome 실제 화면
- 작업자 로그인 상태
- 기본 권한: 조립 부서 작업자

### 실제 화면에서 확인한 기능

- 좌측 사이드바: 대시보드, 입출고, 불량, 입출고 내역, 창고 지도, 주간보고, 관리, 라이트/다크 모드 전환.
- 상단바: 화면 제목, 시스템 상태 배지, 현재 작업자 표시, 알림, 동기화.
- KPI 카드: 전체, 정상, 부족, 품절. KPI 클릭 시 목록 필터링, 전체 클릭 시 초기화.
- 생산 가능 요약: 출하 대기 / 빠른 생산 / 총생산, 모델별 요약, `자세히 보기`.
- 생산 가능수량 상세 모달: 조립 완제품 기준 설명, 출하 대기/빠른 생산/총생산 설명, 모델/품목별 병목 수량, 기준 PF 해제, 닫기.
- 필터 패널: 부서 구분, 모델 구분, 공정 구분, 전체 초기화.
- 자재 목록: 검색, 상태/이미지/품목명/품목 코드/부서/현재고/안전재고 컬럼, 행 선택, 이미지 확대, `100개 더 보기`.
- 우측 상세 패널: 품목명, 품목 코드, 상태, 수량 현황, 승인 대기 수량, 사용 가능 재고, 위치별 재고, 하위 구성 보기, 빠른 작업, 패널 닫기.
- 빠른 작업 입고 선택지: 부서 입고, 창고 반입.
- 빠른 작업 출고 선택지: 부서 출고, 창고 반출.

### 보존해야 하는 경로

- `frontend/app/mes/_components/DesktopMesShell.tsx`
  - 대시보드 탭에서 `DesktopInventoryView`를 렌더한다.
  - 생산 가능수량 상세 모달을 관리한다.
  - 빠른 작업에서 입출고 화면으로 넘길 `handleGoToWarehouse`를 전달한다.
- `frontend/app/mes/_components/DesktopInventoryView.tsx`
  - 대시보드의 실제 본체.
  - KPI, 생산 가능 요약, 필터, 검색, 자재 목록, 우측 상세 패널을 조립한다.
- `frontend/app/mes/_components/_hooks/useInventoryData.ts`
  - 대시보드 자재 목록을 `api.getItems({ limit: 2000 })`로 조회한다.
- `frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx`
  - 전체/정상/부족/품절 KPI 수량과 필터 상태를 계산한다.
- `frontend/app/mes/_components/_inventory_sections/InventoryKpiPanel.tsx`
  - KPI 카드 UI와 클릭 필터.
- `frontend/app/mes/_components/_inventory_sections/InventoryCapacityPanel.tsx`
  - 생산 가능 요약.
- `frontend/app/mes/_components/CapacityDetailModal.tsx`
  - 생산 가능수량 상세 모달.
- `frontend/lib/mes/capacity.ts`
  - 생산 가능수량 모델 그룹핑과 기준 PF 표시 계산.
- `frontend/app/mes/_components/_inventory_sections/InventoryFilterBar.tsx`
  - 부서/모델/공정 필터와 검색 입력.
- `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx`
  - 자재 목록 테이블, `100개 더 보기`, 표시 개수.
- `frontend/app/mes/_components/_inventory_sections/InventoryItemRow.tsx`
  - 자재 행, 이미지 확대, 행 선택.
- `frontend/app/mes/_components/_inventory_sections/DesktopInventoryRightPanel.tsx`
  - 우측 슬라이딩 상세 패널 외곽.
- `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx`
  - 수량 현황, 예약 목록, 위치별 재고, 하위 구성, 빠른 작업.
- `frontend/app/mes/_components/_inventory_sections/InventoryDetailLocations.tsx`
  - 위치별 재고 표시.
- `frontend/app/mes/_components/_warehouse_v2/BomSubExpander.tsx`
  - 하위 구성 보기.
- `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts`
  - 빠른 입고/출고 선택지를 입출고 화면 intent로 변환한다.
- `frontend/lib/api/items.ts`
  - `getItems`
- `frontend/lib/api/production.ts`
  - `getProductionCapacity`, `getCapacityPins`, `setCapacityPin`, `deleteCapacityPin`
- `frontend/lib/api/stock-requests.ts`
  - `getItemReservations`
- `backend/app/routers/items.py`
  - `GET /api/items`
- `backend/app/routers/production.py`
  - `GET /api/production/capacity`
  - `GET/PUT/DELETE /api/production/capacity/pf-pins`
- `backend/app/services/production_capacity.py`
  - `compute_capacity`
- `backend/app/routers/stock_requests.py`
  - `GET /api/stock-requests/reservations`

### 참조상 보존 근거

- `DesktopMesShell`은 대시보드 탭에서 `DesktopInventoryView`를 렌더하고, 빠른 작업이 이동할 입출고 화면 intent를 전달한다.
  - `frontend/app/mes/_components/DesktopMesShell.tsx:154`
  - `frontend/app/mes/_components/DesktopMesShell.tsx:168`
  - `frontend/app/mes/_components/DesktopMesShell.tsx:180`
- `DesktopInventoryView`는 KPI, 생산 가능 요약, 필터, 검색, 목록, 상세 패널을 모두 조립한다.
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:30`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:165`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:174`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:181`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:209`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:216`
  - `frontend/app/mes/_components/DesktopInventoryView.tsx:234`
- 자재 목록은 `useInventoryData`가 `/api/items`에서 가져온다.
  - `frontend/app/mes/_components/_hooks/useInventoryData.ts:34`
  - `frontend/lib/api/items.ts:21`
  - `backend/app/routers/items.py:225`
- KPI 값과 전체 초기화 힌트는 파생 훅에서 계산한다.
  - `frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx:71`
  - `frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx:77`
  - `frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx:78`
  - `frontend/app/mes/_components/_hooks/useDesktopInventoryDerivations.tsx:79`
- 자재 목록은 100개 단위 표시와 더 보기를 가진다.
  - `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx:123`
  - `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx:136`
  - `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx:146`
  - `frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx:153`
- 우측 상세 패널의 빠른 작업은 직접 재고 변경이 아니라 입출고 화면 intent로 이동한다.
  - `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx:293`
  - `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx:335`
  - `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx:371`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:302`
- 생산 가능 요약과 상세는 실제 계산 API와 연결되어 있다.
  - `frontend/app/mes/_components/_inventory_sections/InventoryCapacityPanel.tsx:239`
  - `frontend/app/mes/_components/CapacityDetailModal.tsx:30`
  - `frontend/lib/api/production.ts:44`
  - `backend/app/routers/production.py:203`
  - `backend/app/services/production_capacity.py:618`
- 승인 대기 수량 상세는 예약 API와 연결되어 있다.
  - `frontend/app/mes/_components/_inventory_sections/InventoryDetailPanel.tsx:58`
  - `frontend/lib/api/stock-requests.ts:83`
  - `backend/app/routers/stock_requests.py:258`

### 삭제 후보

대시보드 기준으로 삭제 후보:

- `frontend/app/mes/_components/ItemDetailSheet.tsx`
  - 현재 대시보드 행 클릭에서 쓰이지 않는다.
  - 자체적으로 `api.adjustInventory`, `api.receiveInventory`를 호출하는 옛 상세 시트다.
  - 참조 검색 결과 외부 import가 없고, 내부에서 `ItemDetailActionForm`, `ItemDetailHistoryList`만 사용한다.
- `frontend/app/mes/_components/ItemDetailActionForm.tsx`
  - `ItemDetailSheet` 전용 폼으로 보인다.
- `frontend/app/mes/_components/ItemDetailHistoryList.tsx`
  - `ItemDetailSheet` 전용 최근 입출고 목록으로 보인다.
- `frontend/lib/api/inventory.ts`의 직접 쓰기 래퍼
  - `receiveInventory`
  - `adjustInventory`
  - `transferToProduction`
  - `transferToWarehouse`
  - `transferBetweenDepts`
  - `markDefective`
  - `returnToSupplier`
- `frontend/lib/queries/useInventoryQuery.ts`의 직접 쓰기 mutation 훅
  - `useReceiveInventoryMutation`
  - `useAdjustInventoryMutation`
  - `useTransferToProductionMutation`
  - `useTransferToWarehouseMutation`
  - `useMarkDefectiveMutation`
- 위 직접 쓰기 래퍼/훅만 검증하는 테스트
  - `frontend/lib/__tests__/api-inventory.test.ts`
  - `frontend/lib/__tests__/query-inventory.test.ts`
  - 단, 조회 API 테스트가 섞여 있으므로 파일 삭제가 아니라 테스트 분리/축소가 필요할 수 있다.
- 백엔드 직접 쓰기 라우트
  - `backend/app/routers/inventory/receive.py`
  - `backend/app/routers/inventory/transfer.py`
  - `backend/app/routers/inventory/defective.py`
  - `backend/app/routers/inventory/supplier.py`

주의:

- `frontend/lib/api/inventory.ts` 전체 삭제는 아직 금지.
  - `getInventorySummary`, `getItemLocations`는 다른 화면/옛 시트/테스트와 얽혀 있어 별도 화면 검토 후 판정한다.
- 백엔드 inventory 서비스 함수까지 같이 삭제하면 안 된다.
  - 입출고 v2, 불량, 요청 승인 쪽에서 내부 서비스 함수를 공유할 가능성이 있으므로 라우터 단위로 먼저 끊어야 한다.
- `ItemDetailSheet` 계열은 대시보드 기준으로는 삭제 후보지만, 모바일 또는 다른 화면에서 숨은 참조가 없는지 삭제 전 한 번 더 전체 grep이 필요하다.

### 개선 후보

- 대시보드 관련 파일 일부 주석에 과거 라운드 표기와 깨진 설명이 남아 있다. 기능 삭제와 별도로 정리 가능하다.
- 검색 입력은 자동화 `fill`로는 상태가 갱신되지 않았고, 실제 키보드 입력 방식에서는 정상 초기화됐다. 테스트 작성 시 `userEvent` 방식으로 검증해야 한다.
- `onGoToWarehouseTab` prop은 `DesktopInventoryView` props에 남아 있으나 현재 본문에서 사용되지 않는다. 삭제 후보로 별도 확인할 수 있다.
- `setItems`는 `useInventoryData`에서 반환되지만 `DesktopInventoryView`에서 직접 사용되지 않는다. 훅 API 축소 후보로 확인 가능하다.
- `onGoToWarehouse` 빠른 작업은 현재 안전하게 입출고 화면으로 넘기지만, 삭제 작업 중 이름이 비슷한 옛 직접 입출고 API와 혼동되기 쉽다. 문서/타입 이름으로 구분을 강화하는 것이 좋다.

### 삭제 전 검증 체크리스트

- `/mes?tab=dashboard` 진입 시 대시보드가 표시된다.
- KPI 전체/정상/부족/품절 카드가 표시된다.
- 부족 KPI 클릭 시 부족 품목만 표시되고 `9 / 9개 표시`처럼 목록 수가 줄어든다.
- 전체 KPI 클릭 시 필터가 초기화된다.
- 검색어 입력 시 목록과 KPI가 함께 좁혀진다.
- 검색어 삭제 시 목록과 KPI가 원래 수량으로 돌아온다.
- 필터 버튼 클릭 시 부서/모델/공정 필터 패널이 열린다.
- 필터 항목 선택 시 목록이 좁혀지고 전체 초기화로 원복된다.
- 생산 가능 요약이 표시된다.
- 생산 가능 요약 클릭 시 생산 가능수량 상세 모달이 열린다.
- 생산 가능수량 상세 모달에서 닫기가 동작한다.
- 자재 목록은 100개 단위로 표시되고 `100개 더 보기`가 동작한다.
- 이미지가 있는 자재 행의 이미지 확대 버튼이 열린다.
- 자재 행 클릭 시 우측 상세 패널이 열린다.
- 우측 상세 패널 닫기가 동작한다.
- 상세 패널에 수량 현황, 위치별 재고, 하위 구성 보기, 빠른 작업이 표시된다.
- 하위 구성 보기가 열리고 닫힌다.
- 빠른 작업 입고 클릭 시 `부서 입고`, `창고 반입` 선택지가 표시된다.
- 빠른 작업 출고 클릭 시 `부서 출고`, `창고 반출` 선택지가 표시된다.
- 빠른 작업 선택 시 입출고 화면으로 이동하며 선택 품목과 intent가 유지된다.
- 직접 쓰기 API 라우터 삭제 후에도 대시보드에서 재고 수량 조회, 검색, 필터, 상세 패널이 그대로 동작한다.


## 입출고

상태: 기준선 1차 확정

### 실제 화면에서 확인한 기능

- 상단 탭: `요청 작성`, `작업 중`, `내 요청`. 권한에 따라 `창고 승인함`, `부서 승인함`, `인수인계`가 추가될 수 있다.
- `요청 작성` Step 1: `창고 입출고`, `부서 입출고`. 현재 김현우/조립 계정 기준으로 `원자재 입고`는 표시되지 않았다.
- `창고 입출고` Step 2: `창고 → 부서`, `부서 → 창고`, 부서 선택(튜브/고압/진공/튜닝/조립/출하).
- `부서 입출고` Step 2: 대상 부서 선택, 방향 선택(`생산 입고`, `분해 출고`). 현재 화면에서 `수량보정`이라는 사용자용 작업 선택지는 보이지 않았다.
- Step 3 품목 선택: 부서/모델/단계 필터, `품목명 · 품목 코드` 검색, `순서 편집`, 품목 표, 품목별 `BOM`/`낱개`, `100개 더 보기`.
- Step 4 품목 확인: 체크된 품목만 반영, 반영 라인/총 수량, `재고 반영 포함`, 수량 증감, 현재/가능 재고와 실행 후 수량, `제출확인 →`.
- Step 5 최종 확인: `창고 결재 요청` 또는 `부서 결재 요청` 또는 `즉시 재고 반영`, 메모, `저장`, 최종 결재/반영 버튼, ConfirmModal.
- `작업 중` 탭: 임시저장 작업 카드, `이어서 작업`, `삭제`. 삭제는 ConfirmModal을 거친다.
- `내 요청` 탭: 본인 요청 목록, 취소/완료/반려/승인 실패 상태. 오래된 요청 데이터에는 `수동 조정`, `수량보정 입고/출고` 같은 과거 라벨이 표시될 수 있다. 취소/수정은 PIN 확인 모달을 거친다.

### 보존해야 하는 경로

- `frontend/app/mes/_components/DesktopWarehouseView.tsx`
  - 입출고 데스크톱 화면의 탭, 권한, 카운트, 작성 화면 조립.
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:5`
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:45`
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:90`
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:147`
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:159`
  - `frontend/app/mes/_components/DesktopWarehouseView.tsx:185`
- `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx`
  - `요청 작성`, `작업 중`, `내 요청`, 승인함, 인수인계 탭 구성.
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx:7`
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx:38`
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseSectionTabs.tsx:43`
- `frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx`
  - 탭별 패널 분기.
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx:55`
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx:78`
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx:91`
  - `frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx:125`
- `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx`
  - Step 1~5 전체 작성 흐름의 중심 컨테이너.
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:80`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:403`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:489`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:793`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:842`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:886`
  - `frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx:949`
- `frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx`
  - Step 1/2 작업 유형과 세부 작업 선택 UI.
  - `frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx:19`
  - `frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx:89`
  - `frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx:100`
  - `frontend/app/mes/_components/_warehouse_v2/IoWorkTypeStep.tsx:145`
- `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx`
  - Step 3 품목 필터/검색/정렬/더보기/BOM/낱개 선택.
  - `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx:141`
  - `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx:610`
  - `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx:644`
  - `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx:661`
  - `frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx:714`
- `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx`
  - Step 4 품목 확인, 반영 라인, 수량 조정, 제출확인 이동.
  - `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:55`
  - `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:63`
  - `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:97`
  - `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:146`
  - `frontend/app/mes/_components/_warehouse_v2/IoBundleCart.tsx:170`
- `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx`
  - Step 5 최종 확인, 결재 종류, 제출 전 ConfirmModal.
  - `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:35`
  - `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:79`
  - `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:180`
  - `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:260`
  - `frontend/app/mes/_components/_warehouse_v2/IoConfirmStep.tsx:290`
- `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts`
  - 내부 work type/sub type, 결재 종류, 방향, 라벨 분기.
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:18`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:48`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:123`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:146`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:159`
  - `frontend/app/mes/_components/_warehouse_v2/ioWorkType.ts:257`
- `frontend/lib/io/glossary.ts`
  - 화면 라벨 단일 사전. 현재 오래된 라벨도 여기서 확인된다.
  - `frontend/lib/io/glossary.ts:24`
  - `frontend/lib/io/glossary.ts:42`
  - `frontend/lib/io/glossary.ts:51`
  - `frontend/lib/io/glossary.ts:101`
- `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx`
  - 작업 중 탭. 기존 stock request draft와 IO draft를 같이 보여준다.
  - `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx:39`
  - `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx:60`
  - `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx:133`
  - `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx:143`
  - `frontend/app/mes/_components/_warehouse_sections/DraftCartPanel.tsx:153`
- `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx`
  - 내 요청 탭, 취소/수정 PIN 모달.
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx:21`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx:68`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx:88`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx:134`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestsPanel.tsx:169`
- `frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx`
  - 요청 행 표시, 상태 라벨, 라인 요약, 취소/수정 버튼.
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx:53`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx:77`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx:101`
  - `frontend/app/mes/_components/_warehouse_sections/MyRequestRow.tsx:162`
- `frontend/lib/api/io.ts`
  - `/api/io/preview`, `/api/io/draft`, `/api/io/submit` 클라이언트 API.
  - `frontend/lib/api/io.ts:12`
  - `frontend/lib/api/io.ts:15`
  - `frontend/lib/api/io.ts:27`
  - `frontend/lib/api/io.ts:39`
  - `frontend/lib/api/io.ts:42`
- `frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts`
  - 제출 멱등키 생성. 더블클릭/네트워크 retry 방어.
  - `frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts:20`
  - `frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts:21`
  - `frontend/app/mes/_components/_warehouse_v2/useIoSubmit.ts:26`
- `frontend/app/mes/_components/_warehouse_v2/useIoDraft.ts`
  - IO draft 저장/복원.
  - `frontend/app/mes/_components/_warehouse_v2/useIoDraft.ts:7`
  - `frontend/app/mes/_components/_warehouse_v2/useIoDraft.ts:20`
  - `frontend/app/mes/_components/_warehouse_v2/useIoDraft.ts:36`
- `frontend/lib/api/stock-requests.ts`
  - 내 요청/승인함/취소/수정/기존 draft 호환 API.
  - `frontend/lib/api/stock-requests.ts:22`
  - `frontend/lib/api/stock-requests.ts:29`
  - `frontend/lib/api/stock-requests.ts:32`
  - `frontend/lib/api/stock-requests.ts:77`
  - `frontend/lib/api/stock-requests.ts:80`
  - `frontend/lib/api/stock-requests.ts:104`
- `backend/app/routers/io.py`
  - 입출고 v2 라우터.
  - `backend/app/routers/io.py:30`
  - `backend/app/routers/io.py:45`
  - `backend/app/routers/io.py:83`
  - `backend/app/routers/io.py:113`
  - `backend/app/routers/io.py:136`
  - `backend/app/routers/io.py:156`
- `backend/app/services/io_preview.py`
  - sub_type별 라인 방향/from/to bucket 구성.
  - `backend/app/services/io_preview.py:173`
  - `backend/app/services/io_preview.py:175`
  - `backend/app/services/io_preview.py:177`
  - `backend/app/services/io_preview.py:179`
  - `backend/app/services/io_preview.py:186`
  - `backend/app/services/io_preview.py:195`
  - `backend/app/services/io_preview.py:470`
- `backend/app/services/io_persist.py`
  - IO batch/bundle/line 저장과 StockRequest 상태 동기화.
  - `backend/app/services/io_persist.py:166`
  - `backend/app/services/io_persist.py:201`
  - `backend/app/services/io_persist.py:257`
- `backend/app/models/io_batch.py`
  - 작업 묶음 감사 단위와 라인 스냅샷 모델.
  - `backend/app/models/io_batch.py:29`
  - `backend/app/models/io_batch.py:76`
  - `backend/app/models/io_batch.py:110`
  - `backend/app/models/io_batch.py:149`
- `backend/app/services/io_draft.py`
  - draft 누적/갱신/삭제, 본인 소유 검증.
  - `backend/app/services/io_draft.py:25`
  - `backend/app/services/io_draft.py:34`
  - `backend/app/services/io_draft.py:42`
  - `backend/app/services/io_draft.py:82`
  - `backend/app/services/io_draft.py:95`
- `backend/app/services/io_dispatch.py`
  - 제출 후 창고 결재/부서 결재/즉시 반영 분기와 실제 재고 반영.
  - `backend/app/services/io_dispatch.py:94`
  - `backend/app/services/io_dispatch.py:150`
  - `backend/app/services/io_dispatch.py:183`
  - `backend/app/services/io_dispatch.py:230`
  - `backend/app/services/io_dispatch.py:300`
  - `backend/app/services/io_dispatch.py:315`
  - `backend/app/services/io_dispatch.py:328`
  - `backend/app/services/io_dispatch.py:357`
  - `backend/app/services/io_dispatch.py:453`
  - `backend/app/services/io_dispatch.py:481`
- `backend/app/routers/stock_requests.py`
  - 내 요청/승인함/승인/반려/취소/수정 전환.
  - `backend/app/routers/stock_requests.py:118`
  - `backend/app/routers/stock_requests.py:137`
  - `backend/app/routers/stock_requests.py:183`
  - `backend/app/routers/stock_requests.py:414`
  - `backend/app/routers/stock_requests.py:494`
  - `backend/app/routers/stock_requests.py:574`
  - `backend/app/routers/stock_requests.py:636`
- `backend/app/services/stock_requests.py`
  - 승인 필요 요청 생성, 수동/단품 조정 요청 생성.
  - `backend/app/services/stock_requests.py:181`
  - `backend/app/services/stock_requests.py:239`
- `backend/app/services/sr_validation.py`
  - request_type별 bucket/dept shape 검증과 사전 재고 검증.
  - `backend/app/services/sr_validation.py:129`
  - `backend/app/services/sr_validation.py:201`
  - `backend/app/services/sr_validation.py:278`
- `backend/app/services/sr_approval.py`
  - 부서 승인 시 PIN/권한 확인 후 batch 실행, 요청 취소 시 PIN 확인.
  - `backend/app/services/sr_approval.py:108`
  - `backend/app/services/sr_approval.py:129`
  - `backend/app/services/sr_approval.py:133`
  - `backend/app/services/sr_approval.py:161`
  - `backend/app/services/sr_approval.py:315`

### 삭제 후보

입출고 화면 기준의 1차 삭제/정리 후보:

- `_warehouse_steps/_constants.ts` 안의 옛 작업 유형 상수/타입
  - `WORK_TYPES`, `WorkType`, `Direction`, `TransferDirection`, `DefectiveSource`, `workTypeNeedsDept`, `workTypesForOperator`
  - 현재 화면은 `_warehouse_v2/ioWorkType.ts`의 `IO_WORK_TYPES`를 사용한다.
  - 단, 같은 파일의 `DEPT_OPTIONS`, `PAGE_SIZE`, `matchesSearch`, `canEnterIO`, `isWarehouseStaff`, `isDepartmentApprover`는 현재 입출고/불량 화면에서 사용 중이므로 파일 전체 삭제 금지.
- `frontend/app/mes/_components/_warehouse_steps/EmployeeStep.tsx`
  - 현재 입출고 화면에서는 직원 선택 Step이 보이지 않는다.
  - 삭제 전 전체 import 확인 필요.
- `frontend/lib/io/glossary.ts`의 사용자 표시와 맞지 않는 라벨
  - `adjust_in: "수량보정 입고"`는 현재 화면의 `생산 입고/단품 입고` 흐름과 어휘가 맞지 않는다.
  - `REQUEST_TYPE_LABEL.manual_adjustment: "수동 조정"`은 내 요청 목록에 과거/내부 용어로 노출된다.
  - 삭제보다 먼저 라벨 정리 대상이다.
- `frontend/app/mes/_components/_warehouse_v2/__tests__/warehouseFlow.golden.test.ts`의 오래된 라벨 기대값
  - 현재 UI 기준 라벨로 바꾸면 함께 갱신 필요.
- `frontend/lib/api/stock-requests.ts`의 stock request draft API
  - `DraftCartPanel`이 아직 기존 stock request draft와 IO draft를 합쳐 보여주므로 즉시 삭제 금지.
  - 운영 DB에 기존 DRAFT가 더 이상 없고 신규 작성이 전부 `/api/io/draft`만 사용한다는 확인 후 제거 가능.
- `frontend/lib/api/dept-adjustment.ts`, `backend/app/routers/dept_adjustment.py`, `backend/app/services/dept_adjustment.py`
  - 현재 입출고 작성 화면에서는 사용되지 않는다.
  - 하지만 불량 분해 화면에서 `DisassembleTree`가 `deptAdjustmentApi`를 사용하고 있으므로 불량 화면 기준선 전까지 삭제 금지.

### 개선 후보

- `adjust_in/out`은 내부 sub_type으로는 현재 단품 입고/출고에 쓰이지만, 사용자 표시 라벨 `수량보정`은 현재 화면 언어와 맞지 않는다. 내부 코드값 유지 여부와 화면 라벨 정리를 분리해서 진행한다.
- `MANUAL_ADJUSTMENT`는 결재 요청 type으로 단품 입고/출고 흐름에 쓰인다. 라벨은 `수동 조정`보다 `부서 단품 입출고`처럼 현재 업무 언어에 맞추는 편이 낫다.
- `_warehouse_steps` 폴더는 이름만 보면 과거 구현처럼 보이지만 현재 권한/상수 모듈로 살아 있다. 필요한 상수만 `warehouseShared` 같은 이름으로 옮긴 뒤 옛 work type 상수를 제거하는 순서가 안전하다.
- 일부 파일 주석이 깨져 보인다. 삭제 작업과 별개로 인코딩/주석 정리를 진행하면 추후 코드 리뷰 비용이 줄어든다.
- Step 4에서 `제출확인 →`은 실제 저장이 아니라 Step 5 이동이다. 운영자 혼동을 줄이려면 `최종 확인으로` 같은 문구가 더 명확하다.
- Step 5의 `저장`은 draft 저장이고, 옆 버튼이 실제 결재 요청/즉시 반영이다. `임시저장`처럼 더 명확한 라벨을 검토할 수 있다.
- `내 요청` 목록의 과거 테스트성 notes가 운영 UI에 그대로 보인다. 데이터 정리와 라벨 정리를 구분해서 진행해야 한다.

### 삭제 전 검증 체크리스트

- `/mes?tab=warehouse` 진입 시 `요청 작성`, `작업 중`, `내 요청` 탭이 표시된다.
- 일반 조립 사용자 기준 `요청 작성`에 `창고 입출고`, `부서 입출고`가 표시된다.
- `창고 입출고 → 창고 → 부서 → 조립 → 다음 단계로`가 Step 3으로 이동한다.
- `창고 입출고 → 부서 → 창고 → 조립 → 다음 단계로`가 Step 3으로 이동한다.
- `부서 입출고 → 조립 → 생산 입고 → 다음 단계로`가 Step 3으로 이동한다.
- `부서 입출고 → 조립 → 분해 출고 → 다음 단계로`가 Step 3으로 이동한다.
- Step 3에서 필터, 검색, 순서 편집, `100개 더 보기`가 동작한다.
- Step 3에서 BOM이 없는 품목의 `BOM` 버튼은 비활성화되고 `낱개`는 동작한다.
- Step 3에서 BOM이 있는 품목의 `BOM` 버튼이 동작한다.
- `낱개` 추가 후 Step 4 품목 확인 영역이 열린다.
- Step 4에서 `재고 반영 포함` 체크 해제 시 반영 라인 수가 줄어든다.
- Step 4에서 수량 증감 버튼이 실행 후 수량을 올바르게 갱신한다.
- 재고 부족 라인이 있으면 제출이 차단된다.
- `제출확인 →` 클릭 시 Step 5로 이동하고 아직 DB 반영/요청 생성이 되지 않는다.
- Step 5에서 `저장` 클릭 시 작업 중 draft로 저장된다.
- Step 5에서 결재 요청 버튼 클릭 시 ConfirmModal이 열린다.
- ConfirmModal 취소 시 요청이 생성되지 않는다.
- ConfirmModal 확인 시 창고 결재/부서 결재/즉시 반영 결과가 의도대로 생성된다.
- 창고 결재 요청은 창고 승인함에 나타난다.
- 부서 결재 요청은 부서 승인함에 나타난다.
- 본인 요청은 `내 요청`에 나타난다.
- `내 요청`에서 취소는 PIN 없이는 진행되지 않는다.
- `내 요청`에서 수정 전환은 PIN 없이는 진행되지 않는다.
- `작업 중`에서 이어서 작업이 원래 Step과 품목을 복원한다.
- `작업 중`에서 삭제는 ConfirmModal을 거치고 본인 draft만 삭제된다.
- `_warehouse_steps`의 옛 work type 상수를 제거해도 입출고/불량 화면 권한과 필터가 깨지지 않는다.
- `adjust_in/out` 라벨을 바꿔도 기존 히스토리/요청 목록의 방향과 부호가 깨지지 않는다.

## 불량

상태: 기준선 1차 확정

### 실제 화면에서 확인한 기능

- 첫 화면은 3개 카드로 구성된다.
  - `불량 격리`: 정상 재고에서 품목을 골라 격리 등록
  - `바로 폐기`: 격리 없이 정상 재고에서 즉시 폐기
  - `격리 목록`: 격리 항목 조회, 정상 복귀, 폐기, 반품, 분해 처리 진입
- `불량 격리` 흐름은 2단계다.
  - Step 1: 출처 `부서 재고` / `창고 재고`, 격리 부서 선택
  - Step 2: 부서/모델/단계 필터, 검색, 품목 테이블, `추가`, 장바구니
  - 장바구니: 수량 입력, 사유 카테고리, 메모, 최종 `격리하기` 버튼
- `바로 폐기` 흐름도 2단계다.
  - Step 1: 출처 `부서 재고` / `창고 재고`, 출처 부서 선택
  - Step 2: 품목 선택, 장바구니, 수량/사유/메모, 최종 `즉시 폐기` 버튼
- `격리 목록` 화면은 카드형 목록이다.
  - KPI/필터/정렬 영역이 있다.
  - 항목별로 품목 코드, 품명, 수량, 격리일, `처리` 버튼이 보인다.
- `처리` 버튼은 실제 보이는 버튼 기준으로 `불량 처리` 화면으로 이동한다.
  - 기본 액션: `정상 복귀`, `전체 폐기`
  - BOM 있는 항목: `재작업` 액션 노출
  - 창고 격리 항목: `반품` 액션 노출
  - 처리 수량, 사유 카테고리, 메모를 입력한다.
  - 폐기/반품/재작업은 확인 모달을 거친다.

주의: UI 확인 중 최종 `격리하기`, `즉시 폐기`, `정상 복귀`, `전체 폐기`, `반품`, `즉시 처리`는 누르지 않았다.

### 보존해야 하는 프론트엔드 경로

- `frontend/app/mes/_components/DesktopDefectView.tsx`
  - 허브 카드 선택을 `cart/add`, `cart/scrap`, `list` 뷰로 전환: 220-229
  - 격리 목록의 `처리` 버튼을 `process` 뷰로 전환: 239-241
  - 현행 화면에 `DefectHubEntry`, `DefectCartFlow`, `DefectProcessPanel` 연결: 254-280
  - 격리 목록에 `DefectKpiCards`, `DefectFilterBar`, `DefectDepartmentList` 연결: 303-332
- `frontend/app/mes/_components/_defect_hub/DefectHubEntry.tsx`
  - 첫 화면 3개 카드 렌더링.
- `frontend/app/mes/_components/_defect_hub/defectHubCards.ts`
  - 데스크톱/모바일 불량 허브 카드 메타 공유.
- `frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx`
  - `add`/`scrap` 모드의 제목과 제출 버튼 분기: 47-56
  - `add`는 `defectsApi.quarantine`, `scrap`은 `stockRequestsApi.createStockRequest(request_type="scrap_normal")`: 140-169
  - 출처/부서 선택 UI: 247-288
  - 최종 확인 모달: 478-494
- `frontend/app/mes/_components/_defect_hub/DefectItemPicker.tsx`
  - 불량 격리/바로 폐기 품목 선택기.
  - 필터, 검색, `PAGE_SIZE`, `matchesSearch`, `DEPT_OPTIONS` 의존: 52, 98, 156, 412, 420
- `frontend/app/mes/_components/_defect_hub/DefectDepartmentList.tsx`
  - 격리 항목 카드 목록과 `처리` 버튼: 68, 125, 142-153
- `frontend/app/mes/_components/_defect_hub/DefectProcessPanel.tsx`
  - 정상 복귀/폐기/반품/분해 요청 분기: 60-110
  - 액션 카드 표시 조건: 321-352
  - 최종 처리 버튼과 확인 모달: 406-436
- `frontend/app/mes/_components/_defect_hub/DisassembleTree.tsx`
  - 재작업/분해 시 BOM 하위 항목 결정 UI.
  - `deptAdjustmentApi.getBomTemplate` 호출: 109, 269
- `frontend/app/mes/_components/mobile/screens/MobileDefectScreen.tsx`
  - 모바일 불량 화면은 `DefectHubPanel`을 사용한다. 모바일 감사 전까지 보존.
- `frontend/app/mes/_components/_defect_hub/DefectHubPanel.tsx`
  - 모바일 불량 허브/목록/처리 흐름의 통합 패널. 모바일 감사 전까지 보존.
- `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx`
  - 모바일 전용 격리/바로 폐기 흐름. 모바일 감사 전까지 보존.
- `frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx`
  - 모바일 전용 격리 항목 처리 패널. 모바일 감사 전까지 보존.

### 보존해야 하는 API/백엔드 경로

- `frontend/lib/api/defects.ts`
  - `listDefects`: 14-17
  - `getDefectKpi`: 24-25
  - `quarantine`: 30-31
  - `unquarantine`: 36-37
- `frontend/lib/api/stock-requests.ts`
  - 불량 폐기/반품/분해/바로 폐기 요청 생성 경로에서 `createStockRequest` 사용: 19
- `backend/app/main.py`
  - `/api/dept-adjustment`, `/api/defects` 라우터 등록: 288-289
- `backend/app/routers/defects.py`
  - 격리 목록 조회: 112-173
  - 격리 등록: 222-317
  - 정상 복귀: 329-393
- `backend/app/services/inv_defective.py`
  - 정상 재고에서 격리 이동: 80-155
  - 불량에서 정상 복귀: 203-241
  - 불량 폐기: 244-277
  - 정상 재고 바로 폐기/반품 공통 진입: 364-403
- `backend/app/services/stock_requests.py`
  - 불량 관련 요청 타입은 승인 없이 즉시 완료되도록 분기: 200-236
- `backend/app/services/sr_execution.py`
  - `DEFECT_SCRAP`, `DEFECT_RETURN`, `SCRAP_NORMAL`, `RETURN_NORMAL`, `DEFECT_DISASSEMBLE` 실행 핸들러 연결: 257-272
  - `DEFECT_DISASSEMBLE`은 notes의 `child_decisions`를 읽고 `submit_defective_disassemble` 호출: 213-254
- `backend/app/services/dept_adjustment.py`
  - 격리 항목 분해 처리 본체: 298-336, 342-468
- `backend/app/services/sr_validation.py`
  - 불량 요청 타입은 shape 검증을 우회: 188-193
  - 대신 `from_bucket=DEFECTIVE` 라인에 대해 격리 재고 사전 검증: 326-356

### 삭제 후보

- 현재 데스크톱/모바일 실제 진입 경로에서 import되지 않는 구형 불량 모달/패널 후보.
  - `frontend/app/mes/_components/_defect_hub/AddQuarantineModal.tsx`
  - `frontend/app/mes/_components/_defect_hub/AddRDirectModal.tsx`
  - `frontend/app/mes/_components/_defect_hub/RDefectActionModal.tsx`
  - `frontend/app/mes/_components/_defect_hub/RDefectActionPanel.tsx`
  - `frontend/app/mes/_components/_defect_hub/PaPfDefectWizard.tsx`
  - `frontend/app/mes/_components/_defect_hub/PaPfDefectWizardPanel.tsx`
  - `frontend/app/mes/_components/_defect_hub/DefectBatchConfirm.tsx`
- 위 후보들은 현재 비테스트 코드에서 자기 자신 정의 외 사용처가 발견되지 않았다.
  - `rg -n "AddQuarantineModal|AddRDirectModal|RDefectActionModal|RDefectActionPanel|PaPfDefectWizard|PaPfDefectWizardPanel|DefectBatchConfirm" frontend/app frontend/lib -g "!**/__tests__/**"`
- 다만 해당 후보를 삭제하면 연결된 오래된 테스트도 같이 정리해야 한다.
  - `AddQuarantineModal.test.tsx`
  - `RDefectActionModal.test.tsx`
  - `PaPfDefectWizard.test.tsx`
- `frontend/lib/api/dept-adjustment.ts`의 `expandComponent`, `submit` export는 현재 프론트 비테스트 코드에서 직접 호출이 확인되지 않았다.
  - 단, `getBomTemplate`은 `DisassembleTree`에서 실제 사용 중이므로 파일 전체 삭제 금지.
  - 백엔드 `/api/dept-adjustment/submit`, `/api/dept-adjustment/expand-component` 삭제 여부는 외부 호출/테스트/운영 데이터 경로까지 별도 확인 필요.
- `_warehouse_steps/_constants.ts`는 불량 품목 선택기에서도 `DEPT_OPTIONS`, `PAGE_SIZE`, `matchesSearch`를 사용하므로 파일 전체 삭제 금지.
  - 단, 이 파일 안의 오래된 `WORK_TYPES` 계열은 별도 삭제 후보로 계속 추적.

### 개선 후보

- `DefectCartFlow`의 출처 설명 문구가 `바로 폐기` 모드에서도 “불량을 격리합니다”로 표시된다.
  - 실제 화면에서 확인됨.
  - 코드상 설명 문구는 mode와 무관하게 격리 설명을 사용: `DefectCartFlow.tsx` 251-254
  - 개선: `mode === "scrap"`일 때 “정상 재고에서 즉시 폐기합니다” 계열로 분기.
- `DesktopDefectView.tsx` 일부 사용자-facing 문자열이 깨져 보이는 상태다.
  - `handleProcessed` 메시지와 목록 제목/로딩 문구 주변: 269-280, 296-323
  - 실제 화면은 정상 표시될 수 있으나 소스 관리 관점에서는 UTF-8 깨짐을 정리해야 한다.
- `DefectDepartmentList.tsx`의 `처리 버튼 (Phase 5 placeholder)` 주석은 현재 기능이 실제 연결되어 있어 오래된 주석이다: 142
  - 개선: 주석 삭제 또는 현재 의미로 수정.
- 불량 관련 `stockRequests` 요청 타입은 shape 검증을 우회한다: `sr_validation.py` 188-193
  - 재고 사전 검증은 존재하지만, shape 자체가 느슨하다.
  - 개선: `defect_scrap`, `defect_return`, `defect_disassemble`, `scrap_normal`, `return_normal`에 최소 shape 검증을 명시하는 것이 운영 안전성 측면에서 좋다.
- 격리 등록/정상 복귀는 `/api/defects`에서 직접 즉시 커밋하고, 폐기/반품/분해/바로 폐기는 `stockRequests` 생성 후 즉시 완료되는 혼합 구조다.
  - 기능상 동작은 연결되어 있으나 감사 추적/일관성 관점에서는 “직접 defects API”와 “stock request API”의 책임 분리가 불명확하다.
  - 개선 방향: 당장 통합 리팩터링보다, 먼저 TransactionLog/StockRequest 표시 기준과 이력 화면 라벨을 점검한다.

### 삭제 전 검증 체크리스트

1. `불량` 첫 화면 3개 카드가 그대로 보이는지 확인한다.
2. `불량 격리`에서 출처/부서 선택, 품목 추가, 장바구니 수량/사유/메모, 최종 확인 모달이 그대로 동작하는지 확인한다.
3. `바로 폐기`에서 같은 흐름이 유지되고 최종 버튼이 `즉시 폐기`로 표시되는지 확인한다.
4. `격리 목록`에서 KPI/필터/정렬/카드 목록/`처리` 버튼이 그대로 보이는지 확인한다.
5. `처리` 진입 시 `불량 처리` 화면으로 이동하고, 정상 복귀/폐기/재작업/반품 노출 조건이 유지되는지 확인한다.
6. BOM 있는 격리 항목에서 `재작업` 선택 시 `DisassembleTree`가 `deptAdjustmentApi.getBomTemplate`으로 하위 항목을 불러오는지 확인한다.
7. 구형 모달/패널 삭제 후 `rg`로 비테스트 import가 0건인지 확인한다.
8. 구형 테스트 삭제/수정 후 불량 관련 테스트를 실행한다.
9. `dept-adjustment`의 `expand-component`/`submit` 삭제 여부는 별도 단계로 분리하고, 삭제 전 라우터 테스트/서비스 테스트/외부 API 호출 가능성을 확인한다.
10. 불량 흐름은 실제 재고를 바꾸는 기능이므로 수동 검증에서는 최종 실행 버튼을 누르지 않거나, 별도 테스트 DB에서만 누른다.
## 입출고 내역

상태: 기준선 1차 확정

### 실제 화면에서 확인한 기능

- 화면 상단 KPI는 선택 기간 기준으로 `전체`, `창고`, `부서`, `수량조정` 건수를 보여준다.
  - 확인 시점 화면: `이번달 132건 / 전체 132건`, `창고 32건`, `부서 66건`, `수량조정 4건`
- 검색 입력 placeholder는 `품명 · 코드 · 담당자 · 참조번호 · 메모`다.
- 빠른 기간 버튼은 `전체`, `오늘`, `이번주`, `이번달`이다.
- `필터` 패널은 3개 그룹으로 구성된다.
  - 부서 구분: `전체`, `조립`, `창고`, `진공`, `튜닝`, `미상`, `출하`, `고압`
  - 모델 구분: `전체`, `DX3000`, `SOLO`, `COCOON`, `ADX4000W`, `ADX6000FB`, `신제품`
  - 거래 종류: `전체`, `원자재 입고`, `생산 | 입고`, `출고`, `자동 차감`, `창고 반출`, `창고 반입`, `부서 이동`, `분해 | 출고`, `수량 조정`, `새 불량`, `불량 해제`, `불량 처리`, `원자재 반품`
- `달력` 패널은 월 단위로 날짜별 거래 건수와 `창고`/`부서`/`조정` 분류를 보여준다.
  - 예: `2026년 6월 1일`에 총 82건, `창고 31건`, `부서 36건`
- 테이블 컬럼은 `요청 일시`, `구분`, `품목명`, `변동요약`, `요청자`, `메모`다.
- 기본 목록은 100건 단위로 보이며 `100 / 132건`처럼 현재 로드 수와 조건 전체 수를 같이 보여준다.
- `전체 펼치기`를 누르면 묶음 거래가 펼쳐지고 버튼은 `전체 접기`로 바뀐다.
  - 생산 묶음은 `BOM` 하위 행을 표시한다.
  - 재작업 묶음은 `회수`, `폐기` 하위 행을 표시한다.
- 단건 행을 선택하면 오른쪽 상세 패널이 열린다.
  - 확인한 상세 내용: 품목명, 거래 라벨, 처리 전/후 수량, 부서, 품목 코드, 요청자, 요청 시각, 승인자, 승인 시각, `취소` 버튼
- `취소`는 즉시 실행 버튼으로 보이지만, 코드상 사유/PIN 입력 후 `취소 확정`을 눌러야 API가 호출된다.

주의: UI 확인 중 `취소 확정`은 누르지 않았다.

### 보존해야 하는 프론트엔드 경로

- `frontend/app/mes/_components/DesktopHistoryView.tsx`
  - 입출고 내역 화면의 최상위 오케스트레이션 컴포넌트: 24
  - `HistoryFilterBar`, `HistoryFilterPanel`, `HistoryCalendarPanel`, `HistoryStatsBar`, `HistoryTable`, `DesktopHistoryRightPanel` 연결: 8-13, 340-418
  - `useHistoryData`로 서버사이드 필터/페이지네이션 조회: 78-84
  - 단건 선택과 묶음 선택을 오른쪽 패널 상태로 관리: 262-273
- `frontend/app/mes/_components/_hooks/useHistoryData.ts`
  - 서버사이드 필터, 페이지네이션, stale 응답 방어 훅: 31-37
- `frontend/app/mes/_components/_history_sections/HistoryStatsBar.tsx`
  - 상단 KPI 표시.
- `frontend/app/mes/_components/_history_sections/HistoryFilterBar.tsx`
  - 검색, 기간 버튼, 필터/달력 토글.
- `frontend/app/mes/_components/_history_sections/HistoryFilterPanel.tsx`
  - 부서/모델/거래 종류 필터.
- `frontend/app/mes/_components/_history_sections/HistoryCalendarPanel.tsx`
  - 달력 패널 본체: 32
- `frontend/app/mes/_components/_history_sections/HistoryCalendarStrip.tsx`
  - 월 달력/날짜별 카운트 표시: 48
- `frontend/app/mes/_components/_history_sections/HistoryTable.tsx`
  - 테이블 본체: 58
  - `buildGroups`로 `operation_batch_id`와 `reference_no` 묶음 구성: 97
  - 우측 패널 열림 여부에 따라 compact 컬럼 사용: 227-229
  - `OpBatchHeader`, `BomBatchDetail`, `ReworkBatchHeader`, `ReworkBatchDetail`, `BatchHeader` 연결: 313-378
- `frontend/app/mes/_components/_history_sections/historyTableHelpers.tsx`
  - `operation_batch_id` 우선, 없으면 `reference_no` 기준으로 그룹 구성: 116-149
  - 레거시 `reference_no` 기반 묶음 헤더도 현재 재작업 표시를 위해 사용: 231-236
  - `operation_batch_id` 기반 묶음 헤더: 321-326
- `frontend/app/mes/_components/_history_sections/HistoryDetailPanel.tsx`
  - 단건 상세 패널.
  - 수정 이력 조회: 52-63
  - 취소 요청의 사유/PIN 입력과 `api.cancelTransaction` 호출: 112-128, 170-205
  - 취소된 거래 표시: 149
- `frontend/app/mes/_components/_history_sections/HistoryBatchDetailPanel.tsx`
  - 묶음 상세 패널.
  - 묶음 취소도 첫 로그의 `log_id`로 `api.cancelTransaction` 호출: 110-126
  - 사유/PIN 입력과 `취소 확정` 버튼: 171-206
- `frontend/app/mes/_components/_history_sections/DesktopHistoryRightPanel.tsx`
  - 오른쪽 상세 패널에서 단건 상세/묶음 상세를 전환: 33, 94
- `frontend/app/mes/_components/_history_sections/historyBatchInterpreter.ts`
  - 거래 타입/배치 subtype을 화면 라벨, 흐름, 변동요약으로 변환: 198-254, 291-313, 593-651, 680-696
- `frontend/app/mes/_components/_history_sections/transactionTaxonomy.ts`
  - 창고/부서/조정/예외성 거래 분류: 37-52
  - `DISASSEMBLE`, `TRANSFER_DEPT`를 주요 칩에서 숨기는 정책: 60-87
- `frontend/app/mes/_components/mobile/screens/MobileHistoryScreen.tsx`
  - 모바일 입출고 내역 화면. 모바일 감사 전까지 보존.
- `frontend/app/mes/_components/mobile/history/MobileHistoryList.tsx`
  - 모바일 카드형 내역 리스트. 모바일 감사 전까지 보존.

### 보존해야 하는 API/백엔드 경로

- `frontend/lib/api/production.ts`
  - `getTransactions`: 56
  - `getTransactionsSummary`: 95
  - `getTransactionEdits`: 154-155
  - `cancelTransaction`: 172-177
  - `getMonthlyTransactionCounts`: 183
  - `getTransactionsExportUrl`: 193-213
- `frontend/lib/queries/useTransactionsQuery.ts`
  - 현재 데스크톱/모바일 내역 화면의 월별 카운트 훅 사용: `DesktopHistoryView.tsx` 16, 134 / `MobileHistoryScreen.tsx` 17, 130
- `backend/app/routers/inventory/transactions.py`
  - 월별 카운트: 162-185
  - 거래 목록 조회: 188-287
  - KPI/필터용 summary 조회: 290-364
  - CSV export: 367-451
  - XLSX export: 454-554
  - 수정 이력 조회: 635-650
  - 거래 취소: 951-1064
- `backend/app/routers/inventory/_tx_filters.py`
  - summary 분류 타입: 29-47
  - 부서 라벨 계산: 50-74
  - 프론트 라벨과 맞춰야 하는 subtype/transaction_type 표시 라벨: 147-175
  - 목록/summary 공통 필터 빌더: 237
- `backend/app/models/transaction.py`
  - 취소 상태 필드와 취소 사유/처리자/시각: 83-90
  - `inventory_effect`로 재고 효과를 기록: 91-94
- `backend/app/services/inv_effect.py`
  - 거래가 건드린 재고 셀의 차이를 `inventory_effect`로 기록한다는 설계 설명: 3-10
  - 취소 시 `inventory_effect`를 부호 반전해 창고/박스/부서 위치 재고에 적용: 103-161

### 삭제/정리 후보

- `frontend/app/mes/_components/_history_sections/HistoryDetailRecentLogs.tsx`
  - 현재 비테스트 코드에서 자기 자신 정의 외 사용처가 발견되지 않았다.
  - 확인 명령: `rg -n "HistoryDetailRecentLogs" frontend/app frontend/lib`
- 거래 메타 수정/수량 보정 프론트 훅과 API는 현재 입출고 내역 실제 화면에서 노출되지 않는다.
  - API 정의: `frontend/lib/api/production.ts` 137-168
  - React Query 훅 정의: `frontend/lib/queries/useProductionQuery.ts` 100-125, `frontend/lib/queries/useTransactionsQuery.ts` 55-85
  - 비테스트 화면에서 직접 사용하는 곳은 현재 발견되지 않았다.
  - 백엔드 엔드포인트와 테스트는 남아 있으므로 즉시 삭제보다 “운영에서 숨긴 과거 기능인지, 외부 호출이 있는지” 확인 후 잠금/삭제를 결정한다.
- `frontend/lib/queries/useProductionQuery.ts`와 `frontend/lib/queries/useTransactionsQuery.ts`에 거래 관련 훅이 중복으로 존재한다.
  - `useProductionQuery.ts`는 생산능력/PIN 관련 훅도 실제 사용 중이므로 파일 전체 삭제 금지.
  - 개선 방향: 거래 내역 관련 훅은 `useTransactionsQuery.ts`로 모으고, 미사용 거래 수정/보정 훅은 별도 삭제 후보로 분리.
- `historyTableHelpers.tsx`의 `BatchHeader`는 주석상 “레거시 reference_no 기반 묶음”이지만 현재 재작업 묶음 표시에서 여전히 필요하다: 231-236
  - 이름/주석은 오래되어 보이지만 즉시 삭제 후보가 아니다.
  - 개선 방향: 삭제가 아니라 `reference_no` 기반 재작업 묶음이라는 현재 의미로 이름/주석 정리.
- 거래 종류 라벨 중 `분해 | 출고`, `수량 조정`, `새 불량` 등은 과거 화면 기능처럼 보일 수 있으나, 실제 TransactionLog 타입을 사람이 읽게 만든 라벨이다.
  - 프론트 라벨 변환: `historyBatchInterpreter.ts` 198-254, 680-696
  - 백엔드 라벨 변환: `_tx_filters.py` 147-175
  - 삭제보다 라벨 일관성 점검 대상이다.

### 운영 안전성 평가 메모

- 긍정적 요소:
  - 목록 조회와 summary 조회가 같은 공통 필터 빌더를 사용한다: `transactions.py` 238, 318
  - 목록은 `operation_batch_id`를 `IoBatch`와 outer join해서 요청자/승인자를 채운다: `transactions.py` 217-224, 269-285
  - 취소는 로그만 숨기지 않고 재고 효과를 역방향 적용한다: `transactions.py` 823-827, `inv_effect.py` 103-161
  - 묶음 작업은 `operation_batch_id` 또는 `defect-disassemble:` reference_no 단위로 함께 취소한다: `transactions.py` 1014-1037
  - 취소 후 `cancelled`, `cancel_reason`, `cancelled_by`, `cancelled_at`을 남긴다: `transactions.py` 1050-1053
- 위험/확인 요소:
  - `inventory_effect`가 없는 과거 로그는 자동 취소가 거부된다. 운영 자동 취소는 `inventory_effect`의 실제 재고 셀 증감만 신뢰한다.
  - 취소 권한은 요청자 본인 또는 창고/부서 결재 권한자로 판단한다: `transactions.py` 984-1010
  - 요청자 식별이 `producer_employee_id`, `IoBatch.requester_employee_id`, `produced_by 이름` 순으로 fallback된다: `transactions.py` 984-1004
  - 이름 fallback은 과거 데이터 호환에는 필요하지만 동명이인/이름 변경에는 약하다. 운영 신뢰성 강화 단계에서 `producer_employee_id` 기록 누락 경로를 줄이는 것이 좋다.
  - 메타 수정/수량 보정 API는 화면에는 없는데 백엔드에는 남아 있다. 운영에서 사용하지 않을 기능이면 삭제 전 잠금 또는 관리자 전용 명시가 필요하다.

### 삭제 전 검증 체크리스트

1. 기본 진입 시 `입출고 내역` KPI, 검색, 기간 버튼, 필터, 달력, 테이블이 그대로 보이는지 확인한다.
2. `필터` 패널에서 부서/모델/거래 종류를 조합했을 때 목록 건수와 KPI 건수가 같은 조건으로 갱신되는지 확인한다.
3. `달력` 패널에서 월 이동, 날짜 선택, 날짜별 카운트 표시가 유지되는지 확인한다.
4. `전체 펼치기`/`전체 접기`가 생산 BOM 묶음과 재작업 묶음을 모두 안정적으로 펼치고 접는지 확인한다.
5. 단건 행 선택 시 오른쪽 상세 패널이 열리고 처리 전/후 수량, 요청자/승인자, 메모, 수정 이력이 정상 표시되는지 확인한다.
6. 묶음 행 선택 시 오른쪽 묶음 상세 패널이 열리고, 묶음 안의 하위 라인 수량이 표와 일치하는지 확인한다.
7. 취소 UI는 별도 테스트 DB에서만 검증한다. 사유/PIN 없이 `취소 확정`이 비활성화되는지 먼저 확인한다.
8. 취소 검증 시 `inventory_effect`가 있는 최신 로그와 없는 과거 로그를 나눠 테스트한다.
9. `HistoryDetailRecentLogs.tsx` 삭제 전후 `rg -n "HistoryDetailRecentLogs" frontend/app frontend/lib`가 0건인지 확인한다.
10. 메타 수정/수량 보정 API 삭제 또는 잠금 전, 프론트 비테스트 참조 0건과 백엔드 테스트/외부 호출 가능성을 별도 확인한다.
## 창고 지도

상태: 기준선 1차 확정

### 실제 화면에서 확인한 기능

- 일반 직원 계정에서는 보기 전용 창고 지도가 열린다.
  - 확인 시점 작업자: `김현우 · 조립`
  - URL: `/mes?tab=warehouseMap`
- 상단에는 검색창이 있고 placeholder는 `품목명·코드 검색 (/)`다.
- 첫 화면은 평면도 형태이며 `앵글 1`부터 `앵글 9`까지 버튼이 보인다.
  - 예: `앵글 1 6열·6층`, `앵글 7 3열·6층`, `앵글 9 4열·6층`
  - 하단에 `▼ 입구` 표시가 있다.
- 앵글을 선택하면 `뒤로`, breadcrumb, 검색창, `앵글 N 정면도`가 보인다.
  - `앵글 1`은 A~F열, 1~6층 셀로 표시된다.
  - 각 셀에는 품목 코드가 여러 개 표시되고, hover 시 품명/수량 tooltip이 뜬다.
- 검색창에 품목 코드를 입력하면 검색 결과와 위치 버튼이 나타난다.
  - 확인 예: `348-AR-0722` 검색 시 `D-910 크래들 TOP 사출 · 348-AR-0722`, `앵글 1 · B열 · 3층 ×200`이 표시됨.
- 검색 결과 위치를 기준으로 줄/층 상세와 오른쪽 패널이 열린다.
  - 오른쪽 패널에는 `앵글 1 · B열 · 3층`, 자리 1~3, 박스 크기, 품목명, 수량이 표시된다.
  - 보기 전용 계정에서는 박스 추가/삭제/편집 버튼은 노출되지 않았다.

주의: UI 확인 중 박스 생성/수정/삭제/이동 같은 쓰기 동작은 수행하지 않았다.

### 보존해야 하는 프론트엔드 경로

- `frontend/app/mes/_components/DesktopMesShell.tsx`
  - `warehouseMap` 탭을 `DesktopWarehouseMapTab`으로 연결: 11, 30, 186-187
- `frontend/app/mes/_components/DesktopSidebar.tsx`
  - 사이드바의 `창고 지도` 탭 정의: 10, 20
- `frontend/app/mes/_components/DesktopWarehouseMapTab.tsx`
  - 일반 직원은 읽기 전용 지도만 보여준다는 의도 주석: 3-8
  - 창고 정/부관리자만 편집 가능: 37-39
  - 편집 모드 PIN 확인 후 `registerOperatorCredsProvider`로 쓰기 헤더 주입: 61-67, 71-84
  - `박스 관리`/`앵글 편집` 관리자 탭: 27-29, 184-197
  - 편집 모드에서 `DesktopWarehouseMapView editable` 또는 `AdminWarehouseStructureSection` 렌더: 243-255
  - 일반 보기 모드에서 `DesktopWarehouseMapView` 렌더: 259
- `frontend/lib/api-core.ts`
  - 창고 지도 쓰기용 `X-Employee-Code`, `X-Operator-Pin` 헤더 provider: 123-139
- `frontend/app/mes/_components/DesktopWarehouseMapView.tsx`
  - 창고 지도 본체: 30
  - `warehouseMapApi.getMap`으로 통합 지도 데이터 조회: 70-80
  - `FloorStage`, `FrontStage`, `RowStage`, `WarehouseJariPanel`, `AddBoxScreen` 연결: 17-20, 497, 805-837
  - `/` 키 검색 focus, Esc 닫기: 271-286
  - 브라우저 뒤로가기와 stage 상태 동기화: 288-312
  - 앵글/셀/줄/층 이동 state와 history push: 315-349
  - 검색 결과 선택 시 해당 앵글/줄/층/패널로 이동: 455-468
  - 편집 모드 박스 생성/수정/삭제/이동/재적재 API 호출: 105-145, 194-258
- `frontend/app/mes/_components/_warehouse_map_sections/WarehouseStages.tsx`
  - 평면도 `FloorStage`: 15
  - 앵글 정면도 `FrontStage`: 164
  - 줄 확대/드래그 이동 `RowStage`: 319-340, 527-588
- `frontend/app/mes/_components/_warehouse_map_sections/WarehouseJariPanel.tsx`
  - 위치 상세 패널. 보기 전용/편집 모드 공용: 14-25
- `frontend/app/mes/_components/_warehouse_map_sections/JariColumn.tsx`
  - 자리별 박스 스택, hover tooltip, 드래그 가능 박스 렌더: 19-24, 155-205
- `frontend/app/mes/_components/_warehouse_map_sections/AddBoxScreen.tsx`
  - 관리자 편집 모드에서 박스 넣기/박스 편집 화면: 27, 189-198
  - 검색한 품목의 배치/창고 수량 대조를 위해 `warehouseMapApi.reconcile` 사용: 56-64, 91-94
- `frontend/app/mes/_components/_warehouse_map_sections/helpers.ts`
  - `cellKey`, `rowLabel`, `buildCellIndex`, `jariStacks`, `cellColor` 등 지도 순수 헬퍼: 12-32, 61
- `frontend/app/mes/_components/mobile/screens/MobileWarehouseMapScreen.tsx`
  - 모바일 창고 지도 화면. 모바일 감사 전까지 보존.

### 보존해야 하는 API/백엔드 경로

- `frontend/lib/api/warehouse-map.ts`
  - 지도 조회: `getMap` 73
  - 구조 조회: `getStructure` 74
  - 배치/창고 수량 대조: `reconcile` 75-77
  - 특정 자리 조회: `getJari` 79-82
  - 앵글 생성/수정/삭제/순서 변경: 85-92
  - 박스 생성/수정/이동/재적재/삭제: 95-117
- `backend/app/main.py`
  - `/api/warehouse-map` 라우터 등록: 54, 290
- `backend/app/dependencies/warehouse_manager.py`
  - `require_warehouse_manager`가 창고 정/부관리자와 본인 PIN을 검증: 37
- `backend/app/routers/warehouse_map/query.py`
  - 박스 추적 설정 조회: 22-25
  - 구조 조회: 28-35
  - 지도 통합 데이터 조회: 38-41
  - 배치/창고 수량 대조: 44-50
  - 특정 자리 조회: 53-75
- `backend/app/routers/warehouse_map/angles.py`
  - 앵글 생성/순서 변경/수정/삭제는 모두 `require_warehouse_manager` 의존: 24-27, 52-55, 66-70, 84-87
  - 박스가 남은 앵글 삭제 차단: 94-98
- `backend/app/routers/warehouse_map/boxes.py`
  - 박스 자동 차감 플래그는 admin PIN으로만 변경: 37-49
  - 박스 생성/수정/이동/재적재/삭제는 `require_warehouse_manager` 의존: 92-95, 135-139, 165-169, 215-218, 252-255
  - 자리 용량 초과 차단 로직: 64-77, 189-193, 231-238
- `backend/app/services/warehouse_map.py`
  - 박스 크기 단위와 자리 용량: 35-37
  - 박스 추적 플래그 기본값은 OFF: 50-60
  - 박스 합계 계산: 81-88
  - 창고 출고 시 박스 수량 차감 순서: 91-118
  - 지도 통합 payload 생성: 145-192
  - 배치 수량 합과 창고 재고 대조: 195-213
- `backend/app/models/warehouse.py`
  - 구조와 배치를 분리한다는 모델 설명: 1-10
  - `WarehouseAngle`: 48-82
  - `WarehouseBox`: 좌표 기반 박스와 좌표 index/check constraint: 85-125
  - `WarehouseBoxItem`: 박스 안 품목/수량과 item index/check constraint: 129-153
- `backend/app/schemas/warehouse.py`
  - 앵글/박스/자리 이동/재적재/박스 추적 응답/요청 스키마: 15-131

### 삭제/정리 후보

- 현재 창고 지도 화면에서 파일 단위 삭제 후보는 확인되지 않았다.
  - `_warehouse_map_sections` 하위 파일 6개는 모두 데스크톱 또는 모바일 창고 지도에서 실제 import된다.
  - 확인 명령: `rg -n "AddBoxScreen|WarehouseJariPanel|FloorStage|FrontStage|RowStage|JariColumn|buildCellIndex|cellColor|cellKey|rowLabel" frontend/app frontend/lib -g "!**/__tests__/**"`
- 보기 전용 계정에서 보이지 않는 `AddBoxScreen`, 드래그 이동, `AdminWarehouseStructureSection`은 관리자 편집 모드에서 연결되어 있으므로 삭제 후보가 아니다.
- `getJari` API는 현재 데스크톱/모바일 화면에서 직접 호출되는 흔적이 약하다.
  - 단, 특정 자리 조회용 공개 API이며 백엔드 테스트가 있으므로 삭제 후보가 아니라 “사용처 재확인 후보”로 둔다.
- `box-tracking` 플래그는 현재 일반 화면에서 보이지 않지만, 창고 출고 시 박스 수량 자동 차감과 연결되어 있어 삭제 금지.

### 운영 안전성 평가 메모

- 긍정적 요소:
  - 일반 조회와 관리자 편집이 한 탭 안에서 권한으로 분리되어 있다: `DesktopWarehouseMapTab.tsx` 37-39, 243-259
  - 쓰기 API는 창고 관리자 PIN 헤더를 요구한다: `api-core.ts` 123-139, `warehouse_manager.py` 37
  - 박스 자동 차감은 기본 OFF라서 배치가 덜 된 상태에서 운영 흐름을 갑자기 막지 않는다: `warehouse_map.py` 53-60
  - 자동 차감 ON 상태에서는 박스 합 부족을 차단하고, 차감 효과가 `inventory_effect`에 포함되어 취소 역재생 대상이 된다: `test_warehouse_box_depletion.py` 4-6, 165-183
  - 박스와 창고 재고 대조 API가 있어 “박스 합 != 창고 재고”를 운영자가 볼 수 있다: `query.py` 44-50, `warehouse_map.py` 195-213
- 위험/확인 요소:
  - 창고 지도는 물리적 위치 데이터와 창고 수량이 따로 존재한다. 운영 신뢰성을 높이려면 `reconcile` 불일치가 0인지 확인한 뒤 박스 자동 차감을 켜야 한다.
  - `box-tracking`을 켜면 창고 출고가 박스 배치 수량 부족 때문에 막힐 수 있다. 켜기 전 전 품목 배치 완료/불일치 해결 체크가 필요하다.
  - 박스 생성/수정은 현재 박스 수량이 창고 재고를 초과하지 않도록 프론트에서 대조 정보를 보여주지만, 백엔드에서 품목별 총합 상한을 강제하는지 추가 확인이 필요하다.
  - 관리자 편집 UI는 실수로 위치 데이터를 바꿀 수 있으므로 편집 모드 진입/종료, PIN 재검증, 실패 롤백 확인이 필요하다.

### 삭제 전 검증 체크리스트

1. 일반 직원으로 `창고 지도` 진입 시 앵글 평면도와 검색창이 보이는지 확인한다.
2. 앵글 선택 시 정면도(A~F열, 1~6층 등)가 보이고 breadcrumb/뒤로 버튼이 동작하는지 확인한다.
3. 셀 선택 시 오른쪽 위치 상세 패널이 열리고 자리별 박스/품목/수량이 표시되는지 확인한다.
4. 품목 코드/품명 검색 시 검색 결과, 위치 버튼, 해당 위치 이동, panel 표시가 동작하는지 확인한다.
5. 모바일 감사 전까지 모바일 창고 지도 공용 컴포넌트는 삭제하지 않는다.
6. 창고 관리자 계정으로 편집 모드 진입/PIN 검증/편집 모드 종료가 동작하는지 별도 확인한다.
7. 관리자 편집 모드에서 박스 생성/수정/삭제/이동/재적재는 테스트 DB에서만 검증한다.
8. `reconcile` 결과가 창고 수량과 박스 합을 올바르게 비교하는지 확인한다.
9. `box-tracking` 활성화 전 전체 불일치가 0인지 확인하는 운영 절차가 있는지 확인한다.
10. 창고 지도 정리 후 `backend/tests/test_warehouse_map.py`와 `backend/tests/test_warehouse_box_depletion.py`를 실행한다.
## 관리

상태: 기준선 1차 확정

검증 보강: 2026-06-25 Playwright로 `/mes?tab=admin` 진입 후 관리자 PIN `0000`을 입력해 실제 unlocked 화면 렌더를 확인했다. `모델 관리` 기본 섹션과 사이드바 8개 섹션이 표시됐다. 이전 미확인은 PIN 문제가 아니라 Chrome 자동제어/백엔드 포트 불일치로 인한 검증 도구 문제였다.


### Playwright 검증 결과

- 검증 URL: `http://127.0.0.1:3001/mes?tab=admin`
- 프론트 rewrite 기준 백엔드: `http://localhost:8011`
- 관리자 PIN API 확인: `POST /api/settings/verify-pin` with `0000` 성공
- 실제 화면 확인 결과:
  - 관리자 PIN 화면 표시
  - 키패드 `0000` 입력 성공
  - 기본 섹션 `모델 관리` 표시
  - 사이드바 섹션 `모델 관리`, `품목 관리`, `직원 관리`, `부서 관리`, `BOM 관리`, `내보내기`, `외부 제출용 로그`, `보안` 표시
  - 관리자 잠금 표시

- 세부 섹션 본문 렌더 확인 결과:
  - `모델 관리` 클릭 후 본문 고유 문구 `모델 목록` 표시 1건
  - `품목 관리` 클릭 후 본문 고유 문구 `품목 목록` 표시 1건
  - `직원 관리` 클릭 후 본문 고유 문구 `직원 목록` 표시 1건
  - `부서 관리` 클릭 후 본문 고유 문구 `부서 목록` 표시 1건
  - `BOM 관리` 클릭 후 본문 고유 문구 `BOM 내보내기` 표시 1건
  - `내보내기` 클릭 후 본문 고유 문구 `전체 데이터 내보내기` 표시
  - `외부 제출용 로그` 클릭 후 본문 고유 문구 `외부 제출용 입출고 로그` 표시 1건
  - `보안` 클릭 후 본문 고유 문구 `관리자 PIN 변경` 표시 1건
### 실제 화면/렌더 기준선

- `/mes?tab=admin`은 데스크톱 셸의 정식 탭이다.
  - 탭 목록 포함: `frontend/app/mes/_components/DesktopMesShell.tsx` 30
  - 탭 타이틀은 `관리자`: `DesktopMesShell.tsx` 40
  - 관리 화면 렌더: `DesktopMesShell.tsx` 205
- 관리 화면 첫 진입은 `DesktopPinLock` PIN 게이트다.
  - 실제 import/렌더: `frontend/app/mes/_components/DesktopAdminView.tsx` 5, 78-82
  - PIN 검증 후 `unlock(pin)` 호출: `DesktopAdminView.tsx` 80-81
  - 취소 시 대시보드로 이동: `DesktopAdminView.tsx` 82
- PIN 해제 후 기본 섹션은 `모델 관리`다.
  - `useAdminViewState("models")`: `DesktopAdminView.tsx` 35
- 사이드바 항목은 다음 8개다.
  - `모델 관리`, `품목 관리`, `직원 관리`, `부서 관리`, `BOM 관리`, `내보내기`, `외부 제출용 로그`, `보안`: `frontend/app/mes/_components/_admin_sections/AdminSidebar.tsx` 26-39
  - 그룹: `기준 정보`, `구성 관리`, `시스템`: `AdminSidebar.tsx` 43-46
  - 하단 `관리자 잠금`: `AdminSidebar.tsx` 135
- 섹션 라우팅은 `AdminSectionContent`가 담당한다.
  - 품목: 67-80
  - 직원: 83-93
  - BOM: 96-106
  - 모델: 108-118
  - 부서: 121-140
  - 내보내기: 143-149
  - 외부 제출용 로그: 151-152
  - 보안: 154-159

### 보존해야 하는 경로

- `frontend/app/mes/page.tsx`
  - `AdminSessionProvider`로 전체 MES 페이지를 감싼다: 8, 13-23
- `frontend/app/mes/_components/DesktopAdminView.tsx`
  - PIN gate, 관리 레이아웃, sidebar/content 연결, toast 표시.
- `frontend/app/mes/_components/DesktopPinLock.tsx`
  - 실제 관리자 PIN 입력 화면.
- `frontend/app/mes/_components/_admin_hooks/useAdminViewState.ts`
  - 잠금 상태, 관리자 PIN, 섹션 상태, lock/unlock 처리: 27-69
- `frontend/lib/auth/admin-session.tsx`
  - 관리자 PIN을 메모리에만 저장하고 API 헤더 provider 등록: 6-14, 39-48
- `frontend/lib/api-core.ts`
  - PIN이 있으면 모든 API 요청에 `X-Admin-Pin` 자동 주입: 103-120, 146
- `frontend/app/mes/_components/_admin_sections/AdminSidebar.tsx`
  - 관리 메뉴와 잠금 버튼.
- `frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx`
  - 관리 섹션 라우팅.
- `frontend/app/mes/_components/_admin_sections/AdminModelsSection.tsx`
  - 모델 목록/상세/생성/수정/삭제 UI.
- `frontend/app/mes/_components/_admin_sections/AdminMasterItemsSection.tsx`
  - 품목 목록/상세/생성/수정/소프트삭제/복구/BOM 사용처 표시.
- `frontend/app/mes/_components/_admin_sections/AdminEmployeesSection.tsx`
  - 직원 목록/상세/생성/수정/활성화/비활성화/PIN 초기화 UI.
- `frontend/app/mes/_components/_admin_sections/AdminDepartmentsSection.tsx`
  - 부서 목록/상세/색상/활성 상태/삭제 UI.
- `frontend/app/mes/_components/_admin_sections/_bom_workbench/BomWorkbench.tsx`
  - BOM 편집, 수량 변경, 삭제, 완료 토글, 내보내기.
- `frontend/app/mes/_components/_admin_sections/AdminExportSection.tsx`
  - 품목/거래/직원/BOM 내보내기.
- `frontend/app/mes/_components/_admin_sections/AdminAuditCsvSection.tsx`
  - 실제 역할은 외부 제출용 월별 입출고 CSV 목록/다운로드/백필.
- `frontend/app/mes/_components/_admin_sections/AdminDangerZone.tsx`
  - 현재는 관리자 PIN 변경만 포함한다.
- `frontend/app/mes/_components/_admin_sections/AdminWarehouseStructureSection.tsx`
  - 파일 위치는 admin 섹션 아래지만 실제 사용처는 창고 지도 편집 모드다. 삭제 금지.
  - import/렌더: `frontend/app/mes/_components/DesktopWarehouseMapTab.tsx` 25, 251

### 보존해야 하는 API/백엔드 경로

- `frontend/lib/api/admin.ts`
  - `verifyAdminPin`: 23-24
  - `updateAdminPin`: 29-30
  - 감사 CSV 목록/다운로드/백필: 32-42
- `frontend/lib/api/items.ts`
  - 품목 조회/생성/수정/BOM 완료/소프트삭제/복구/순서 변경: 19-86
- `frontend/lib/api/employees.ts`
  - 직원 조회/생성/수정/삭제/PIN 검증/PIN 초기화/본인 PIN 변경/테마 저장: 17-75
- `frontend/lib/api/catalog.ts`
  - 모델 CRUD/순서 변경, BOM CRUD/조회: 19-59
- `frontend/lib/api/departments.ts`
  - 부서 조회/생성/수정/삭제/순서 변경: 15-47
- `backend/app/dependencies/admin.py`
  - 서버측 관리자 PIN 의존성. `X-Admin-Pin`, query, body에서 PIN 추출 후 검증: 34-60
- `backend/app/routers/settings.py`
  - 관리자 PIN 검증/변경: 75-107
  - 재고 무결성 점검/복구: 134-184
  - DB reset 엔드포인트: 187-234
- `backend/app/routers/models.py`
  - 모델 조회/생성/수정/삭제/순서 변경.
- `backend/app/routers/items.py`
  - 품목 마스터 CRUD, BOM 완료 토글, 소프트삭제/복구, 내보내기.
- `backend/app/routers/employees.py`
  - 직원 CRUD, 직원 PIN 검증/변경/초기화, 테마.
- `backend/app/routers/departments.py`
  - 부서 CRUD/순서 변경.
- `backend/app/routers/bom.py`
  - BOM 조회/생성/수정/삭제/트리/사용처.
- `backend/app/routers/admin_audit.py`
  - 관리자 감사 로그 조회 API.
- `backend/app/routers/admin_audit_csv.py`
  - 외부 제출용 월별 입출고 CSV/XLSX 목록/다운로드/백필.

### 운영 안전성 평가 메모

- 긍정적 요소:
  - 관리자 PIN은 `sessionStorage`/`localStorage`가 아니라 메모리에만 저장된다: `frontend/lib/auth/admin-session.tsx` 6-14
  - 잠금 해제 후 공통 API 코어가 `X-Admin-Pin`을 자동 주입한다: `frontend/lib/api-core.ts` 103-120
  - `require_admin_pin` 의존성 자체는 존재하며 헤더/body/query 호환을 제공한다: `backend/app/dependencies/admin.py` 34-60
  - 부서 생성/수정/삭제/정렬은 서버 의존성이 붙어 있다: `backend/app/routers/departments.py` 35-100
  - 모델 수정/삭제/정렬은 서버 의존성이 붙어 있다: `backend/app/routers/models.py` 39-42, 112-116, 154-156
  - 직원 PIN 초기화는 서버 의존성이 붙어 있다: `backend/app/routers/employees.py` 364-370
- 위험 요소:
  - 관리 화면 PIN은 프론트 잠금일 뿐이다. 서버 라우터가 `require_admin_pin`을 요구하지 않는 엔드포인트는 URL/API 직접 호출로 우회 가능하다.
  - 모델 신규 등록은 서버 PIN 의존성이 없다: `backend/app/routers/models.py` 64
  - 품목 생성/수정/BOM 완료 토글/소프트삭제/복구는 서버 PIN 의존성이 없다: `backend/app/routers/items.py` 121-122, 468-469, 558-563, 586-587, 621-622
  - 직원 생성/수정/삭제는 서버 PIN 의존성이 없다: `backend/app/routers/employees.py` 128-129, 183-184, 256-257
  - BOM 생성/수정/삭제는 서버 PIN 의존성이 없다: `backend/app/routers/bom.py` 56-57, 128-129, 209-210
  - 관리자 감사 로그 조회는 주석에 “현재 별도 인증 미적용”이라고 명시되어 있다: `backend/app/routers/admin_audit.py` 45
  - 외부 제출용 CSV 라우터는 “화면단 PIN 잠금”만 보호라고 되어 있고 서버 의존성이 없다: `backend/app/routers/admin_audit_csv.py` 5, 49-97
  - 현재 테스트도 PIN 없이 감사 CSV/감사 로그 API를 호출하는 기대값으로 작성되어 있다: `backend/tests/routers/test_admin_audit_csv.py` 39-70, `backend/tests/routers/test_admin_audit.py` 9-85
  - `resetDatabase` 프론트 API/hook/test가 남아 있다. 화면에서는 제거됐지만 호출 경로는 살아 있다: `frontend/lib/api/admin.ts` 26-27, `frontend/lib/queries/useSettingsQuery.ts` 39-42, `frontend/lib/queries/useAdminQuery.ts` 42-45
  - `POST /api/settings/reset` 백엔드 엔드포인트도 살아 있고 품목/재고를 삭제 후 시드 재적재한다: `backend/app/routers/settings.py` 187-234
  - 모델/부서 라우터는 감사 기록이 확인되지 않는다. 품목/직원/BOM은 `audit.record`가 있으나 서버 권한 의존성이 빠진 곳이 많아 감사만으로는 충분하지 않다.

### 삭제/정리 후보

- 강한 삭제 후보:
  - `frontend/app/mes/_components/PinLock.tsx`
    - 실제 관리 화면은 `DesktopPinLock.tsx`를 사용한다: `DesktopAdminView.tsx` 5, 80
    - `PinLock` 참조 검색 결과 파일 자체 정의 외 사용처가 없다: `rg -n "PinLock" frontend/app frontend/lib -g "*.tsx" -g "*.ts"`
  - `frontend/lib/api/admin.ts`의 `resetDatabase`
    - 화면 제거 주석과 불일치한다: `frontend/app/mes/_components/_admin_hooks/useAdminSettings.ts` 10
    - 남은 사용처는 query hook/test/MSW 중심이다.
  - `frontend/lib/queries/useAdminQuery.ts`와 `frontend/lib/queries/useSettingsQuery.ts`의 `useResetDatabaseMutation`
    - 화면 호출이 없고 위험 API를 되살릴 수 있는 잔재다.
- 중간 정리 후보:
  - `frontend/lib/queries/useAdminQuery.ts`
    - 실제 관리 화면은 대부분 직접 `api` 또는 도메인 query hook을 사용하고, 이 파일은 미사용 `PinLock.tsx`와 테스트 중심으로 남아 있다.
    - 단, 삭제 전 query key/test 영향 확인 필요.
  - `AdminAuditCsvSection` 이름 변경
    - 실제 기능은 감사 로그 조회가 아니라 외부 제출용 CSV 관리다. `AdminAuditCsvSection` 같은 이름이 맞다.
  - `backend/app/routers/admin_audit.py`
    - 프론트 사용처가 없고 서버 인증도 없다. 선택지는 둘 중 하나다: “관리자 감사 로그 화면을 실제로 만들고 PIN 서버 인증 추가” 또는 “라우터 제거”.
  - `frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx`
    - 현재 검색 결과상 정의 외 사용처가 없다. 부서 패널 리팩터 잔재일 가능성이 높다.
- 삭제 금지:
  - `AdminWarehouseStructureSection.tsx`
    - 파일명/위치는 관리 섹션처럼 보이지만 창고 지도 편집 모드에서 실제 사용된다.
  - 부서/모델/품목/직원/BOM 섹션 컴포넌트와 hook 전체
    - 현재 관리 화면의 실사용 경로다. 먼저 서버 권한을 보강하고 나서 세부 잔재만 제거해야 한다.

### 개선 방향

1. 서버 권한을 먼저 닫는다.
   - 관리성 쓰기 라우터 전체에 `require_admin_pin`을 붙인다.
   - 우선 대상: 모델 생성, 품목 생성/수정/BOM 완료/소프트삭제/복구, 직원 생성/수정/삭제, BOM 생성/수정/삭제.
   - 감사 로그/외부 제출 CSV는 민감 조회/백필이므로 최소 `GET 목록/다운로드/POST 백필` 모두 관리자 PIN을 요구하게 한다.
2. 테스트 기대값을 운영 기준으로 바꾼다.
   - PIN 없음: 400 또는 403
   - 잘못된 PIN: 403
   - `X-Admin-Pin` 정상: 기존 동작 성공
   - 기존 body/query PIN 호환이 필요한 엔드포인트는 호환 테스트를 유지한다.
3. DB reset 경로를 결정한다.
   - 운영에서 쓰지 않을 거면 프론트 API/hook/test/MSW와 백엔드 `/api/settings/reset`을 제거하거나, 최소 개발 전용 플래그 뒤로 숨긴다.
   - 현재처럼 URL만 알면 호출 가능한 위험 도구가 남아 있는 상태는 엑셀 폐기 수준의 운영 신뢰성과 맞지 않는다.
4. 감사 기록 기준을 통일한다.
   - 품목/직원/BOM처럼 audit가 있는 도메인과 모델/부서처럼 없는 도메인의 차이를 없앤다.
   - 마스터 데이터 변경은 `actor_pin_role`, action, target, summary가 남아야 한다.
5. 이름과 중복 계층을 정리한다.
   - 미사용 `PinLock.tsx` 제거.
   - `useAdminQuery`/`useSettingsQuery` 중복을 실제 사용 경로 기준으로 합치거나 하나만 남긴다.
   - `AdminAuditCsvSection`은 실제 기능명에 맞춰 rename한다.

### 삭제 전 검증 체크리스트

1. PIN 없이 관리성 API 직접 호출 시 실패하는지 확인한다.
2. 올바른 `X-Admin-Pin`으로 기존 관리 화면 기능이 모두 성공하는지 확인한다.
3. 모델 신규 등록/수정/삭제/정렬이 정상 동작하고, PIN 누락/오류 시 차단되는지 확인한다.
4. 품목 생성/수정/BOM 완료/소프트삭제/복구/정렬이 정상 동작하고, PIN 누락/오류 시 차단되는지 확인한다.
5. 직원 생성/수정/삭제/PIN 초기화가 정상 동작하고, PIN 누락/오류 시 차단되는지 확인한다.
6. 부서 생성/수정/삭제/정렬은 기존 보호가 깨지지 않는지 확인한다.
7. BOM 생성/수정/삭제/완료 토글이 정상 동작하고, PIN 누락/오류 시 차단되는지 확인한다.
8. 외부 제출용 CSV 목록/다운로드/백필이 PIN 없이는 실패하고, 관리 화면에서는 정상 동작하는지 확인한다.
9. 감사 로그 조회 API를 유지한다면 PIN 없이는 실패하고, 관리 화면에서 실제 조회 UI가 있는지 확인한다.
10. DB reset 제거/잠금 후 `rg -n "resetDatabase|/api/settings/reset|useResetDatabaseMutation" frontend backend` 결과가 의도한 항목만 남는지 확인한다.
11. `PinLock.tsx` 삭제 후 `rg -n "PinLock" frontend/app frontend/lib` 결과가 `DesktopPinLock`만 남는지 확인한다.
12. 정리 후 관리 관련 테스트와 서버 smoke 테스트를 실행한다.
## 주간보고

상태: 고정 영역 기록 완료

### 판정

- 이 화면은 프로젝트 규칙상 고정 영역이다.
- 현재 대대적 삭제/정리 대상에서 제외한다.
- 예외는 신규 `TransactionTypeEnum` 추가 시 백엔드 분류 set만 갱신하는 경우다.

### 실제 연결 경로

- 데스크톱 탭 등록/렌더:
  - `frontend/app/mes/_components/DesktopMesShell.tsx` 30, 39, 202-203, 239-240
- 데스크톱 화면:
  - `frontend/app/mes/_components/DesktopWeeklyReportView.tsx` 20
  - `WeeklyGroupCards`, `WeeklyDetailTable`, `WeeklyProductionMatrix` import: 7-9
- 주차 선택:
  - `frontend/app/mes/_components/_weekly_sections/WeeklyWeekPicker.tsx` 75
- 모바일 진입:
  - `frontend/app/mes/_components/mobile/MobileShell.tsx` 20, 53, 282-283, 353-355
  - `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx` 49
- 백엔드:
  - `backend/app/routers/inventory/weekly_report.py` 1-12, 63-70, 123-124

### 보존해야 하는 경로

- `frontend/app/mes/_components/DesktopWeeklyReportView.tsx`
- `frontend/app/mes/_components/_weekly_sections/`
- `backend/app/routers/inventory/weekly_report.py`
- `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx`
  - 모바일 전용 화면이지만 frozen 하위 컴포넌트를 import한다. 모바일 감사 때도 삭제/수정 주의.

### 삭제/정리 후보

- 없음.
- 주간보고 관련 파일은 이름이 오래되어 보이거나 구조가 특이해 보여도 이번 삭제 감사에서 제외한다.

### 삭제 전 검증 체크리스트

1. 주간보고 관련 파일을 삭제 후보 목록에 올리지 않는다.
2. `TransactionTypeEnum` 변경이 있을 때만 `weekly_report.py`의 `PRODUCTION_TX_TYPES`/`NON_PRODUCTION_TX_TYPES` 분류를 확인한다.
3. 주변 리팩터 중 import 경로가 바뀌면 데스크톱/모바일 주간보고 렌더를 별도 확인한다.
## 모바일 화면

상태: 기준선 1차 확정

주의: 모바일은 데스크톱과 별도 구현처럼 보이지만, 실제로는 입출고/불량/내역/창고지도에서 데스크톱 공용 도메인 컴포넌트와 훅을 많이 재사용한다. 이름만 보고 삭제하지 않는다.


### 실제 화면/렌더 기준선

- 모바일 셸은 `MobileShell` 하나가 하단 탭과 서브 화면을 라우팅한다.
  - 화면 import: `frontend/app/mes/_components/mobile/MobileShell.tsx` 16-22
  - 모바일 관리 화면 제외 주석: `MobileShell.tsx` 34-37
  - 탭 id: `MobileShell.tsx` 38-46
  - 탭 라벨: `MobileShell.tsx` 48-55
  - 하단 탭 5개: 대시보드, 입출고, 불량, 내역, 더보기: `MobileShell.tsx` 58
  - URL deep-link 허용: `MobileShell.tsx` 60-69
  - 화면 라우팅: `MobileShell.tsx` 237-292
  - 하단 nav: `MobileShell.tsx` 421-434
- 더보기 화면은 주간보고/창고지도 진입 카드만 제공한다.
  - `frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx` 13-36
- 모바일 작업자 메뉴는 PIN 변경/로그아웃을 제공한다.
  - `frontend/app/mes/_components/mobile/MobileUserMenuSheet.tsx` 27
  - PIN 입력 primitive 사용: `MobileUserMenuSheet.tsx` 167
- 모바일 대시보드는 데스크톱 재고/생산 가능 패널 일부를 재사용한다.
  - `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx` 35
  - 검색 primitive 사용: `MobileDashboardScreen.tsx` 250
- 모바일 입출고는 권한 체크 후 모바일 전용 작성 wizard와 공용 입출고 v2 훅을 사용한다.
  - `frontend/app/mes/_components/mobile/screens/MobileWarehouseScreen.tsx` 36
  - 권한 차단: `MobileWarehouseScreen.tsx` 148-149
  - 작성 wizard: `MobileWarehouseScreen.tsx` 185
  - 작업 중/요청 탭: `MobileWarehouseScreen.tsx` 209
  - 이탈 방지 sheet: `MobileWarehouseScreen.tsx` 238
- 모바일 작성 wizard는 공용 입출고 상태/preview/submit 훅과 모바일 step UI를 연결한다.
  - `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx` 84
  - 작업 유형 step: `MobileIoComposeWizard.tsx` 521
  - 세부 유형 step: `MobileIoComposeWizard.tsx` 529
  - 단품 수량 보정형 모바일 form: `MobileIoComposeWizard.tsx` 548
  - 하단 submit 영역: `MobileIoComposeWizard.tsx` 685-694
  - 바코드 스캐너 modal 연결: `MobileIoComposeWizard.tsx` 700-701
- 모바일 불량은 권한 체크 후 `DefectHubPanel`을 마운트하고, 일부 처리 화면만 모바일 전용으로 재구성한다.
  - `frontend/app/mes/_components/mobile/screens/MobileDefectScreen.tsx` 19
  - `canEnterIO` 권한 차단: `MobileDefectScreen.tsx` 25-27
  - `DefectHubPanel` 렌더: `MobileDefectScreen.tsx` 61-70
  - 모바일 격리/폐기 카트: `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx` 18-25
  - 모바일 처리 패널: `frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx` 20-35
- 모바일 내역은 데스크톱 내역의 데이터 훅/상세 패널을 공유한다.
  - `frontend/app/mes/_components/mobile/screens/MobileHistoryScreen.tsx` 38
  - 월별 count 쿼리 import: `MobileHistoryScreen.tsx` 17
- 모바일 창고 지도는 데스크톱 지도 stage와 위치 패널을 재사용한다.
  - `frontend/app/mes/_components/mobile/screens/MobileWarehouseMapScreen.tsx` 70
  - 지도 API 조회: `MobileWarehouseMapScreen.tsx` 94-95
  - 검색: `MobileWarehouseMapScreen.tsx` 230
  - 정면도/평면도 stage 연결: `MobileWarehouseMapScreen.tsx` 256-261, 290
  - 위치 패널: `MobileWarehouseMapScreen.tsx` 269
- 모바일 주간보고는 고정 영역 화면을 모바일에서 보여주는 경로다. 수정/삭제 대상이 아니다.
  - `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx` 49

### 보존해야 하는 경로

- `frontend/app/mes/_components/mobile/MobileShell.tsx`
- `frontend/app/mes/_components/mobile/MobileUserMenuSheet.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileDashboardScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileWarehouseScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileDefectScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileHistoryScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileMoreScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileWarehouseMapScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileWeeklyScreen.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileDefectCartFlow.tsx`
- `frontend/app/mes/_components/mobile/screens/MobileDefectProcessPanel.tsx`
- `frontend/app/mes/_components/mobile/warehouse/MobileIoComposeWizard.tsx`
- `frontend/app/mes/_components/mobile/warehouse/MobileWorkTypeStep.tsx`
- `frontend/app/mes/_components/mobile/warehouse/MobileSingleAdjustForm.tsx`
- `frontend/app/mes/_components/mobile/warehouse/MobileDirtyLeaveSheet.tsx`
- `frontend/app/mes/_components/mobile/hooks/useItems.ts`
  - `frontend/app/mes/_components/_inventory_hooks/useInventoryListData.ts` 6, 63에서 실제 사용한다.
- `frontend/app/mes/_components/BarcodeScannerModal.tsx`
  - `MobileIoComposeWizard.tsx` 19, 700-701에서 실제 사용한다.
- 모바일 primitive 중 실제 사용 확인된 것:
  - `AsyncState`
  - `InlineSearch`
  - `IconButton`
  - `PrimaryActionButton`
  - `StickyFooter`
  - `WizardProgress`
  - `SectionCard`
  - `SegmentedControl`
  - `Stepper`
  - `PinInput`
  - `SheetHeader`

### 삭제/정리 후보

- 모바일 과거 hook 후보:
  - `frontend/app/mes/_components/mobile/hooks/useTransactions.ts`
  - `frontend/app/mes/_components/mobile/hooks/useMobileHistoryAux.ts`
  - `frontend/app/mes/_components/mobile/hooks/useEmployees.ts`
  - 위 3개는 현재 검색 기준으로 production 화면 사용처 없이 자체 테스트와 정의만 확인된다.
  - 확인 명령: `rg -n "useMobileHistoryAux|useTransactions\(|fetchMonthLogs\(|useEmployees\(" frontend/app/mes/_components frontend/lib -g "*.tsx" -g "*.ts"`
- 위 hook 전용 테스트:
  - `frontend/app/mes/_components/mobile/hooks/__tests__/useTransactions.test.tsx`
  - `frontend/app/mes/_components/mobile/hooks/__tests__/useEmployees.test.tsx`
- 모바일 primitive 삭제 후보:
  - `frontend/app/mes/_components/mobile/primitives/KpiCard.tsx`
  - `frontend/app/mes/_components/mobile/primitives/ItemRow.tsx`
  - `frontend/app/mes/_components/mobile/primitives/StatusBadge.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SectionHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/QuickActionGrid.tsx`
  - `frontend/app/mes/_components/mobile/primitives/ErrorAlert.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SubScreenHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SummaryChipBar.tsx`
  - `frontend/app/mes/_components/mobile/primitives/FilterChip.tsx`
  - `frontend/app/mes/_components/mobile/primitives/MoreMenuRow.tsx`
  - `frontend/app/mes/_components/mobile/primitives/PersonAvatar.tsx`
  - 현재 검색 기준으로 외부 사용처 없이 index export, 자기 자신, 또는 같은 삭제 후보끼리의 참조만 확인된다.
- `frontend/app/mes/_components/mobile/primitives/index.ts`
  - 위 삭제 후보를 지운 뒤 export 목록을 함께 축소해야 한다.

### 삭제 금지/주의

- `useItems.ts`는 모바일 폴더에 있지만 대시보드 재고 목록 데이터 경로에서 사용한다. 삭제 금지.
- `BarcodeScannerModal.tsx`는 현재 모바일 입출고 wizard와 연결되어 있다. 바코드 기능 자체를 없애기로 결정하기 전에는 삭제 금지.
- 모바일 창고 지도는 데스크톱 창고 지도 stage/panel을 공유한다. `_warehouse_map_sections`를 모바일 기준으로 삭제하면 데스크톱도 깨질 수 있다.
- 모바일 내역은 데스크톱 내역 상세 패널과 취소 흐름을 공유한다. `_history_sections`를 모바일 기준으로 삭제하면 안 된다.
- 모바일 불량은 `DefectHubPanel`과 일부 모바일 전용 처리 패널이 섞여 있다. `_defect_hub`는 모바일에서도 살아있는 경로다.
- 모바일 주간보고는 고정 영역과 연결되어 있으므로 이번 정리에서 제외한다.

### 운영 안전성 평가 메모

- 모바일 자체가 재고 정합성을 별도로 계산하지 않고, 입출고/불량/내역/창고지도 공용 API와 훅을 통해 움직인다. 따라서 모바일 삭제 작업의 핵심 위험은 “재고 계산 오류”보다 “살아있는 공용 경로를 실수로 끊는 것”이다.
- 입출고 화면은 작성 중 이탈 방지와 임시저장 flush가 있다. 삭제/정리 중 `MobileDirtyLeaveSheet`, `flushDraftRef`, `onDirtyChange` 흐름은 보존해야 한다.
- 권한 없는 작업자는 입출고/불량에 진입하지 못한다. 삭제 후에도 `canEnterIO` 차단이 유지되어야 한다.
- 모바일 관리 화면은 의도적으로 없다. 따라서 관리 기능 보강은 데스크톱 관리 기준으로 진행한다.

### 삭제 전 검증 체크리스트

1. 모바일 폭에서 `/mes?tab=dashboard`가 정상 표시되고 검색/상세/빠른 작업 진입이 동작한다.
2. 모바일 하단 탭 5개가 표시되고 대시보드/입출고/불량/내역/더보기 이동이 동작한다.
3. 권한 없는 작업자로 입출고/불량 접근 시 차단 화면이 표시된다.
4. 입출고 작성 중 다른 탭 이동 시 이탈 방지 sheet가 뜨고 임시저장 후 이동이 동작한다.
5. 입출고 작성 wizard에서 작업 유형, 세부 유형, 품목 선택, 수량 입력, 확인/제출 흐름이 동작한다.
6. 바코드 스캐너 버튼/modal 연결이 삭제 작업 후에도 의도대로 유지되거나, 기능 제거를 별도 결정한 경우 흔적이 남지 않는다.
7. 불량 화면에서 격리/처리 흐름이 동작한다.
8. 내역 화면에서 목록, 상세, 일괄 상세, 취소/상태 갱신 흐름이 동작한다.
9. 더보기에서 주간보고와 창고 지도로 이동한다.
10. 창고 지도 모바일 화면에서 검색, 앵글 선택, 셀 선택, 위치 패널이 동작한다.
11. 사용자 메뉴에서 PIN 변경과 로그아웃이 동작한다.
12. 삭제 후 `rg -n "useMobileHistoryAux|useTransactions\(|fetchMonthLogs\(|useEmployees\(" frontend/app/mes/_components frontend/lib -g "*.tsx" -g "*.ts"` 결과가 의도한 항목만 남는지 확인한다.
13. 삭제 후 `rg -n "KpiCard|ItemRow|StatusBadge|SectionHeader|QuickActionGrid|ErrorAlert|SubScreenHeader|WizardHeader|SummaryChipBar|FilterChip|MoreMenuRow|PersonAvatar" frontend/app/mes/_components/mobile -g "*.tsx" -g "*.ts"` 결과가 의도한 항목만 남는지 확인한다.
## 공통 셸

상태: 기준선 1차 확정

범위: 데스크톱 사이드바, 상단바, 시스템 상태 배지, 작업자 메뉴, 알림, 동기화, 테마 토글.

### Playwright 검증 결과

- 검증 URL: `http://127.0.0.1:3001/mes?tab=dashboard`
- 프론트 rewrite 기준 백엔드: `http://localhost:8011`
- 작업자: `E22`
- 실제 화면 확인 결과:
  - 사이드바 탭 `대시보드`, `입출고`, `불량`, `입출고 내역`, `창고 지도`, `주간보고`, `관리` 표시
  - 상단 시스템 상태 `DEXCOWIN MES System` 표시
  - `동기화` 버튼 표시
  - 알림 버튼 표시
  - 작업자 버튼 표시
  - 작업자 메뉴에서 `PIN 변경`, `로그아웃` 표시
  - 알림 패널 표시
  - 사이드바 확장 상태에서 `라이트 모드` 또는 `다크 모드` 표시

### 실제 화면/렌더 기준선

- 데스크톱 공통 셸은 `DesktopMesShell`이 담당한다.
  - 탭 id 집합: `frontend/app/mes/_components/DesktopMesShell.tsx` 29
  - 탭 메타: `DesktopMesShell.tsx` 32-40
  - 상태 메시지 기본값: `DesktopMesShell.tsx` 30
  - 상태 자동 복귀: `DesktopMesShell.tsx` 63-76
  - 탭 변경 및 dirty guard: `DesktopMesShell.tsx` 78-96
  - 알림 딥링크 이동: `DesktopMesShell.tsx` 98-119
  - 뒤로/앞으로 URL 동기화: `DesktopMesShell.tsx` 124-137
  - 사이드바/상단바 렌더: `DesktopMesShell.tsx` 222-247
- 사이드바는 `DesktopSidebar`가 담당한다.
  - 탭 정의: `frontend/app/mes/_components/DesktopSidebar.tsx` 13-25
  - 하단 관리 탭: `DesktopSidebar.tsx` 27-29
  - hover 확장 상태: `DesktopSidebar.tsx` 37-52
  - 탭 버튼 렌더: `DesktopSidebar.tsx` 102-115, 118-132
  - 테마 토글 렌더: `DesktopSidebar.tsx` 133
- 상단바는 `DesktopTopbar`가 담당한다.
  - 작업자 role badge 계산: `frontend/app/mes/_components/DesktopTopbar.tsx` 46-50
  - 상태 배지 렌더: `DesktopTopbar.tsx` 84-96
  - 작업자 드롭다운 버튼: `DesktopTopbar.tsx` 102-153
  - 작업자 메뉴 `PIN 변경`, `로그아웃`: `DesktopTopbar.tsx` 170-200
  - 알림 버튼 연결: `DesktopTopbar.tsx` 213
  - 동기화 버튼: `DesktopTopbar.tsx` 215-225
  - 로그아웃 confirm: `DesktopTopbar.tsx` 229-240
  - PIN 변경 modal: `DesktopTopbar.tsx` 242-295
- 테마 토글은 `ThemeToggle`이 담당한다.
  - operator/localStorage 테마 읽기: `frontend/app/mes/_components/ThemeToggle.tsx` 14-24
  - DOM/localStorage/backend 저장: `ThemeToggle.tsx` 26-46
  - 사이드바 확장 라벨: `ThemeToggle.tsx` 74-88
- 알림은 `NotificationBell`/`NotificationPanel`이 담당한다.
  - 알림 query/mutation 연결: `frontend/app/mes/_components/notifications/NotificationBell.tsx` 23-27
  - 30초 폴링 query: `frontend/lib/queries/useNotificationsQuery.ts` 15-24
  - 알림 클릭 시 읽음 처리 후 딥링크 이동: `NotificationBell.tsx` 45-54
  - 전체 읽음/개별 삭제/읽은 알림 삭제: `NotificationBell.tsx` 56-66
  - 패널 UI: `frontend/app/mes/_components/notifications/NotificationPanel.tsx` 35-128

### 보존해야 하는 경로

- `frontend/app/mes/_components/DesktopMesShell.tsx`
- `frontend/app/mes/_components/DesktopSidebar.tsx`
- `frontend/app/mes/_components/DesktopTopbar.tsx`
- `frontend/app/mes/_components/ThemeToggle.tsx`
- `frontend/app/mes/_components/notifications/NotificationBell.tsx`
- `frontend/app/mes/_components/notifications/NotificationPanel.tsx`
- `frontend/lib/queries/useNotificationsQuery.ts`
- `frontend/lib/api/notifications.ts`
- `frontend/lib/api/employees.ts`
  - `changeMyPin`, `setEmployeeTheme`는 데스크톱/모바일 작업자 메뉴와 테마에서 실제 사용한다.
- `backend/app/routers/notifications.py`
- `backend/app/services/notifications.py`
- `backend/app/models/notification.py`
- `backend/app/routers/employees.py`
  - `change-pin`, `theme` endpoint는 공통 셸/모바일 사용자 메뉴에서 연결된다.

### 삭제/정리 후보

- `frontend/app/mes/_components/DesktopSidebar.tsx`의 `alertCount` prop
  - `DesktopMesShell.tsx` 225에서 전달되지만 `DesktopSidebar.tsx` 내부에서 실제 표시 로직이 확인되지 않는다.
  - 삭제 전 dashboard 경고 badge를 의도적으로 제거한 것인지, 구현 누락인지 결정해야 한다.
- `frontend/lib/api/notifications.ts`의 `unreadNotificationCount`
  - 현재 화면은 `listNotifications` 응답의 `unread_count`를 사용한다.
  - 검색 기준으로 별도 호출 사용처가 확인되지 않는다.
- 알림 본문 라벨 이중 변환 가능성 정리
  - 백엔드 `backend/app/services/notifications.py` 55-74에서 이미 request type을 한국어 라벨로 만든다.
  - 프론트 `NotificationPanel.tsx` 16-25도 원시값 라벨 치환을 유지한다. 현재는 안전한 보정이지만, 백엔드/프론트 중 한쪽으로 책임을 정리할 수 있다.

### 삭제 금지/주의

- `NotificationBell`은 데스크톱뿐 아니라 모바일 셸에서도 사용한다.
  - 모바일 import/render: `frontend/app/mes/_components/mobile/MobileShell.tsx` 29, 360
- `ThemeToggle`은 사이드바 하단 실제 기능이다. 라벨은 hover 확장 상태에서만 보이므로 기본 축소 화면만 보고 삭제하면 안 된다.
- `changeMyPin`은 데스크톱 상단바와 모바일 사용자 메뉴가 같이 사용한다.
  - 데스크톱: `DesktopTopbar.tsx` 254
  - 모바일: `frontend/app/mes/_components/mobile/MobileUserMenuSheet.tsx` 83
- 알림 삭제 API는 실제 하드 삭제다.
  - 읽은 알림 전체 삭제: `backend/app/routers/notifications.py` 54-65
  - 개별 삭제: `notifications.py` 68-87
- 상단 동기화 버튼은 DB 쓰기가 아니라 현재 탭 리마운트/생산 가능수량 refetch 트리거다.

### 운영 안전성 평가 메모

- 긍정적 요소:
  - 탭 이동은 dirty guard를 거쳐 작성 중/관리 편집 중 이탈을 막는다: `DesktopMesShell.tsx` 78-96
  - 알림 클릭은 읽음 처리 후 해당 업무 탭/섹션으로 이동한다: `NotificationBell.tsx` 45-54, `DesktopMesShell.tsx` 98-119
  - 알림 생성은 요청 상태 변경과 같은 트랜잭션에 묶이도록 서비스가 세션에 add만 한다: `backend/app/services/notifications.py` 1-9
  - PIN 변경은 현재 PIN 검증 후 audit 기록을 남긴다: `backend/app/routers/employees.py` 329-361
- 위험/개선 요소:
  - 알림 조회/읽음/삭제는 `recipient_employee_id` 쿼리 기반이다. 현재 작업자 세션과 서버에서 강하게 대조하지 않으면 직원 ID를 아는 사용자가 다른 직원 알림을 조회/삭제할 수 있다.
  - 테마 저장 endpoint는 PIN 검증 없이 `employee_id`만으로 변경된다. 재고 정합성 위험은 아니지만 사용자 설정 변조 가능성은 있다.
  - 로그아웃은 localStorage 작업자 정보 삭제 후 reload다. 서버 세션 기반 인증이 아니므로 “작업자 식별” 수준이라는 전제를 문서/운영 교육에 유지해야 한다.
  - `alertCount`가 전달만 되고 표시되지 않는 상태라면, 대시보드 경고 badge가 빠진 잔재인지 UX 의도인지 결정해야 한다.

### 삭제 전 검증 체크리스트

1. 데스크톱 폭에서 사이드바가 표시되고 hover 시 탭 라벨이 펼쳐진다.
2. 사이드바 탭 7개가 각각 올바른 `?tab=`으로 이동한다.
3. 관리 탭 진입 시 관리자 PIN gate가 표시되고 `0000`으로 해제된다.
4. 상단 타이틀이 현재 탭에 맞게 바뀐다.
5. 상태 배지가 기본값과 작업 결과 메시지를 표시하고, 비오류 메시지는 자동 복귀한다.
6. 동기화 버튼 클릭 시 현재 탭 데이터가 새로고침되고 화면이 깨지지 않는다.
7. 작업자 버튼 클릭 시 `PIN 변경`, `로그아웃` 메뉴가 열린다.
8. PIN 변경 modal에서 현재 PIN/새 PIN/확인 PIN 검증이 동작한다.
9. 로그아웃 confirm 후 로그인 화면으로 돌아간다.
10. 알림 버튼 클릭 시 패널이 열리고 안 읽음 배지가 표시된다.
11. 알림 클릭 시 읽음 처리 후 대상 탭/섹션으로 이동한다.
12. `모두 읽음`, `읽은 알림 삭제`, 개별 삭제가 본인 알림에만 적용된다.
13. 테마 토글 시 DOM theme, localStorage, 작업자 theme 정보가 일관되게 바뀐다.
14. 공통 셸 정리 후 `rg -n "alertCount|unreadNotificationCount" frontend/app frontend/lib` 결과가 의도한 항목만 남는지 확인한다.
15. 알림 보안 보강 후 다른 직원 `employee_id`로 조회/삭제를 시도했을 때 차단되는지 확인한다.
## 루트/오류 화면

상태: 기준선 확정

### 실제 화면/렌더 기준선

- `frontend/app/page.tsx`는 독립 화면이 아니라 `/mes/page`를 그대로 re-export한다: `frontend/app/page.tsx` 1
  - 따라서 `/`와 `/mes`는 같은 DEXCOWIN MES 앱 진입점으로 본다.
- `frontend/app/mes/page.tsx`는 실제 업무 화면 전체의 루트다.
  - `AdminSessionProvider`, `QueryProvider`, `DepartmentsProvider`, `MesLoginGate`로 감싼다: 13-23
  - 모바일 셸은 `lg:hidden`에서 렌더된다: 30-32
  - 데스크톱 셸은 `DesktopMesShell`로 렌더된다: 34-36
- `frontend/app/layout.tsx`는 공통 HTML/body, Pretendard 폰트, metadata, viewport를 제공한다.
  - 시스템 title/description: 16-22
  - 모바일 viewport 고정: 27-32
  - `lang="ko"`와 폰트 class 적용: 40-42
- `frontend/app/error.tsx`는 라우트 단위 오류 화면이다.
  - 오류 메시지, `다시 시도`, `대시보드로 이동` 제공: 20-49
- `frontend/app/global-error.tsx`는 최상위 fallback이다.
  - layout 자체가 실패한 경우를 위한 HTML/body 직접 렌더: 19-43

### 보존해야 하는 경로

- `frontend/app/page.tsx`
- `frontend/app/mes/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/error.tsx`
- `frontend/app/global-error.tsx`
- `frontend/app/fonts/PretendardVariable.woff2`

### 삭제/정리 후보

- 이 범위에서 파일 단위 삭제 후보는 없다.
- 이전 콘솔 출력에서 한글이 깨져 보였던 것은 PowerShell 기본 출력 인코딩 착시였다. `Get-Content -Encoding UTF8` 기준 실제 파일 문구는 정상이다.
- `frontend/app/page.tsx`는 코드 1줄이지만 `/` 진입을 `/mes`로 연결하는 공식 루트이므로 삭제 후보가 아니다.

### 삭제 전 검증 체크리스트

1. `/` 접속 시 로그인 또는 기존 세션 기준 DEXCOWIN MES 화면으로 진입하는지 확인한다.
2. `/mes` 접속 시 같은 앱 진입점으로 동작하는지 확인한다.
3. 모바일 viewport에서 `MobileShell`, 데스크톱 viewport에서 `DesktopMesShell`이 각각 렌더되는지 확인한다.
4. 임의 throw 테스트는 운영 DB와 무관한 개발 환경에서만 수행하고, `error.tsx`의 `다시 시도`와 `대시보드로 이동`이 동작하는지 확인한다.
5. 최상위 layout fallback은 일반 운영 경로에서 직접 재현하기 어려우므로 파일 보존 대상으로 둔다.
## 통합 삭제 큐

상태: 2차 참조 재검증 반영

목적: 화면별로 흩어진 삭제 후보를 실제 실행 순서로 재정렬한다. 이 섹션은 삭제 실행 전 마지막 체크리스트 역할을 한다. 전체 화면 Playwright smoke 결과를 삭제 전 기준선으로 사용한다.

### 2026-06-25 2차 참조 재검증 결과

- A 그룹은 삭제 후보 확정에 가깝다.
  - `PinLock.tsx`는 정확 검색 기준으로 자기 파일의 `export function PinLock`만 남는다.
  - `ItemDetailSheet` 계열은 외부 import 없이 내부 참조만 남고, 직접 재고 쓰기 호출(`api.adjustInventory`, `api.receiveInventory`)도 이 잔재 안에만 있다.
  - `AdminRightPanelContent.tsx`는 정의 외 production 사용처가 확인되지 않는다.
- B 그룹 중 모바일 hook 3개는 production 호출 없이 정의/자체 테스트 중심이다.
  - `useTransactions`, `useEmployees`는 자체 테스트가 있고, `useMobileHistoryAux`는 정의와 내부 import 관계만 확인된다.
  - 모바일 primitive 실제 import는 `PinInput`, `InlineSearch`, `IconButton`, `SectionCard`, `StickyFooter`, `Stepper`, `SheetHeader`, `PrimaryActionButton`, `WizardProgress`, `AsyncState`다.
  - 따라서 후보 primitive(`KpiCard`, `ItemRow`, `StatusBadge`, `SectionHeader`, `QuickActionGrid`, `ErrorAlert`, `SubScreenHeader`, `WizardHeader`, `SummaryChipBar`, `FilterChip`, `MoreMenuRow`, `PersonAvatar`)는 index export와 후보끼리의 내부 참조 중심으로 보인다.
- C 그룹은 제거 후보가 강해졌다.
  - `alertCount`는 `DesktopMesShell.tsx`에서 전달되고 `DesktopSidebar.tsx` props에만 남는다. 실제 표시 사용처가 검색되지 않는다.
  - `unreadNotificationCount`는 `frontend/lib/api/notifications.ts`의 API 함수 정의만 남고, 화면은 `listNotifications` 응답의 `unread_count`를 쓴다.
- D 그룹은 “삭제”보다 운영 안전장치 작업이다.
  - DB reset은 화면에서 제거된 흔적이 있지만 `adminApi.resetDatabase`, `useResetDatabaseMutation`, MSW/테스트, 백엔드 `/api/settings/reset`이 남아 있다.
  - 서버 관리자 PIN은 부서 쓰기, 모델 reorder/update/delete, 품목 reorder, 직원 PIN reset 등 일부에만 적용되어 있다.
  - 모델 생성, 품목 생성/update/bom-completion/soft-delete/restore, 직원 생성/update/delete, BOM create/update/delete, admin audit/audit-csv 조회·백필은 서버 PIN 의존성이 없다.
  - 알림 API는 `recipient_employee_id` query/payload 기반으로 조회·읽음·삭제를 수행한다. 현재 작업자와 recipient를 서버에서 강제 대조하는 구조는 확인되지 않는다.
- E 그룹은 A 그룹 삭제 후 더 명확해진다.
  - 직접 재고 쓰기 화면 사용처는 `ItemDetailSheet` 잔재가 유일하다.
  - 프론트 API 래퍼/React Query mutation/MSW/테스트와 백엔드 legacy inventory router, backend test fixture가 남아 있다.
- F 그룹은 운영 위험이 낮은 혼란 제거 작업이다.
  - `AdminAuditCsvSection` 이름은 실제 화면 역할(`외부 제출용 입출고 로그`)과 어긋난다.
  - 거래 관련 query hook은 `useTransactionsQuery.ts`와 `useProductionQuery.ts`에 중복 export가 있다. 단, `useProductionQuery.ts`는 생산 가능수량/PF PIN 훅이 살아 있으므로 파일 전체 삭제 금지다.
  - 알림 라벨 보정은 백엔드 `_REQUEST_TYPE_LABEL`, 프론트 `REQUEST_TYPE_LABEL`, `NotificationPanel` 보정 로직에 나뉘어 있다.

### 2026-06-25 3차 참조 재검증 결과

- D 그룹 운영 안전장치 후보는 기존 판단이 유지된다.
  - `POST /api/settings/reset`은 백엔드에서 실제 품목/재고 삭제 후 seed 재적재를 수행한다. 프론트 화면에서는 제거된 흔적이 있으나 `adminApi.resetDatabase`, `useResetDatabaseMutation`, MSW/테스트까지 남아 있다.
  - `require_admin_pin`은 헤더 `X-Admin-Pin`, query/body `pin`을 지원하고, 프론트 `api-core.ts`는 PIN 해제 후 모든 요청에 `X-Admin-Pin`을 자동 주입한다. 따라서 서버 라우터에 dependency를 추가하는 방식이 현재 구조와 맞다.
  - 알림 라우터는 `recipient_employee_id` query/payload만으로 목록/읽음/삭제를 처리한다. 현재 작업자와 recipient를 서버에서 강제 대조하는 근거가 없으므로 운영 안전장치 후보로 유지한다.
- E 그룹 직접 재고 쓰기 후보는 A 그룹 완료 후 정리해야 한다.
  - production 화면 호출은 `ItemDetailSheet.tsx` 잔재 안의 `api.adjustInventory`, `api.receiveInventory`가 유일하게 확인된다.
  - 그 외 `receiveInventory`, `adjustInventory`, transfer/defective/supplier 계열은 프론트 API 래퍼, React Query mutation, MSW/테스트, 백엔드 legacy inventory router에 남아 있다.
  - 백엔드는 `/api/inventory` 아래에서 `transactions`, `query`, `weekly_report`와 함께 `receive`, `transfer`, `defective`, `supplier` 라우터를 include한다. 정리 시 조회/거래내역/주간보고 라우터는 유지해야 한다.
- F 그룹 이름/중복 후보는 기능 삭제가 아니라 혼란 제거 작업이다.
  - `AdminAuditCsvSection.tsx`는 실제로 `/api/admin/audit-csv/*`를 사용하는 외부 제출용 CSV 화면이다. `/api/admin/audit-logs` 백엔드 감사 로그와 이름이 충돌하므로 rename 후보로 유지한다.
  - `useProductionQuery.ts`에는 생산 가능수량/PF/생산 입고 훅이 실제 사용 중이라 파일 삭제 금지다. 다만 거래 조회/수정 이력/메타 수정/수량 보정 훅은 `useTransactionsQuery.ts`와 중복된다.
  - 현재 production 화면 import는 `useProductionCapacityQuery`, `usePfPinsQuery` 등 생산 전용 훅 중심이고, 거래 화면은 `useTransactionsQuery.ts`를 사용한다. 따라서 중복 정리는 `useProductionQuery.ts`에서 거래성 export를 제거하거나 명확히 위임하는 방향이 맞다.

### 실행 판단표

| 그룹 | 판단 | 실행 방향 |
| --- | --- | --- |
| A | 삭제 우선 후보 | 프론트 전용 잔재 삭제 후 타입체크와 대시보드/관리 smoke 확인 |
| B | 삭제 우선 후보 | 모바일 hook/primitive 삭제, index export 축소, 모바일 7개 탭/하위화면 smoke 확인 |
| C | 소규모 축소 후보 | `alertCount` 제거 여부 UX 결정 후 prop 제거, `unreadNotificationCount` API 함수 제거 |
| D | 운영 안전장치 후보 | DB reset 제거/잠금, 서버 관리자 PIN 의존성 확대, 알림 recipient 검증 보강 |
| E | 레거시 API 정리 후보 | A 삭제 후 직접 재고 쓰기 UI 사용처가 0인지 재확인하고 테스트 fixture 교체 후 라우터 정리 |
| F | 혼란 제거 후보 | 기능 변경 없이 rename/중복 query 정리/라벨 책임 정리 |
### A. 가장 먼저 지울 수 있는 프론트 전용 잔재

조건: production 화면 import가 없고, 서버/DB 동작에 영향이 없으며, 삭제 후 타입체크/테스트로 확인 가능해야 한다.

1. `frontend/app/mes/_components/PinLock.tsx`
   - 현재 관리 화면은 `DesktopPinLock.tsx`를 사용한다.
   - 재검증 결과 `PinLock`은 파일 자체 정의 외 production import가 확인되지 않는다. 단순 `PinLock` 검색은 `DesktopPinLock`도 잡으므로 삭제 전에는 정확 검색을 사용한다.
   - 검증 명령: `rg -n 'from "\.\/PinLock"|<PinLock\b|function PinLock' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 삭제 후 기대: `DesktopPinLock` 참조만 남는다.
2. `frontend/app/mes/_components/ItemDetailSheet.tsx`
3. `frontend/app/mes/_components/ItemDetailActionForm.tsx`
4. `frontend/app/mes/_components/ItemDetailHistoryList.tsx`
   - 현재 대시보드 행 클릭은 우측 상세 패널을 사용하고, 이 시트 계열은 production import가 확인되지 않는다.
   - 이 계열 내부에서만 `api.adjustInventory`, `api.receiveInventory` 직접 쓰기를 호출한다.
   - 검증 명령: `rg -n 'from "\.\/ItemDetailSheet"|from "\.\/ItemDetailActionForm"|from "\.\/ItemDetailHistoryList"|<ItemDetailSheet\b|<ItemDetailActionForm\b|<ItemDetailHistoryList\b' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
5. `frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx`
   - 현재 검색 기준으로 정의 외 production 사용처가 확인되지 않는다.
   - 삭제 전 한 번 더 admin 섹션 import 전체 grep 필요.

검증 게이트:

- `rg -n 'from "\.\/PinLock"|<PinLock\b|function PinLock|from "\.\/ItemDetailSheet"|from "\.\/ItemDetailActionForm"|from "\.\/ItemDetailHistoryList"|<ItemDetailSheet\b|<ItemDetailActionForm\b|<ItemDetailHistoryList\b|AdminRightPanelContent' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
- 프론트 타입체크/테스트
- 대시보드 행 선택, 관리 PIN 해제 화면 수동 또는 Playwright 확인


### A 그룹 삭제 실행 플랜

> **Recommended model: Sonnet** - 프론트 삭제 작업이지만 직접 재고 쓰기 잔재와 화면 smoke가 연결되어 있어 보통 수준의 코드 판단이 필요하다.
> **Codex execution shape:** solo, reasoning medium. 세 삭제 묶음은 독립적이지만 파일 수가 작아 한 세션에서 순차 처리하는 편이 리뷰가 쉽다.

목표: production 화면에서 참조되지 않는 프론트 전용 잔재를 제거하고, 삭제 후 현재 화면 기준선이 그대로 유지되는지 확인한다.

범위:
- 삭제 대상:
  - `frontend/app/mes/_components/PinLock.tsx`
  - `frontend/app/mes/_components/ItemDetailSheet.tsx`
  - `frontend/app/mes/_components/ItemDetailActionForm.tsx`
  - `frontend/app/mes/_components/ItemDetailHistoryList.tsx`
  - `frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx`
- 수정 예상:
  - 파일 삭제 외 production import 수정은 없어야 한다.
  - 타입/테스트가 삭제 파일을 참조할 경우 해당 테스트 또는 export만 정리한다.
- 삭제 금지:
  - `frontend/app/mes/_components/DesktopPinLock.tsx`
  - `frontend/app/mes/_components/_inventory_sections/DesktopInventoryRightPanel.tsx`
  - `frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx`
  - `frontend/app/mes/_components/_admin_sections/DeptManagementPanel.tsx`

#### Task A1: 구형 `PinLock.tsx` 삭제

검증 근거:
- 현재 관리 화면은 `DesktopAdminView.tsx`에서 `DesktopPinLock`을 import하고 렌더한다.
- `PinLock.tsx`는 정확 검색 기준 자기 파일의 `export function PinLock`만 남는다.

실행:
1. 삭제 전 검색:
   - `rg -n 'from "\.\/PinLock"|from "\.\.\/PinLock"|<PinLock\b|function PinLock|export \{.*PinLock' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: `frontend/app/mes/_components/PinLock.tsx`의 정의만 표시.
2. `frontend/app/mes/_components/PinLock.tsx` 삭제.
3. 삭제 후 검색:
   - 같은 명령 재실행.
   - 기대: 결과 없음. 단, `DesktopPinLock`은 별도 파일로 남아야 한다.
4. 관리 탭 smoke:
   - `/mes?tab=admin`에서 `관리자 인증` 표시 확인.
   - PIN `0000` 입력 후 `모델 관리` 표시 확인.

#### Task A2: 구형 `ItemDetailSheet` 묶음 삭제

검증 근거:
- 현재 대시보드/재고 행 상세는 우측 패널 계열(`DesktopInventoryRightPanel`, `_inventory_sections`)을 사용한다.
- `ItemDetailSheet` 계열은 외부 import 없이 내부 참조만 남는다.
- `ItemDetailSheet.tsx` 내부에는 직접 재고 쓰기 호출 `api.adjustInventory`, `api.receiveInventory`가 남아 있어, 삭제하면 E 그룹 레거시 API 정리 범위가 더 명확해진다.

실행:
1. 삭제 전 검색:
   - `rg -n 'from "\.\/ItemDetailSheet"|from "\.\/ItemDetailActionForm"|from "\.\/ItemDetailHistoryList"|<ItemDetailSheet\b|<ItemDetailActionForm\b|<ItemDetailHistoryList\b' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: `ItemDetailSheet.tsx` 내부 참조만 표시.
2. 다음 파일 삭제:
   - `frontend/app/mes/_components/ItemDetailSheet.tsx`
   - `frontend/app/mes/_components/ItemDetailActionForm.tsx`
   - `frontend/app/mes/_components/ItemDetailHistoryList.tsx`
3. 삭제 후 직접 쓰기 잔재 검색:
   - `rg -n 'api\.adjustInventory|api\.receiveInventory|receiveInventory|adjustInventory' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: production 화면 참조 없음. 남는 항목은 `frontend/lib/api/inventory.ts`, `frontend/lib/queries/useInventoryQuery.ts`, 테스트/MSW 같은 E 그룹 대상으로만 분류.
4. 대시보드 smoke:
   - `/mes?tab=dashboard`에서 `자재 목록` 표시 확인.
   - 행 선택 후 우측 상세 패널이 열리는지 확인.
5. 입출고 smoke:
   - `/mes?tab=warehouse`에서 `입출고` 표시 확인.
   - 작성 화면 진입이 깨지지 않는지 확인. 저장/승인은 누르지 않는다.

#### Task A3: 구형 `AdminRightPanelContent.tsx` 삭제

검증 근거:
- 현재 관리 화면은 `DesktopAdminView.tsx` -> `AdminSectionContent.tsx` 경로로 본문 섹션을 렌더한다.
- `AdminRightPanelContent.tsx`는 정의 외 production 사용처가 없다.

실행:
1. 삭제 전 검색:
   - `rg -n 'AdminRightPanelContent' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: 자기 파일의 interface/function 정의만 표시.
2. `frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx` 삭제.
3. 삭제 후 검색:
   - 같은 명령 재실행.
   - 기대: 결과 없음.
4. 관리 탭 smoke:
   - `/mes?tab=admin`에서 `관리자 인증` 표시 확인.
   - PIN `0000` 입력 후 8개 관리 섹션 본문 마커 확인: `모델 목록`, `품목 목록`, `직원 목록`, `부서 목록`, `BOM 내보내기`, `전체 데이터 내보내기`, `외부 제출용 입출고 로그`, `관리자 PIN 변경`.

#### A 그룹 공통 검증

삭제 후 반드시 실행:
1. 참조 검색:
   - `rg -n 'PinLock|ItemDetailSheet|ItemDetailActionForm|ItemDetailHistoryList|AdminRightPanelContent' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: `DesktopPinLock` 관련 결과만 남고, 삭제 대상 파일명/컴포넌트명 결과 없음.
2. 프론트 테스트:
   - `cd frontend && npm test -- --runInBand`
   - 만약 vitest가 `--runInBand`를 지원하지 않으면 `cd frontend && npm test`로 재실행한다.
3. 전체 화면 smoke:
   - 문서의 `전체 화면 Playwright Smoke`와 같은 기준으로 데스크톱 7개 탭, 모바일 7개 탭/하위화면 마커 렌더 확인.

완료 조건:
- 삭제 대상 5개 파일이 사라진다.
- 삭제 대상 컴포넌트명 검색 결과가 없다.
- `DesktopPinLock`과 현재 관리 PIN 화면은 유지된다.
- 대시보드 행 선택, 관리 PIN 해제, 전체 화면 smoke가 통과한다.
- 직접 재고 쓰기 레거시 API 사용처가 production 화면에서 사라지고, 남은 항목은 E 그룹 정리 대상으로만 남는다.


### 2026-06-25 A 그룹 실행 결과

상태: 완료. 파일 삭제, 참조 검색, 프론트 테스트, 전체 Playwright smoke를 완료했다.

삭제 완료:
- `frontend/app/mes/_components/PinLock.tsx`
- `frontend/app/mes/_components/ItemDetailSheet.tsx`
- `frontend/app/mes/_components/ItemDetailActionForm.tsx`
- `frontend/app/mes/_components/ItemDetailHistoryList.tsx`
- `frontend/app/mes/_components/_admin_sections/AdminRightPanelContent.tsx`

추가 정리:
- `frontend/app/mes/_components/mobile/primitives/SegmentedControl.tsx` 주석에서 삭제된 `ItemDetailSheet` 언급 제거.

삭제 후 검색 결과:
- 삭제 대상 컴포넌트명 검색 결과는 `DesktopPinLock` 실사용 경로만 남는다.
- `api.adjustInventory`, `api.receiveInventory`의 production 화면 호출은 사라졌다.
- `receiveInventory`, `adjustInventory`는 프론트 API 래퍼, React Query mutation, 테스트에만 남아 E 그룹 대상으로 이동한다.

검증 완료:
- `cd frontend && npm test`: 74 files / 702 tests passed.
- Playwright desktop smoke 일부 확인:
  - dashboard: `자재 목록` 확인.
  - warehouse: `작업 유형 선택`, `원자재 입고` 본문 확인.
  - defect: `불량 격리`, `격리 목록` 본문 확인.
  - history: `입출고 내역`, `전체 펼치기` 본문 확인.
  - warehouseMap: `창고 지도`, `편집 모드` 본문 확인.
  - weekly: `주간보고`, `생산 현황` 본문 확인.

추가 검증 완료:
- 관리 탭 PIN `0000` 해제 후 `모델 목록` 확인.
- 모바일 7개 탭/하위화면 smoke 재실행 완료.

### B. 모바일 전용 미사용 hook/primitive 정리

조건: 모바일 실제 화면에서 사용되는 primitive와 혼동하지 않는다. `useItems.ts`, `BarcodeScannerModal.tsx`, `NotificationBell`은 삭제 금지다. 특히 `useItems.ts`는 데스크톱 재고 목록 데이터 훅에서 실제 import하므로 위치가 모바일 폴더여도 삭제 후보가 아니다.

1. 모바일 hook 후보:
   - `frontend/app/mes/_components/mobile/hooks/useTransactions.ts`
   - `frontend/app/mes/_components/mobile/hooks/useMobileHistoryAux.ts`
   - `frontend/app/mes/_components/mobile/hooks/useEmployees.ts`
   - 관련 테스트:
     - `frontend/app/mes/_components/mobile/hooks/__tests__/useTransactions.test.tsx`
     - `frontend/app/mes/_components/mobile/hooks/__tests__/useEmployees.test.tsx`
   - 재검증 결과 production 화면 사용처 없이 정의/자체 테스트 중심으로 확인된다. 삭제 전에는 훅 이름 호출 검색과 테스트 import를 분리해서 확인한다.
2. 모바일 primitive 후보:
   - `frontend/app/mes/_components/mobile/primitives/KpiCard.tsx`
   - `frontend/app/mes/_components/mobile/primitives/ItemRow.tsx`
   - `frontend/app/mes/_components/mobile/primitives/StatusBadge.tsx`
   - `frontend/app/mes/_components/mobile/primitives/SectionHeader.tsx`
   - `frontend/app/mes/_components/mobile/primitives/QuickActionGrid.tsx`
   - `frontend/app/mes/_components/mobile/primitives/ErrorAlert.tsx`
   - `frontend/app/mes/_components/mobile/primitives/SubScreenHeader.tsx`
   - `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
   - `frontend/app/mes/_components/mobile/primitives/SummaryChipBar.tsx`
   - `frontend/app/mes/_components/mobile/primitives/FilterChip.tsx`
   - `frontend/app/mes/_components/mobile/primitives/MoreMenuRow.tsx`
   - `frontend/app/mes/_components/mobile/primitives/PersonAvatar.tsx`
   - `index.ts` export 목록도 함께 축소해야 한다.

검증 게이트:

- `rg -n "useMobileHistoryAux|useTransactions\(|fetchMonthLogs\(|useEmployees\(" frontend/app/mes/_components frontend/lib -g "*.tsx" -g "*.ts"`
- 모바일 primitive는 이름 문자열 검색이 `capacityStatusBadge` 같은 부분 문자열까지 잡을 수 있으므로, 삭제 전에는 `frontend/app/mes/_components/mobile/primitives/index.ts` export와 `from "../primitives"` import 목록을 함께 대조한다.
- 모바일 대시보드, 입출고, 불량, 내역, 더보기, 주간보고, 창고 지도 smoke 확인


### B 그룹 삭제 실행 플랜

> **Recommended model: Sonnet** - 모바일 화면 import 경로와 barrel export를 함께 정리해야 해서 단순 파일 삭제보다 한 단계 더 꼼꼼한 확인이 필요하다.
> **Codex execution shape:** solo, reasoning medium. hook 삭제와 primitive 삭제는 순차 처리하고, 모바일 smoke를 한 번에 검증한다.

목표: production 모바일 화면에서 쓰이지 않는 hook/primitive를 삭제하고, 실제 모바일 탭/하위화면 렌더 기준선을 유지한다.

범위:
- 삭제 대상 hook:
  - `frontend/app/mes/_components/mobile/hooks/useTransactions.ts`
  - `frontend/app/mes/_components/mobile/hooks/useMobileHistoryAux.ts`
  - `frontend/app/mes/_components/mobile/hooks/useEmployees.ts`
  - `frontend/app/mes/_components/mobile/hooks/__tests__/useTransactions.test.tsx`
  - `frontend/app/mes/_components/mobile/hooks/__tests__/useEmployees.test.tsx`
- 삭제 대상 primitive:
  - `frontend/app/mes/_components/mobile/primitives/KpiCard.tsx`
  - `frontend/app/mes/_components/mobile/primitives/ItemRow.tsx`
  - `frontend/app/mes/_components/mobile/primitives/StatusBadge.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SectionHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/QuickActionGrid.tsx`
  - `frontend/app/mes/_components/mobile/primitives/ErrorAlert.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SubScreenHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
  - `frontend/app/mes/_components/mobile/primitives/SummaryChipBar.tsx`
  - `frontend/app/mes/_components/mobile/primitives/FilterChip.tsx`
  - `frontend/app/mes/_components/mobile/primitives/MoreMenuRow.tsx`
  - `frontend/app/mes/_components/mobile/primitives/PersonAvatar.tsx`
- 수정 대상:
  - `frontend/app/mes/_components/mobile/primitives/index.ts` export 축소
- 삭제 금지 primitive:
  - `IconButton`, `SheetHeader`, `Stepper`, `StickyFooter`, `WizardProgress`, `InlineSearch`, `AsyncState`, `AsyncSkeletonRows`, `SectionCard`, `SectionCardRow`, `PrimaryActionButton`, `SegmentedControl`, `PinInput`

#### Task B1: 모바일 미사용 hook 삭제

검증 근거:
- `useTransactions`, `useEmployees`는 자체 테스트에서만 호출된다.
- `useMobileHistoryAux`는 production 화면 호출 없이 `useTransactions.ts`의 `fetchMonthLogs`를 내부 import한다.
- 현재 모바일 내역 화면은 `MobileHistoryScreen.tsx`에서 `useHistoryData`, `useMonthlyCountsQuery`, `productionApi`를 직접 사용한다.

실행:
1. 삭제 전 검색:
   - `rg -n 'useTransactions\(|useMobileHistoryAux\(|useEmployees\(|fetchMonthLogs\(' frontend/app/mes/_components frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: hook 정의, `useMobileHistoryAux` 내부 import, 자체 테스트만 표시.
2. hook 3개와 관련 테스트 2개 삭제.
3. 삭제 후 검색:
   - 같은 명령 재실행.
   - 기대: 결과 없음.
4. 모바일 내역 smoke:
   - `/mes?tab=history` 모바일 viewport에서 `내역` 표시 확인.

#### Task B2: 모바일 미사용 primitive 삭제 및 barrel export 축소

검증 근거:
- 실제 모바일 화면 import 목록은 다음 항목만 사용한다: `PinInput`, `InlineSearch`, `IconButton`, `SectionCard`, `StickyFooter`, `Stepper`, `SheetHeader`, `PrimaryActionButton`, `WizardProgress`, `SegmentedControl`, `AsyncState`.
- 후보 primitive는 `index.ts` export와 후보끼리의 내부 참조 중심이다.
- `ItemRow` -> `StatusBadge`, `WizardHeader` -> `SummaryChipBar`처럼 후보끼리 내부 참조가 있으므로 묶어서 삭제한다.

실행:
1. 실제 import 목록 확인:
   - `rg -n '^import .*primitives' frontend/app/mes/_components/mobile -g '*.tsx' -g '*.ts'`
   - 기대: 삭제 금지 primitive만 import됨.
2. 후보 문자열 검색:
   - `rg -n 'KpiCard|ItemRow|StatusBadge|SectionHeader|QuickActionGrid|ErrorAlert|SubScreenHeader|WizardHeader|SummaryChipBar|FilterChip|MoreMenuRow|PersonAvatar' frontend/app/mes/_components/mobile -g '*.tsx' -g '*.ts'`
   - 기대: 삭제 대상 파일, `primitives/index.ts`, 후보끼리 내부 참조만 표시. `capacityStatusBadge` 같은 부분 문자열 오탐은 제외한다.
3. 삭제 대상 primitive 12개 파일 삭제.
4. `frontend/app/mes/_components/mobile/primitives/index.ts`에서 삭제된 export 제거.
   - 남겨야 할 export:
     - `IconButton`
     - `SheetHeader`
     - `Stepper`
     - `StickyFooter`
     - `WizardProgress`
     - `InlineSearch`
     - `AsyncState`, `AsyncSkeletonRows`
     - `SectionCard`, `SectionCardRow`
     - `PrimaryActionButton`
     - `SegmentedControl`, `SegmentedTab`
     - `PinInput`
5. 삭제 후 후보 문자열 검색 재실행.
   - 기대: `capacityStatusBadge` 같은 unrelated 부분 문자열 외 후보 컴포넌트 결과 없음.
6. 모바일 smoke:
   - `/mes?tab=dashboard`에서 `대시보드` 표시
   - `/mes?tab=warehouse`에서 `입출고` 표시
   - `/mes?tab=defect`에서 `불량` 표시
   - `/mes?tab=history`에서 `내역` 표시
   - `/mes?tab=more`에서 `더보기` 표시
   - `/mes?tab=weekly`에서 `주간보고` 표시
   - `/mes?tab=warehouseMap`에서 `창고지도` 표시

#### B 그룹 공통 검증

삭제 후 반드시 실행:
1. 모바일 import 목록 확인:
   - `rg -n '^import .*primitives' frontend/app/mes/_components/mobile -g '*.tsx' -g '*.ts'`
   - 기대: 삭제 금지 primitive만 표시.
2. hook 후보 검색:
   - `rg -n 'useTransactions\(|useMobileHistoryAux\(|useEmployees\(|fetchMonthLogs\(' frontend/app/mes/_components frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: 결과 없음.
3. primitive 후보 검색:
   - `rg -n 'KpiCard|ItemRow|StatusBadge|SectionHeader|QuickActionGrid|ErrorAlert|SubScreenHeader|WizardHeader|SummaryChipBar|FilterChip|MoreMenuRow|PersonAvatar' frontend/app/mes/_components/mobile -g '*.tsx' -g '*.ts'`
   - 기대: 결과 없음 또는 `capacityStatusBadge` 같은 unrelated 부분 문자열만 남음.
4. 프론트 테스트:
   - `cd frontend && npm test`
5. 전체 화면 smoke:
   - 문서의 `전체 화면 Playwright Smoke` 기준으로 데스크톱/모바일 렌더 확인.

완료 조건:
- 삭제 대상 hook/primitive 파일이 사라진다.
- `mobile/primitives/index.ts`가 실제 사용 export만 남긴다.
- 모바일 7개 탭/하위화면 smoke가 통과한다.
- `useItems.ts`, `BarcodeScannerModal.tsx`, `NotificationBell`, 입출고 wizard 관련 primitive는 유지된다.


### 2026-06-25 B 그룹 실행 결과

상태: 완료. 모바일 미사용 hook/primitive 삭제, barrel export 축소, 참조 검색, 프론트 테스트, 전체 Playwright smoke를 완료했다.

삭제 완료 hook/test:
- `frontend/app/mes/_components/mobile/hooks/useTransactions.ts`
- `frontend/app/mes/_components/mobile/hooks/useMobileHistoryAux.ts`
- `frontend/app/mes/_components/mobile/hooks/useEmployees.ts`
- `frontend/app/mes/_components/mobile/hooks/__tests__/useTransactions.test.tsx`
- `frontend/app/mes/_components/mobile/hooks/__tests__/useEmployees.test.tsx`

삭제 완료 primitive:
- `frontend/app/mes/_components/mobile/primitives/KpiCard.tsx`
- `frontend/app/mes/_components/mobile/primitives/ItemRow.tsx`
- `frontend/app/mes/_components/mobile/primitives/StatusBadge.tsx`
- `frontend/app/mes/_components/mobile/primitives/SectionHeader.tsx`
- `frontend/app/mes/_components/mobile/primitives/QuickActionGrid.tsx`
- `frontend/app/mes/_components/mobile/primitives/ErrorAlert.tsx`
- `frontend/app/mes/_components/mobile/primitives/SubScreenHeader.tsx`
- `frontend/app/mes/_components/mobile/primitives/WizardHeader.tsx`
- `frontend/app/mes/_components/mobile/primitives/SummaryChipBar.tsx`
- `frontend/app/mes/_components/mobile/primitives/FilterChip.tsx`
- `frontend/app/mes/_components/mobile/primitives/MoreMenuRow.tsx`
- `frontend/app/mes/_components/mobile/primitives/PersonAvatar.tsx`

수정 완료:
- `frontend/app/mes/_components/mobile/primitives/index.ts` export를 실제 사용 primitive만 남도록 축소.

삭제 후 검색 결과:
- `useTransactions`, `useMobileHistoryAux`, `useEmployees`, `fetchMonthLogs` 결과 없음.
- 삭제 primitive 후보명은 `capacityStatusBadge` 부분 문자열 오탐만 남는다.
- `useItems.ts`, `BarcodeScannerModal.tsx`, `NotificationBell`, 입출고 wizard 관련 primitive는 유지됐다.

검증 완료:
- `cd frontend && npm test`: 72 files / 696 tests passed.
  - A 그룹 직후 74 files / 702 tests에서 B 그룹의 미사용 hook 테스트 2개 파일 6개 테스트가 삭제되어 줄어든 것이 의도한 변화다.
- Playwright 전체 smoke 완료:
  - desktop: dashboard, warehouse, defect, history, warehouseMap, weekly, admin.
  - mobile: dashboard, warehouse, defect, history, more, weekly, warehouseMap.
### C. 공통 셸의 죽은 prop/API 축소

1. `DesktopSidebar.tsx`의 `alertCount` prop
   - `DesktopMesShell.tsx`에서 전달되지만 현재 `DesktopSidebar.tsx` 내부 표시 로직이 확인되지 않는다.
   - 먼저 UX 결정 필요: 사이드바 경고 badge를 살릴지, prop을 제거할지.
2. `frontend/lib/api/notifications.ts`의 `unreadNotificationCount`
   - 현재 화면은 `listNotifications` 응답의 `unread_count`를 사용한다.
   - 재검증 결과 별도 production 사용처가 확인되지 않는다.

검증 게이트:

- `rg -n "alertCount|unreadNotificationCount" frontend/app frontend/lib`
- 데스크톱 공통 셸 Playwright smoke: 사이드바, 상단 상태, 알림, 작업자 메뉴, 동기화, 테마


### C 그룹 축소 실행 플랜

> **Recommended model: Haiku** - 사용되지 않는 prop과 API 함수 제거 중심의 작은 정리다.
> **Codex execution shape:** solo, reasoning low. 한 파일씩 지우고 검색/화면 smoke로 확인하면 충분하다.

목표: 공통 셸에 남은 죽은 prop/API를 제거해 “보이는 기능은 없는데 데이터만 계산/전달하는” 잔재를 줄인다.

범위:
- 수정 대상:
  - `frontend/app/mes/_components/DesktopMesShell.tsx`
  - `frontend/app/mes/_components/DesktopSidebar.tsx`
  - `frontend/lib/api/notifications.ts`
- 삭제 금지:
  - `NotificationBell`, `NotificationPanel`, `useNotificationsQuery`, `listNotifications`, `markNotificationsRead`, `deleteNotification`, `deleteReadNotifications`
  - 대시보드 KPI의 부족/품절 계산 자체. `alertCount` 전달만 제거한다.

#### Task C1: `DesktopSidebar.alertCount` 제거

검증 근거:
- `DesktopMesShell.tsx`는 `alertCount={{ dashboard: ... }}`를 전달한다.
- `DesktopSidebar.tsx`는 `alertCount`를 props로 받지만 내부에서 읽지 않는다.
- 현재 전체 화면 smoke에서 사이드바 badge 없이도 데스크톱 탭 7개가 렌더된다.

실행:
1. 삭제 전 검색:
   - `rg -n 'alertCount' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: `DesktopMesShell.tsx` 전달부, `DesktopSidebar.tsx` props 선언만 표시.
2. `DesktopMesShell.tsx`에서 `alertCount={...}` prop 전달 제거.
3. `DesktopSidebar.tsx`에서 `alertCount` destructuring과 타입 필드 제거.
4. 삭제 후 검색:
   - 같은 명령 재실행.
   - 기대: 결과 없음.
5. 데스크톱 smoke:
   - `/mes?tab=dashboard`에서 `대시보드`, `자재 목록` 표시 확인.
   - 사이드바 탭 7개가 계속 표시되는지 확인.

#### Task C2: `notificationsApi.unreadNotificationCount` 제거

검증 근거:
- 현재 화면은 `listNotifications` 응답의 `unread_count`를 사용한다.
- `unreadNotificationCount`는 API 함수 정의 외 production 사용처가 없다.
- 백엔드 `/api/notifications/unread-count`는 남겨둘 수 있다. 이번 작업은 프론트 미사용 함수 제거만 한다.

실행:
1. 삭제 전 검색:
   - `rg -n 'unreadNotificationCount' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: `frontend/lib/api/notifications.ts` 정의만 표시.
2. `frontend/lib/api/notifications.ts`에서 `unreadNotificationCount` 함수 제거.
3. 삭제 후 검색:
   - 같은 명령 재실행.
   - 기대: 결과 없음.
4. 알림 smoke:
   - 데스크톱 상단 알림 버튼이 표시되는지 확인.
   - 모바일 상단 알림 버튼이 표시되는지 확인.
   - 알림 패널 열기/닫기가 깨지지 않는지 확인. 읽음/삭제 같은 데이터 변경 버튼은 별도 작업 전에는 누르지 않는다.

#### C 그룹 공통 검증

삭제 후 반드시 실행:
1. 참조 검색:
   - `rg -n 'alertCount|unreadNotificationCount' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
   - 기대: 결과 없음.
2. 프론트 테스트:
   - `cd frontend && npm test`
3. 전체 화면 smoke:
   - 문서의 `전체 화면 Playwright Smoke` 기준으로 데스크톱/모바일 렌더 확인.

완료 조건:
- `alertCount`와 `unreadNotificationCount` 검색 결과가 없다.
- 데스크톱 사이드바/상단바/알림/작업자 메뉴 smoke가 통과한다.
- 알림 목록은 여전히 `listNotifications` 기반으로 동작한다.

### D. 위험 API 제거 또는 잠금

이 그룹은 단순 삭제보다 운영 안전장치에 가깝다. 화면에서 안 보인다고 바로 지우면 테스트와 백엔드 호환 계약이 깨질 수 있으므로 별도 PR/작업 단위로 진행한다.

1. DB reset 경로
   - 프론트 잔재:
     - `frontend/lib/api/admin.ts`의 `resetDatabase`
     - `frontend/lib/queries/useAdminQuery.ts`의 `useResetDatabaseMutation`
     - `frontend/lib/queries/useSettingsQuery.ts`의 `useResetDatabaseMutation`
     - 관련 테스트/MSW
   - 백엔드 경로:
     - `backend/app/routers/settings.py`의 `POST /api/settings/reset`
   - 운영에서 쓰지 않을 거면 제거가 맞다. 최소한 개발 전용 플래그 뒤로 숨겨야 한다.
2. 관리자 서버 권한 누락 보강
   - 모델 생성, 품목 생성/수정/삭제성 작업, 직원 생성/수정/삭제, BOM 생성/수정/삭제, 감사 CSV/감사 로그 조회에 서버 `require_admin_pin` 적용이 필요하다.
   - 삭제 큐와 별개로 “엑셀 폐기 수준 운영 신뢰성”의 선행 작업이다.
3. 알림 API 보안 보강
   - 현재 알림 조회/읽음/삭제가 `recipient_employee_id` 쿼리 기반이다.
   - 서버에서 현재 작업자 식별과 recipient를 대조하는 장치가 약하다.

검증 게이트:

- `rg -n "resetDatabase|/api/settings/reset|useResetDatabaseMutation" frontend backend`
- 관리자 PIN 없음/오류/정상 케이스 테스트
- 다른 직원 `employee_id`로 알림 조회/삭제 시도 차단 테스트


### D 그룹 운영 안전장치 실행 플랜

> **Recommended model: Opus** - 관리자 권한, DB reset, 알림 소유자 검증은 운영 보안과 데이터 보존에 직접 연결되는 고위험 변경이다.
> **Codex execution shape:** solo with checkpoints, reasoning high. 세 하위 작업은 독립성이 있지만 모두 권한/보안 표면이라 한 흐름에서 정책 일관성을 유지하는 편이 안전하다.

목표: 화면에서 숨겨진 위험 API와 서버 권한 누락을 정리해, 실제 운영에서 화면 잠금만 우회하면 마스터/알림/DB를 변경할 수 있는 경로를 줄인다.

범위:
- D1: DB reset 경로 제거 또는 개발 전용 잠금
- D2: 관리자 서버 PIN 의존성 확대
- D3: 알림 recipient 소유자 검증 보강

#### Task D1: DB reset 경로 제거 또는 개발 전용 잠금

현재 증거:
- 프론트 API: `frontend/lib/api/admin.ts`의 `resetDatabase`
- 프론트 query: `frontend/lib/queries/useAdminQuery.ts`, `frontend/lib/queries/useSettingsQuery.ts`의 `useResetDatabaseMutation`
- 테스트/MSW: `frontend/lib/__tests__/api-admin.test.ts`, `useAdminQuery.test.ts`, `useSettingsQuery.test.ts`, `msw/handlers/settings.ts`
- 백엔드 라우터: `backend/app/routers/settings.py`의 `POST /api/settings/reset`
- 관리 UI에서는 `useAdminSettings.ts` 주석상 reset 제거 흔적이 있다.

권장 정책:
- 운영에서 쓰지 않는다면 완전 제거가 가장 단순하다.
- 개발/테스트 유지가 필요하면 `NEXT_PUBLIC_MES_ENV === "dev"` 같은 프론트 조건만으로는 부족하다. 백엔드에서도 명시적인 서버 설정으로 차단해야 한다.
- 실무 사용 기준에서는 “백엔드 route 제거 또는 404/403 고정”을 우선 권장한다.

실행:
1. 삭제/잠금 정책 결정:
   - 권장: 백엔드 `/api/settings/reset` 제거, 프론트 `resetDatabase`/mutation/test/MSW 제거.
   - 대안: 백엔드에서 dev 플래그 없으면 403, 프론트에서는 개발 환경에서만 노출.
2. 삭제 전 검색:
   - `rg -n 'resetDatabase|useResetDatabaseMutation|/api/settings/reset|settings/reset' frontend backend -g '*.ts' -g '*.tsx' -g '*.py'`
3. 프론트 제거 시 수정 대상:
   - `frontend/lib/api/admin.ts`
   - `frontend/lib/queries/useAdminQuery.ts`
   - `frontend/lib/queries/useSettingsQuery.ts`
   - 관련 테스트와 MSW handler
4. 백엔드 제거/잠금 시 수정 대상:
   - `backend/app/routers/settings.py`
   - 관련 백엔드 테스트가 있으면 제거/수정
5. 삭제 후 검색:
   - 같은 `rg` 명령 재실행.
   - 완전 제거 정책이면 결과 없음이 기대값이다. dev 잠금 정책이면 백엔드 guard와 테스트만 남아야 한다.
6. 검증:
   - 관리자 PIN 변경은 계속 동작해야 한다: `/api/settings/admin-pin`
   - 로그인/관리 화면 smoke 유지
   - 운영 모드에서 `/api/settings/reset` 호출 시 404 또는 403

완료 조건:
- 운영에서 DB reset을 호출할 수 없다.
- 프론트 production 코드에서 resetDatabase/useResetDatabaseMutation 결과가 없다.
- “DB 초기화” 관련 MSW/테스트가 정책에 맞게 삭제 또는 dev-only로 명확해진다.

#### Task D2: 관리자 서버 PIN 의존성 확대

현재 증거:
- 이미 보호됨:
  - 부서 create/reorder/update/delete: `backend/app/routers/departments.py`
  - 모델 reorder/update/delete: `backend/app/routers/models.py`
  - 품목 reorder: `backend/app/routers/items.py`
  - 직원 PIN reset: `backend/app/routers/employees.py`
- 보호 누락 후보:
  - 모델 생성: `backend/app/routers/models.py` `POST ""`
  - 품목 생성/update/bom-completion/soft-delete/restore: `backend/app/routers/items.py`
  - 직원 생성/update/delete: `backend/app/routers/employees.py`
  - BOM create/update/delete: `backend/app/routers/bom.py`
  - admin audit/audit-csv 조회·다운로드·백필: `backend/app/routers/admin_audit.py`, `backend/app/routers/admin_audit_csv.py`

실행:
1. 공통 패턴 확인:
   - `backend/app/dependencies/admin.py`의 `require_admin_pin` 사용법을 따른다.
   - protected handler signature 예: `_admin: Annotated[None, Depends(require_admin_pin)]`
2. 라우터별 테스트를 먼저 작성/수정한다.
   - 관리자 PIN 없음: 400 또는 현재 dependency의 오류 응답 기대
   - 관리자 PIN 틀림: 403 기대
   - 관리자 PIN 정상: 기존 성공 응답 유지
3. 라우터에 `require_admin_pin` 추가.
   - 조회성 일반 업무 API는 함부로 잠그지 않는다. 마스터 쓰기와 관리자 전용 감사/외부 제출용 API만 대상이다.
4. 프론트는 이미 `AdminSessionProvider`/`api-core.ts`가 `X-Admin-Pin`을 주입한다. 기존 관리 화면에서 PIN 해제 후 호출되는 API가 정상 동작하는지 확인한다.
5. 검증 명령:
   - `rg -n '@router\.(post|put|patch|delete|get)|require_admin_pin|Depends\(require_admin_pin\)' backend/app/routers/models.py backend/app/routers/items.py backend/app/routers/employees.py backend/app/routers/bom.py backend/app/routers/admin_audit.py backend/app/routers/admin_audit_csv.py backend/app/routers/departments.py`
   - `cd backend && pytest backend/tests/dependencies/test_admin.py backend/tests/routers/test_employee_pin.py backend/tests/routers/test_admin_audit.py -q` 또는 실제 테스트 경로에 맞춰 실행
   - 관리 탭 8개 섹션 smoke

완료 조건:
- 관리 화면에서 가능한 마스터 쓰기 API는 서버에서도 관리자 PIN을 요구한다.
- 감사/외부 제출용 로그 API도 서버 PIN 없이 접근할 수 없다.
- PIN 해제된 정상 관리 화면은 기존처럼 동작한다.

#### Task D3: 알림 recipient 소유자 검증 보강

현재 증거:
- 프론트는 현재 작업자 `employeeId`를 query/payload로 보낸다.
- 백엔드는 `recipient_employee_id` query/payload 기준으로 조회/읽음/삭제를 수행한다.
- 서버 세션 인증이 강하지 않은 구조라, 현 상태에서는 다른 직원 UUID를 아는 사용자가 알림을 조회/삭제할 수 있는 위험이 있다.

정책 선택지:
- 최소 보강: 알림 API에 작업자 PIN/session 검증을 추가하지 않고, 프론트에서만 employeeId를 숨기는 것은 충분하지 않다.
- 권장 보강: 알림 API 요청에 현재 작업자 식별 헤더 또는 PIN 검증 흐름을 도입하고, 서버에서 recipient와 actor를 대조한다.
- 현실적 단계: 기존 앱 인증 구조가 localStorage 작업자 식별 수준이라면, 먼저 “recipient를 클라이언트 query로 받는 API”를 서버 actor 기반 API로 바꾸는 별도 설계가 필요하다.

실행:
1. 현재 알림 API 계약 정리:
   - `frontend/lib/api/notifications.ts`
   - `frontend/lib/queries/useNotificationsQuery.ts`
   - `backend/app/routers/notifications.py`
   - `backend/app/schemas/notification.py`
2. 보강안 결정:
   - 단기: employee PIN 재검증이 필요한 민감 action으로 `mark-read`, `delete`를 잠근다.
   - 중기: 프론트가 recipient를 보내지 않고 서버가 현재 actor 기준으로 알림을 조회하도록 API 계약 변경.
3. 테스트 작성:
   - 본인 recipient 조회/읽음/삭제 성공
   - 다른 recipient 조회/읽음/삭제 차단
   - 없는 recipient/notification 처리 유지
4. 구현:
   - 선택한 actor 검증 방식에 맞춰 `backend/app/routers/notifications.py` 수정
   - 프론트 API/query payload 수정
   - MSW/API 테스트 수정
5. 검증:
   - `backend/tests/test_notifications.py`
   - `frontend/lib/__tests__/api-notifications.test.ts`
   - 데스크톱/모바일 알림 패널 smoke

완료 조건:
- 다른 직원 `employee_id`로 알림 조회/읽음/삭제를 시도하면 서버에서 차단된다.
- 본인 알림 UI는 계속 열리고 unread count/list가 유지된다.
- 알림 클릭 후 대상 탭 이동이 유지된다.

### E. 직접 재고 쓰기 레거시 라우터 정리

이 그룹은 가장 조심스럽게 진행한다. 실제 화면 사용처는 거의 끊겼지만, 백엔드 테스트와 프론트 API 래퍼가 아직 남아 있다.

후보:

- 프론트 직접 쓰기 래퍼:
  - `frontend/lib/api/inventory.ts`의 `receiveInventory`, `adjustInventory`, `transferToProduction`, `transferToWarehouse`, `transferBetweenDepts`, `markDefective`, `returnToSupplier`
- 프론트 mutation 훅:
  - `frontend/lib/queries/useInventoryQuery.ts`의 직접 쓰기 mutation들
- 백엔드 라우터:
  - `backend/app/routers/inventory/receive.py`
  - `backend/app/routers/inventory/transfer.py`
  - `backend/app/routers/inventory/defective.py`
  - `backend/app/routers/inventory/supplier.py`
- 테스트/MSW:
  - `frontend/lib/__tests__/api-inventory.test.ts`
  - `frontend/lib/__tests__/query-inventory.test.ts`
  - `frontend/lib/__tests__/msw/handlers/inventory.ts`
  - `backend/tests/routers/test_inventory_smoke.py`
  - `backend/tests/test_transaction_cancel.py` 일부가 `/api/inventory/receive`를 fixture로 사용한다.

중요 보존:

- `frontend/lib/api/inventory.ts` 전체 삭제 금지. `getInventorySummary`, `getItemLocations` 등 조회 API가 남아 있을 수 있다.
- `backend/app/routers/inventory/transactions.py` 삭제 금지. 입출고 내역, 취소, 보정, export가 실제 화면에서 사용된다.
- `TransactionTypeEnum.ADJUST` 삭제 금지. 내역/주간보고/CSV/취소/보정/부서 조정 흐름에서 살아 있다.

실행 순서:

1. 화면에서 직접 쓰기 API 호출이 완전히 사라졌는지 `rg`로 재확인한다.
2. 직접 쓰기 라우터를 운영 잠금하거나 제거할 정책을 결정한다.
3. 백엔드 테스트 fixture를 IO v2 또는 서비스 직접 호출로 교체한다.
4. 프론트 래퍼/mutation/test/MSW를 제거한다.
5. 백엔드 라우터 include를 제거한다.
6. inventory smoke/transaction cancel/history/e2e 입출고 흐름을 검증한다.

검증 게이트:

- `rg -n "receiveInventory|adjustInventory|transferToProduction|transferToWarehouse|transferBetweenDepts|markDefective|returnToSupplier" frontend -g "*.tsx" -g "*.ts"`
- `rg -n "/api/inventory/receive|/api/inventory/adjust|transfer-to-production|transfer-to-warehouse|transfer-between-depts|mark-defective|return-to-supplier" frontend backend -g "*.tsx" -g "*.ts" -g "*.py"`
- 입출고 요청 작성/승인/내역/취소/불량 smoke


### E 그룹 직접 재고 쓰기 레거시 API 정리 실행 플랜

> **Recommended model: Opus** - 재고 수량 변경 API 제거는 테스트 fixture, 백엔드 라우터, 프론트 API 계약을 동시에 건드리는 고위험 정리다.
> **Codex execution shape:** solo with checkpoints, reasoning high. A 그룹 삭제 이후에만 진행한다.

목표: 현재 운영 화면이 사용하는 IO v2/거래 내역/취소 흐름은 유지하면서, 구형 직접 재고 쓰기 라우터와 프론트 래퍼를 제거하거나 운영에서 호출 불가능하게 만든다.

선행 조건:
- A 그룹 `ItemDetailSheet` 계열 삭제 완료.
- 삭제 후 `frontend/app` production 화면에서 `api.adjustInventory`, `api.receiveInventory` 직접 호출이 0건이어야 한다.

#### Task E1: 프론트 직접 쓰기 래퍼와 mutation 제거

현재 증거:
- `frontend/lib/api/inventory.ts`는 조회 API와 직접 쓰기 API가 섞여 있다.
- `frontend/lib/queries/useInventoryQuery.ts`는 조회 hook 2개와 직접 쓰기 mutation이 섞여 있다.
- 관련 테스트/MSW가 구형 endpoint를 보존하고 있다.

실행:
1. 삭제 전 검색:
   - `rg -n 'receiveInventory|adjustInventory|transferToProduction|transferToWarehouse|transferBetweenDepts|markDefective|returnToSupplier' frontend -g '*.tsx' -g '*.ts'`
2. `frontend/lib/api/inventory.ts`에서 직접 쓰기 함수 제거.
   - 남길 함수: `getInventorySummary`, `getItemLocations`
3. `frontend/lib/queries/useInventoryQuery.ts`에서 직접 쓰기 mutation 제거.
   - 남길 hook: `useInventorySummaryQuery`, `useItemLocationsQuery`
4. 테스트/MSW 정리:
   - `frontend/lib/__tests__/api-inventory.test.ts`에서 직접 쓰기 테스트 제거 또는 조회 API 테스트만 남김
   - `frontend/lib/__tests__/query-inventory.test.ts`에서 mutation 테스트 제거
   - `frontend/lib/__tests__/msw/handlers/inventory.ts`에서 구형 write handler 제거
5. 삭제 후 검색:
   - 같은 `rg` 명령 재실행.
   - 기대: 결과 없음 또는 백엔드/문서 제외. 프론트 production/test에서 구형 wrapper 이름이 없어야 한다.
6. 프론트 검증:
   - `cd frontend && npm test`
   - 대시보드/입출고/불량/내역 smoke

완료 조건:
- 프론트에서 구형 직접 쓰기 API wrapper/mutation/test가 제거된다.
- 조회 API와 현재 화면은 유지된다.

#### Task E2: 백엔드 legacy inventory write 라우터 제거 또는 잠금

현재 증거:
- `backend/app/routers/inventory/__init__.py`에서 다음 라우터를 include한다:
  - `receive.router`
  - `transfer.router`
  - `defective.router`
  - `supplier.router`
- 유지해야 할 라우터:
  - `transactions.router`
  - `query.router`
  - `weekly_report.router`
  - list inventory `GET ""`
- legacy write endpoint는 백엔드 테스트 fixture에서 사용 중이다.

권장 정책:
- 운영 신뢰성 관점에서는 구형 write router include 제거가 가장 명확하다.
- 단번에 제거가 어렵다면 운영잠금 guard를 먼저 넣고, 테스트 fixture 교체 후 파일 삭제로 간다.

실행 순서:
1. 백엔드 테스트 fixture 교체 계획 확정.
   - `backend/tests/test_transaction_cancel.py`의 `/api/inventory/receive` fixture는 IO v2 또는 서비스 직접 seed로 교체한다.
   - `backend/tests/routers/test_inventory_smoke.py`는 legacy smoke 목적이면 삭제하거나 IO v2 smoke로 재작성한다.
2. 라우터 include 제거 또는 guard 적용.
   - 제거 대상 include: `receive`, `transfer`, `defective`, `supplier`
   - 보존 대상 include: `transactions`, `query`, `weekly_report`
3. 필요 없어지면 파일 삭제 후보:
   - `backend/app/routers/inventory/receive.py`
   - `backend/app/routers/inventory/transfer.py`
   - `backend/app/routers/inventory/defective.py`
   - `backend/app/routers/inventory/supplier.py`
4. 삭제 후 검색:
   - `rg -n '/api/inventory/receive|/api/inventory/adjust|transfer-to-production|transfer-to-warehouse|transfer-between-depts|mark-defective|return-to-supplier' frontend backend -g '*.tsx' -g '*.ts' -g '*.py'`
   - 기대: 운영 코드 결과 없음. 남는 항목은 마이그레이션/문서/의도된 테스트 설명만 허용.
5. 백엔드 검증:
   - 거래 취소 테스트
   - 입출고 요청 작성/승인 관련 테스트
   - 불량 처리 테스트
   - 재고 조회/내역/주간보고 테스트

완료 조건:
- 구형 직접 쓰기 endpoint가 운영 라우터에서 빠지거나 명시적으로 차단된다.
- 현재 화면의 입출고/불량/내역/취소 흐름은 유지된다.
- `TransactionTypeEnum.ADJUST`와 transaction history/cancel 라우터는 유지된다.

#### Task E3: E 그룹 완료 검증

삭제 후 반드시 확인:
1. 프론트 검색:
   - `rg -n 'receiveInventory|adjustInventory|transferToProduction|transferToWarehouse|transferBetweenDepts|markDefective|returnToSupplier' frontend -g '*.tsx' -g '*.ts'`
2. 백엔드 endpoint 검색:
   - `rg -n '/api/inventory/receive|/api/inventory/adjust|transfer-to-production|transfer-to-warehouse|transfer-between-depts|mark-defective|return-to-supplier' frontend backend -g '*.tsx' -g '*.ts' -g '*.py'`
3. 화면 smoke:
   - 입출고 요청 작성 화면 진입
   - 불량 화면 진입
   - 입출고 내역 상세/취소 버튼 표시 확인. 실제 취소는 테스트 DB에서만 수행.
4. 테스트:
   - 관련 프론트 테스트
   - 관련 백엔드 inventory/transaction/cancel/io 테스트

완료 조건:
- production 화면과 프론트 API에서 직접 재고 쓰기 경로가 없다.
- 백엔드 운영 라우터에서 legacy write endpoint가 호출 불가능하다.
- 현재 입출고 v2, 불량, 내역, 취소 흐름은 유지된다.

### F. 이름/중복 정리 후보

이 그룹은 운영 위험은 낮지만, 과거 잔재처럼 보이는 혼란을 줄인다.

1. `AdminAuditCsvSection` 이름 정리
   - 실제 기능은 감사 로그가 아니라 외부 제출용 CSV/XLSX 관리다.
   - `AdminAuditCsvSection` 같은 이름이 더 맞다.
2. 거래 query hook 중복 정리
   - `frontend/lib/queries/useProductionQuery.ts`와 `frontend/lib/queries/useTransactionsQuery.ts`에 거래 관련 mutation/query가 중복된다.
   - `useProductionQuery.ts`는 생산 가능수량/PIN 관련 훅도 살아 있으므로 파일 전체 삭제 금지.
   - 거래 내역 관련 훅은 `useTransactionsQuery.ts`로 모으는 방향이 좋다.
3. `NotificationPanel`의 request type 라벨 보정 책임 정리
   - 백엔드와 프론트가 모두 보정 책임을 일부 갖고 있다.

검증 게이트:

- 전체 rename 후 old name grep
- 내역 화면, 관리 외부 제출용 로그 화면, 알림 패널 smoke


### F 그룹 이름/중복 정리 실행 플랜

> **Recommended model: Sonnet** - 기능 변경은 작지만 rename, query hook 중복, 프론트/백엔드 라벨 책임 정리가 여러 파일과 문서 grep을 요구한다.
> **Codex execution shape:** solo, reasoning medium. rename은 한 번에 끝내고 old name grep까지 닫아야 한다.

목표: 운영 기능은 그대로 두고, 과거 잔재처럼 보이는 이름/중복/책임 분산을 정리해 향후 삭제 판단과 유지보수를 쉽게 만든다.

#### Task F1: `AdminAuditCsvSection` 이름을 실제 기능명으로 변경

현재 증거:
- 파일/컴포넌트명: `frontend/app/mes/_components/_admin_sections/AdminAuditCsvSection.tsx`
- 실제 화면 제목: `외부 제출용 입출고 로그`
- 실제 API: `/api/admin/audit-csv/*`
- 실제 감사로그 API `/api/admin/audit-logs`는 별도 백엔드 라우터이며 이 화면과 역할이 다르다.

권장 이름:
- `AdminAuditCsvSection.tsx`
- `AdminAuditCsvSection`

실행:
1. rename 전 검색:
   - `rg -n 'AdminAuditCsvSection|AdminAuditCsvSection|audit-csv|audit-logs' frontend backend _attic/docs -g '*.tsx' -g '*.ts' -g '*.py' -g '*.md'`
2. 파일명 변경:
   - `frontend/app/mes/_components/_admin_sections/AdminAuditCsvSection.tsx` → `AdminAuditCsvSection.tsx`
3. import/export 변경:
   - `frontend/app/mes/_components/_admin_sections/AdminSectionContent.tsx`
4. 문서 갱신:
   - 이 기준선 문서의 `AdminAuditCsvSection` 언급을 새 이름으로 변경하되, 백엔드 `admin_audit.py`/`audit-logs` 문맥은 그대로 둔다.
   - `_attic/docs`의 역사 기록은 필요한 경우 `[STALE]` 또는 “과거 이름”으로 명시한다.
5. rename 후 검색:
   - `rg -n 'AdminAuditCsvSection' frontend/app frontend/lib _attic/docs -g '*.tsx' -g '*.ts' -g '*.md'`
   - 기대: 결과 없음 또는 의도적으로 남긴 과거 기록만 명시.
6. 관리 외부 제출용 로그 smoke:
   - `/mes?tab=admin` → PIN `0000` → `외부 제출용 로그` 클릭 → `외부 제출용 입출고 로그` 표시.

완료 조건:
- 화면 컴포넌트 이름이 실제 기능과 일치한다.
- 백엔드 감사로그 API와 외부 제출용 CSV 화면이 이름상 혼동되지 않는다.

#### Task F2: 거래 query hook 중복 정리

현재 증거:
- `frontend/lib/queries/useTransactionsQuery.ts`는 거래 리스트/집계/수정/월별 카운트를 담당한다.
- `frontend/lib/queries/useProductionQuery.ts`에도 `useTransactionsQuery`, `useTransactionEditsQuery`, `useMetaEditTransactionMutation`, `useQuantityCorrectMutation`가 남아 있다.
- `useProductionQuery.ts`는 생산 가능량, PF PIN, 생산 입고 hook도 살아 있으므로 파일 전체 삭제 금지다.

권장 방향:
- 거래 내역 관련 query/mutation은 `useTransactionsQuery.ts`로 모은다.
- `useProductionQuery.ts`에는 생산 가능량/PF PIN/생산 입고 관련 hook만 남긴다.
- 이름 차이 정리: `useQuantityCorrectMutation`은 `useQuantityCorrectTransactionMutation`으로 통일하거나 호출처를 모두 `useTransactionsQuery.ts`로 이동한다.

실행:
1. 호출처 검색:
   - `rg -n 'useTransactionsQuery|useTransactionEditsQuery|useMetaEditTransactionMutation|useQuantityCorrectMutation|useQuantityCorrectTransactionMutation' frontend/app frontend/lib -g '*.tsx' -g '*.ts'`
2. 호출처가 `useProductionQuery.ts`의 거래 hook을 쓰고 있다면 `useTransactionsQuery.ts`로 import 변경.
3. `useProductionQuery.ts`에서 거래 리스트/수정 관련 중복 hook 제거.
4. `queryKeys.production.transactions`/`transactionEdits` 사용처가 사라지는지 확인하고, 필요하면 key 정리 후보로 별도 기록한다. 단, 같은 턴에서 과도하게 queryKeys를 정리하지 않는다.
5. 테스트/빌드 검증:
   - `cd frontend && npm test`
   - 입출고 내역 desktop/mobile smoke

완료 조건:
- 거래 내역 관련 React Query hook의 단일 원천이 `useTransactionsQuery.ts`로 정리된다.
- `useProductionQuery.ts`는 생산 도메인 hook만 남긴다.
- 입출고 내역 화면과 수정/보정 기능이 유지된다.

#### Task F3: 알림 request type 라벨 책임 정리

현재 증거:
- 백엔드 `backend/app/services/notifications.py`는 `_REQUEST_TYPE_LABEL`로 알림 body를 한글화한다.
- 프론트 `NotificationPanel.tsx`는 body에 원시 request type이 섞일 경우 `REQUEST_TYPE_LABEL`로 다시 치환한다.
- 프론트 `frontend/lib/io/glossary.ts`도 request type label의 원천이다.

권장 방향:
- 단기: 프론트 `humanizeBody`는 방어 로직으로 유지하되, 주석을 “백엔드가 정상 한글화하지만 과거 알림/외부 데이터 방어”로 바꾼다.
- 중기: 백엔드와 프론트 라벨 맵을 한쪽에서 생성하거나 테스트로 동기화한다.
- 지금 삭제 목표에서는 기능 변경 없이 책임 설명만 명확히 하는 것을 우선한다.

실행:
1. 라벨 맵 검색:
   - `rg -n 'REQUEST_TYPE_LABEL|_REQUEST_TYPE_LABEL|humanizeBody|formatRequestNotes' frontend backend -g '*.ts' -g '*.tsx' -g '*.py'`
2. `NotificationPanel.tsx` 주석 정리:
   - “백엔드가 원시값을 그대로 넣는 경우”라는 현재 설명은 최신 백엔드와 충돌한다.
   - “과거 알림 또는 외부 생성 데이터 방어”로 바꾼다.
3. 필요 시 테스트 추가/수정:
   - `humanizeBody`가 raw token을 한글 라벨로 바꾸는 동작이 유지되는지 확인.
   - 이미 직접 export되지 않는 내부 함수라면 컴포넌트 렌더 테스트로 검증하거나 문서 후보로만 둔다.
4. smoke:
   - 알림 패널 열기
   - 알림 body가 깨지지 않는지 확인

완료 조건:
- 알림 라벨 책임 설명이 현재 백엔드 동작과 모순되지 않는다.
- 방어 로직은 유지되어 과거 raw body도 표시 가능하다.

#### F 그룹 공통 검증

1. rename 후 old name grep:
   - `rg -n 'AdminAuditCsvSection' frontend/app frontend/lib _attic/docs -g '*.tsx' -g '*.ts' -g '*.md'`
2. 거래 hook 중복 grep:
   - `rg -n 'export function useTransactionsQuery|export function useTransactionEditsQuery|export function useMetaEditTransactionMutation|export function useQuantityCorrect' frontend/lib/queries -g '*.ts'`
3. 알림 라벨 grep:
   - `rg -n 'REQUEST_TYPE_LABEL|_REQUEST_TYPE_LABEL|humanizeBody' frontend backend -g '*.ts' -g '*.tsx' -g '*.py'`
4. 화면 smoke:
   - 관리 외부 제출용 로그
   - 입출고 내역 desktop/mobile
   - 알림 패널 desktop/mobile

완료 조건:
- 이름이 실제 기능과 일치한다.
- 거래 query hook 중복이 줄어든다.
- 알림 라벨 책임 설명이 최신 코드와 맞는다.

### 현재 우선순위 추천

1. A 그룹: `PinLock`, `ItemDetailSheet` 계열, `AdminRightPanelContent` 삭제
2. B 그룹: 모바일 미사용 hook/primitive 삭제
3. C 그룹: `alertCount`, `unreadNotificationCount` 축소
4. D 그룹: DB reset 제거/잠금 + 관리자 서버 권한 보강
5. E 그룹: 직접 재고 쓰기 라우터 정리
6. F 그룹: 이름/중복 정리

추천 이유:

- A/B/C는 실제 화면 경로가 거의 없고 영향 범위가 작다.
- D는 운영 신뢰성에 직접 연결되므로 빠르게 해야 하지만, 삭제보다 보안 정책 변경에 가깝다.
- E는 재고 정합성의 핵심 경로라 가장 신중해야 한다. 화면 사용처가 사라졌더라도 테스트와 백엔드 fixture를 먼저 바꿔야 한다.
- F는 혼란을 줄이는 작업이지만, 기능 안정화보다 우선하지 않는다.




































### 2026-06-25 D 그룹 실행 결과

D1 DB reset 경로 제거:
- backend `/api/settings/reset` route 제거.
- frontend `adminApi.resetDatabase`, reset mutation hook, MSW handler, 관련 테스트 제거.
- 검증: `python -m pytest tests/routers/test_settings_integrity.py -q` 통과.
- 검증: `npm test -- lib/__tests__/api-admin.test.ts lib/queries/useAdminQuery.test.ts lib/queries/useSettingsQuery.test.ts` 통과.
- 검색: `resetDatabase|useResetDatabaseMutation|/api/settings/reset|settings/reset|reset_database`는 제거 확인용 backend test만 남음.

D2 관리자 서버 PIN 의존성 확대:
- 보호 추가: model create, item create/update/bom-completion/soft-delete/restore, employee create/update/delete, BOM create/update/delete.
- 보호 추가: admin audit/audit-csv 조회, 다운로드, backfill.
- 조회성 일반 업무 API는 잠그지 않음.
- 검증: `python -m pytest tests/routers/test_admin_pin_guards.py tests/routers/test_models.py tests/routers/test_items_create.py tests/routers/test_items_update.py tests/routers/test_employee_io_enabled.py tests/routers/test_bom_smoke.py tests/routers/test_admin_audit.py tests/routers/test_admin_audit_csv.py -q` 통과.

D3 알림 recipient 소유자 검증:
- backend notifications API가 `X-Actor-Employee-Id`와 `recipient_employee_id` 일치를 요구하도록 보강.
- frontend notifications API가 actor header를 함께 전송하도록 변경.
- 검증: `python -m pytest tests/test_notifications.py -q` 통과.
- 검증: `npm test -- lib/__tests__/api-notifications.test.ts` 통과.

D 그룹 묶음 검증:
- `python -m pytest tests/dependencies/test_admin.py tests/routers/test_employee_pin.py tests/routers/test_settings_integrity.py tests/routers/test_admin_pin_guards.py tests/test_notifications.py -q` 통과.

남은 주의:
- 알림 actor header는 현재 앱 인증 구조에 맞춘 최소 서버 대조다. 강한 서버 세션/토큰 인증은 별도 설계 과제다.

### 2026-06-25 E 그룹 실행 결과

직접 재고 쓰기 레거시 라우터 정리:
- frontend `inventoryApi`에서 직접 write wrapper 제거: receive/adjust/transfer/markDefective/returnToSupplier.
- frontend `useInventoryQuery.ts`에서 직접 write mutation hook 제거. summary/location read hook만 유지.
- frontend inventory API/query/MSW 테스트를 read-only 기준으로 축소.
- backend inventory router에서 legacy write router include 제거.
- 삭제 파일:
  - `backend/app/routers/inventory/receive.py`
  - `backend/app/routers/inventory/transfer.py`
  - `backend/app/routers/inventory/defective.py`
  - `backend/app/routers/inventory/supplier.py`
- `backend/tests/test_transaction_cancel.py`의 receive fixture를 IO v2 receive 경로로 교체.
- `backend/tests/routers/test_inventory_smoke.py`는 legacy write endpoint가 404인지 확인하는 테스트로 변경.

검증:
- `python -m pytest tests/test_transaction_cancel.py tests/routers/test_inventory_smoke.py -q` 통과.
- `npm test -- lib/__tests__/api-inventory.test.ts lib/__tests__/query-inventory.test.ts` 통과.
- 검색 결과: 운영 코드에는 직접 write wrapper/endpoint 참조 없음. 남은 endpoint 문자열은 제거 확인 테스트와 schema 설명뿐.

### 2026-06-25 F 그룹 실행 결과

F1 이름 정리:
- `AdminAuditLogSection.tsx`를 `AdminAuditCsvSection.tsx`로 rename.
- `AdminSectionContent.tsx` import/render 이름 변경.
- 실제 기능명인 외부 제출용 CSV/XLSX 관리 화면과 이름을 맞춤.

F2 거래 query hook 중복 정리:
- `useProductionQuery.ts`에서 거래 리스트/수정/보정 hook 제거.
- 거래 관련 hook의 단일 원천은 `useTransactionsQuery.ts`로 정리.
- `useProductionQuery.ts`는 production capacity, PF pin, production receipt hook만 유지.

F3 알림 라벨 책임 설명 정리:
- `NotificationPanel.tsx`의 `humanizeBody` 주석을 최신 구조에 맞게 수정.
- 백엔드는 새 알림을 한글 라벨로 저장하고, frontend 방어 로직은 과거 알림/외부 생성 데이터 대응으로 유지.

검증:
- `npm test -- lib/queries/useProductionQuery.test.ts lib/__tests__/query-transactions.test.ts lib/__tests__/api-admin.test.ts` 통과.
- frontend 코드 검색에서 `AdminAuditCsvSection`만 실제 import/render에 남음.
- 거래 hook 중복은 `useTransactionsQuery.ts`와 해당 테스트로 수렴.

## Final verification - 2026-06-25

- powershell -ExecutionPolicy Bypass -File .\scripts\dev\verify_local.ps1: PASS. Backend pytest, frontend strict lint, type check, Vitest coverage, production build, bundle size, OpenAPI drift all passed after regenerating _dev/baselines/openapi.json for the intentional API removals/guard changes.
- Playwright smoke (C:/tmp/mes-smoke-operational.js, removed after run): PASS. Desktop dashboard/warehouse/defect/history/warehouseMap/weekly/admin and mobile dashboard/warehouse/defect/history/more/weekly/warehouseMap rendered. Admin PIN entry and audit CSV section navigation were included.
- Temporary work directories/files created by this session were removed.

## 2026-06-25 운영 안전장치 진행 로그 - 거래 취소 효과 검증

목표: 엑셀 없이 DEXCOWIN MES 히스토리와 취소 기능을 신뢰할 수 있도록, 재고 역재생 근거가 없는 거래가 취소 완료로 표시되는 경로를 차단한다.

변경:
- `backend/app/routers/inventory/transactions.py`: `inventory_effect`가 빈 배열이거나 non-zero delta가 없는 경우 자동 취소를 거부한다. 재고를 실제로 되돌리지 못하는 거래가 `cancelled=true`로 남는 상황을 막는다.
- `backend/tests/test_transaction_cancel.py`: 빈 효과 배열과 zero-delta 효과 배열 모두 재고 불변 + 취소 거부를 검증한다.
- `scripts/ops/check_inventory_integrity.py`: non-zero delta가 없는 효과 기록을 `WARN ineffective transaction effects`로 표시한다.
- `backend/tests/ops/test_ops_backup_integrity.py`: zero-delta 효과 기록 WARN 회귀 테스트를 추가한다.

검증:
- `python -m pytest backend\\tests\\test_transaction_cancel.py backend\\tests\\routers\\test_transactions_operational_audit.py backend\\tests\\ops\\test_ops_backup_integrity.py backend\\tests\\ops\\test_operational_readiness.py -q` 통과.
- `scripts\\ops\\operational_readiness.bat` 통과. 현재 실제 DB는 `WARN missing transaction effects: 349`만 표시되고 readiness 자체는 PASS.

남은 판단:
- 과거 `inventory_effect=None` 거래의 레거시 fallback은 제거했다. 자동 취소는 `inventory_effect`가 있고 non-zero delta가 있는 거래만 허용한다.
## 2026-06-25 운영 안전장치 진행 로그 - 레거시 자동 취소 차단

목표: 과거 로그 필드 조합으로 재고를 추론해 자동 취소하던 경로를 제거해, 근거 없는 역재생이 실제 재고를 바꾸는 일을 막는다.

변경:
- `backend/app/routers/inventory/transactions.py`: `inventory_effect=None`이면 거래 유형과 보조 필드가 있어도 자동 취소를 거부한다. 기존 레거시 fallback 블록을 제거했다.
- `backend/tests/test_transaction_cancel.py`: 수량 추론이 가능해 보이는 레거시 MARK_DEFECTIVE 로그도 자동 취소되지 않고 재고/로그가 불변임을 검증한다.
- 운영 문서: `WARN missing transaction effects`는 신규 작업 차단은 아니지만, 해당 과거 거래 자동 취소가 거부되고 별도 보정 거래로 처리해야 함을 명시했다.

검증:
- `python -m pytest backend\\tests\\test_transaction_cancel.py backend\\tests\\routers\\test_transactions_operational_audit.py backend\\tests\\ops\\test_ops_backup_integrity.py backend\\tests\\ops\\test_operational_readiness.py -q` 통과.
- `scripts\\ops\\operational_readiness.bat` 통과.