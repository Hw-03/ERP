# 불량 화면 개선 TODO

> 목적: 불량 화면에서 발견한 개선점과 해결 방향을 모아 두고, 구현이 끝난 항목은 검증 결과와 함께 체크한다.
> 기준일: 2026-06-29

## 상태

- [x] 1차 개선 완료: 바로 폐기 실패 수정, 진입 부서 표시 위치/디자인 조정, 입출고 탭 `작성 중`, 출하 아이콘 보정
- [x] 2차 개선 완료: `바로 폐기`를 `바로 처리`로 확장하고, 격리 없이 폐기/재작업을 바로 수행
- [x] 기존 격리 재작업 개선 완료: 하위 품목을 `정상 / 격리 / 폐기` 3분할로 처리
- [x] 재작업 하위 품목 입고 위치 개선 완료: 하위 품목 코드 기준 부서로 정상/격리 입고
- [x] 데스크톱/모바일 모두 동일 업무 흐름 반영
- [x] 브라우저 뒤로가기 후 앞으로가기 시 품목 선택 단계 복원
- [x] 바로 처리 작업 선택 카드 디자인을 불량 허브 카드 스타일로 정리

## 완료 항목

### 1. 바로 폐기 실패

- 화면: 불량 > 바로 처리 > 폐기
- 원인: `_handle_scrap_normal()`에서 `ReasonContext`에 없는 `actor_employee_id` 인자를 넘겨 500 오류가 발생했다.
- 해결:
  - `backend/app/services/sr_execution.py`에서 잘못된 인자 전달 제거.
  - `SCRAP_NORMAL` 회귀 테스트 추가.
- 검증:
  - `python -m pytest backend/tests/services/test_sr_execution.py -q`

### 2. 진입 부서 표시 위치/디자인

- 화면: 불량 > 바로 처리 > 폐기/재작업 > 품목 선택
- 요구:
  - 기존 `진입 부서: 조립` pill은 버튼처럼 보여 클릭 유도성이 있었다.
  - `바로 처리/바로 폐기/바로 재작업` 제목 옆, 품목 선택 안내 위쪽 메타 정보로 표시한다.
- 해결:
  - `DefectItemPicker` 상단 pill 제거.
  - `DefectCartFlow` Step 2 헤더에 `진입 부서 · 조립` / `진입 위치 · 창고` 표시.
  - 낮은 대비, hover/active 없는 읽기 전용 메타 스타일 적용.
- 검증:
  - `npm test -- DefectCartFlow.test.tsx`

### 3. 입출고 탭 문구

- 화면: 입출고 상단 탭
- 요구: `작업 중`보다 `작성 중`이 자연스럽다.
- 해결:
  - `WarehouseSectionTabs`의 cart 탭 라벨을 `작성 중`으로 변경.
  - 라벨 회귀 테스트 추가.
- 검증:
  - `npm test -- WarehouseSectionTabs.test.tsx`

### 4. 좌측 메뉴 출하 아이콘 크기

- 화면: 좌측 메뉴
- 요구: 출하 `Truck` 아이콘이 시각적으로 살짝 작아 보인다.
- 해결:
  - 메뉴 행/아이콘 박스 크기는 유지.
  - `shipping` 탭의 `Truck` 아이콘만 소폭 확대.
  - 회귀 테스트 추가.
- 검증:
  - `npm test -- DesktopSidebar.test.tsx`

### 5. 바로 처리: 폐기/재작업 선택

- 화면: 불량 > 바로 처리
- 요구:
  - 격리 목록을 거치지 않고 정상 재고에서 바로 폐기 또는 바로 재작업할 수 있어야 한다.
  - `반품`은 이번 범위에서 제외한다.
- 해결:
  - 허브 카드 라벨을 `바로 처리`로 변경.
  - 첫 화면에서 `폐기` / `재작업`을 선택한다.
  - 폐기는 기존 다품목 장바구니 방식 유지.
  - 재작업은 BOM 있는 품목 한 개만 선택하도록 제한.
  - `rework_normal` 요청 타입 추가.
  - 데스크톱/모바일 모두 같은 흐름으로 반영.
- 검증:
  - `npm test -- DefectCartFlow.test.tsx`
  - `python -m pytest backend/tests/services/test_sr_execution.py -q`

### 6. 재작업 하위 품목 3분할

- 화면: 불량 처리 / 바로 처리 > 재작업
- 요구:
  - 재작업 하위 품목은 `정상 / 격리 / 폐기` 수량을 직접 나눌 수 있어야 한다.
  - 기본값은 전량 정상.
  - 합계가 처리 수량과 다르면 제출할 수 없어야 한다.
- 해결:
  - `DisassembleTree`를 3분할 입력 UI로 변경.
  - `normal_qty / defective_qty / scrap_qty` payload 사용.
  - 기존 `keep_qty/action` payload는 백엔드에서 호환 유지.
  - 기존 격리 재작업 패널과 바로 재작업이 같은 공통 UI/검증을 사용.
- 검증:
  - `npm test -- PaPfDefectWizard.test.tsx`
  - `npm test -- DefectCartFlow.test.tsx`

