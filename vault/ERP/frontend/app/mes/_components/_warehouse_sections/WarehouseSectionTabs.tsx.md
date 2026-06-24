# WarehouseSectionTabs.tsx

## 이 파일은 뭐예요?
창고 화면 상단에 표시되는 섹션 탭 바. 권한(showQueue·showDeptQueue·showHandover)에 따라 탭을 조건부로 추가하고, 각 탭에 badge 숫자를 붙인다.

## 언제 보나요?
- `DesktopWarehouseView` 상단에 항상 렌더됨
- 탭을 클릭하면 `onChange`로 `WarehouseSectionTab` 값이 부모에 전달됨

## 중요한 내용
- `WarehouseSectionTabs(props: Props)` — 주요 export
- `WarehouseSectionTab` 타입 export — `"compose" | "cart" | "mine" | "queue" | "dept-queue" | "handover"`
- 기본 탭 3개: 요청 작성(compose) · 작업 중(cart) · 내 요청(mine)
- 선택적 탭: showQueue → "창고 승인함", showDeptQueue → "부서 승인함", showHandover → "인수인계"
- `TabButton` — 내부 헬퍼, 모바일(WCAG AA 다크 텍스트)·데스크톱(브랜드 tone 컬러) 이중 스타일 적용
- badge: cart = `cartCount`, queue = `queueCount`, dept-queue = `deptQueueCount`, handover = `handoverInboxCount`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs.tsx]] — 이 탭 선택 결과를 소비해 패널을 분기하는 컴포넌트
