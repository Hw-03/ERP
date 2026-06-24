# HandoverSectionPanel.tsx

## 이 파일은 뭐예요?
인수인계 섹션 전체를 관리하는 패널. 작성자(튜브 부서)·내 인수인계·인수 대기함(고압/진공 부서) 세 서브탭을 부서 권한에 따라 조건부로 표시하고, 인수 확인 시 PIN 모달을 띄운다.

## 언제 보나요?
- 창고 화면 "인수인계" 탭(`handover`)이 활성일 때
- `WarehouseDraftPanelTabs`에서 `sectionTab === "handover"` 분기에서 렌더됨

## 중요한 내용
- `HandoverSectionPanel({ operator, operatorEmployeeId, items, refreshNonce, onChanged })` — 주요 export
- `canCompose` — `operator.department === "튜브"`이면 true
- `canReceive` — `operator.department`가 `["고압", "진공"]`에 포함되면 true
- 서브탭 `compose` / `mine` / `inbox` 순으로 조건부 생성
- `HandoverCardList` — 내부 헬퍼, 인수인계서 목록 카드를 렌더 (인쇄·이어쓰기·삭제·인수 확인 버튼 포함)
- 인수 확인 시 `api.receiveHandover()` 호출 → 품목 수량 부서 간 이동 발생

## 위험도
🔴 높음 — 인수 확인이 튜브→고압(또는 진공) 재고 이동을 직접 트리거함. PIN 검증 필수.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/HandoverComposeForm.tsx]] — 작성 서브탭에서 렌더되는 인수인계서 작성 폼
- [[ERP/frontend/app/mes/_components/_warehouse_sections/handoverPrint.ts]] — 인수인계서 인쇄 유틸