### 7. 하위 품목 코드 기준 입고 부서

- 화면: 불량 처리 / 바로 처리 > 재작업
- 요구:
  - 상위 품목 출처가 조립이어도 하위 품목은 하위 품목 코드 기준 부서로 입고되어야 한다.
  - 정상 수량은 해당 부서 정상 재고로, 격리 수량은 해당 부서 격리 재고로 들어간다.
  - 폐기 수량은 입고 없이 폐기 로그만 남긴다.
- 해결:
  - `dept_adjustment.py` 공통 재작업 엔진 추가.
  - child item `process_type_code` 기준으로 부서를 계산.
  - 정상/격리/폐기 각각 로그와 재고 처리를 분리.
- 검증:
  - `python -m pytest backend/tests/services/test_sr_execution.py backend/tests/test_defect_flow.py -q`

### 8. 브라우저 뒤로가기/앞으로가기

- 화면: 불량 > 바로 처리 > 출처 선택/품목 선택
- 증상:
  - 부서 선택 후 품목 선택으로 넘어간 뒤 브라우저 뒤로가기를 누르면 출처 선택으로 돌아가지만, 앞으로가기로 품목 선택 복원이 자연스럽지 않았다.
- 해결:
  - `DefectCartFlow`에서 cart Step 1 history state를 명시하고, Step 2 진입 시 state를 push한다.
  - popstate에서 Step 1/Step 2를 복원한다.
- 검증:
  - `DefectCartFlow.test.tsx`에 forward 복원 테스트 추가.

### 9. 바로 재작업 BOM 확인 단계/수량 입력 UX

- 화면: 불량 > 바로 처리 > 재작업
- 요구:
  - 재작업 BOM 트리를 오른쪽 장바구니 안에서 작게 보지 않고, 기존 불량 처리처럼 큰 화면 단계에서 확인한다.
  - 기본값은 전량 정상이며, 사용자가 격리/폐기 수량을 입력하면 정상 수량이 자동으로 줄어든다.
  - 정상+격리+폐기 합계는 항상 처리 수량과 같아야 하며, 적거나 많아지지 않아야 한다.
- 해결:
  - 데스크톱/모바일 바로 재작업을 `작업 선택 → 출처·부서 선택 → 품목 선택 → BOM 확인` 단계로 분리.
  - `DisassembleTree`에서 격리/폐기 입력 시 정상 수량을 `총수량 - 격리 - 폐기`로 자동 보정.
  - 수량 입력/분해 방식 버튼의 터치 영역을 키워 작업 현장에서 누르기 쉽게 보정.
- 검증:
  - `DefectCartFlow.test.tsx`에서 BOM 확인 단계 진입, 격리 입력 후 정상 수량 자동 감소, `rework_normal` payload를 검증.
### 10. 바로 재작업 품목 후보 필터

- 화면: 불량 > 바로 처리 > 재작업 > 품목 선택
- 증상:
  - 재작업 품목 선택에서 BOM 없는 조립 계열 품목도 표시될 수 있었다.
- 원인:
  - 프론트 후보 필터가 `has_bom`이 boolean이 아닐 때 품목 코드 `AA/AF` 추정 fallback으로 재작업 후보를 넓혔다.
- 해결:
  - 데스크톱/모바일 모두 `has_bom === true`인 품목만 재작업 후보로 표시한다.
  - `DefectCartFlow.test.tsx`에 `6-AA`지만 `has_bom`이 없는 품목이 숨겨지는 회귀 테스트를 추가했다.
- 확인:
  - `3001/api/items` 응답에는 `has_bom`이 포함됨을 확인했다.
### 11. 바로 처리 작업 선택 카드 디자인

- 화면: 불량 > 바로 처리 > 작업 선택
- 요구:
  - `폐기` / `재작업` 선택 카드도 불량 허브의 `불량 격리` 카드처럼 버튼형 디자인으로 맞춘다.
- 해결:
  - 데스크톱/모바일 작업 선택 카드의 컬러 tint 배경과 2px 강조 테두리를 제거.
  - 허브 카드와 같은 중립 배경, 기본 border, 아이콘/제목만 액션 컬러로 강조하는 스타일로 정리.
- 검증:
  - `npm test -- DefectCartFlow.test.tsx`
## 보류/제외

- [ ] 바로 처리에 `반품` 추가 여부
  - 이번 구현 범위에서 제외하기로 한 항목.
  - 필요하면 `바로 처리`의 세 번째 액션으로 넣을지, 원자재/공급처 조건 때문에 별도 흐름으로 둘지 논의 필요.

## 최종 확인 명령

- `python -m pytest backend/tests/services/test_sr_execution.py backend/tests/test_defect_flow.py backend/tests/test_notifications.py backend/tests/routers/test_items_create.py backend/tests/routers/test_items_update.py -q`
- `cd frontend && npm test -- DefectCartFlow.test.tsx PaPfDefectWizard.test.tsx DefectHubPanel.test.tsx WarehouseSectionTabs.test.tsx DesktopSidebar.test.tsx`
- `cd frontend && npx tsc --noEmit`
