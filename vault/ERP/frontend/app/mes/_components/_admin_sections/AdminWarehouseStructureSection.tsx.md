# AdminWarehouseStructureSection.tsx

## 이 파일은 뭐예요?
창고 앵글 구조를 시각적 평면도(880×300 논리 좌표)에서 드래그·리사이즈로 편집하는 관리자 섹션입니다. 마우스를 떼는 순간 SNAP 정렬 후 API 자동 저장합니다.

## 언제 보나요?
- 창고 박스 관리 화면의 "앵글 편집" 탭에서 렌더됨
- 앵글 위치나 크기를 바꾸거나 새 앵글을 추가할 때

## 중요한 내용
- `AdminWarehouseStructureSection({ onStatusChange, onError })` — export 컴포넌트
- `DragSession` 타입 — 드래그 중인 앵글 id·모드(move/resize)·시작좌표·초기크기 기록
- `GRID = 40` / `SNAP = 10` — 격자 단위 / 드래그 스냅 단위(px)
- `scale` 상태 + `ResizeObserver` — 캔버스를 카드 크기에 맞춰 CSS scale 조정
- `warehouseMapApi.getStructure/createAngle/updateAngle/deleteAngle` — API 호출
- 드래그 이동·리사이즈: `document` 레벨 `mousemove`/`mouseup` 이벤트로 처리 (`useEffect` 내 등록)
- 우측 사이드 패널 — 선택 앵글의 이름·열수·층수·너비·높이 수동 입력 + 저장·삭제

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/warehouse-map.ts]] — `warehouseMapApi`, `WarehouseAngle` 타입
- [[ERP/frontend/app/mes/_components/_admin_sections/_admin_primitives/AdminPageHeader.tsx]] — 섹션 헤더
