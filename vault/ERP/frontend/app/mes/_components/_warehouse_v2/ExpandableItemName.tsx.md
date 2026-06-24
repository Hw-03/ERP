# ExpandableItemName.tsx

## 이 파일은 뭐예요?
모바일에서 긴 품목명을 탭하면 줄바꿈으로 전체 표시하고, 다시 탭하면 1줄 truncate로 되돌리는 이름 표시 버튼입니다. 데스크톱(lg)에서는 pointer-events가 비활성화되어 항상 1줄 + title 툴팁으로만 동작합니다.

## 언제 보나요?
- 입출고 위저드 Step 4(IoBundleCart) 내 각 라인 행(IoLineRow)에서 긴 품목명을 모바일에서 볼 때

## 중요한 내용
- `ExpandableItemName({ name, className?, style? })` — 단일 export
- `no-btn-inset` 클래스로 전역 button inset 테두리 해제
- `lg:pointer-events-none lg:truncate` — 데스크톱은 토글 기능 없음, PC 동작 무변경
- `e.stopPropagation()` — 상위 카드 클릭 이벤트와 분리

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoLineRow.tsx]] — 이 컴포넌트를 품목명 셀에 사용하는 호출처
- [[ERP/frontend/app/globals.css]] — `button.no-btn-inset` 규칙 정의처
