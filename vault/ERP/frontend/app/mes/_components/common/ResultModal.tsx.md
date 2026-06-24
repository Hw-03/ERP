# ResultModal.tsx

## 이 파일은 뭐예요?
일괄 처리(예: 다건 승인/출고) 후 성공·부분 성공·실패 결과를 요약해 보여주는 모달 다이얼로그입니다. 실패 항목 목록과 선택적 primary 액션 버튼을 포함합니다.

## 언제 보나요?
- 여러 건을 한 번에 처리한 뒤 결과를 확인해야 할 때
- 일부 실패한 항목의 이름·사유를 사용자에게 알려야 할 때

## 중요한 내용
- `ResultKind` — `"success"` | `"partial"` | `"fail"` 세 가지 상태; 헤더 색상과 아이콘이 달라짐
- `failures` — `{ name, reason }[]` 배열; 있으면 스크롤 가능한 목록 렌더
- `primaryAction` — `{ label, onClick, tone? }` 형태; tone은 "warning" | "danger" | "success" | "info"
- `useFocusTrap` 훅으로 모달 열린 동안 포커스 가둠
- ESC 키로 닫힘

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_hooks/useFocusTrap.ts]] — 포커스 트랩 훅
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
