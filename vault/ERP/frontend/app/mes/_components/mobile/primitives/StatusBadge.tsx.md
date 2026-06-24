# StatusBadge.tsx

## 이 파일은 뭐예요?
상태 톤이나 커스텀 색상으로 색칠된 작은 인라인 배지(pill) 컴포넌트입니다. 재고 상태·부서 구분 등 다양한 상태 레이블을 색상 배경+텍스트 조합으로 표시하며, 선택적으로 dot 인디케이터를 앞에 붙입니다.

## 언제 보나요?
- `ItemRow`에서 재고 상태(여유/부족/위험)와 부서 배지를 표시할 때
- 상태를 한눈에 구분하는 작은 색상 레이블이 필요한 모든 곳

## 중요한 내용
- `StatusBadge({ label, tone?, color?, className?, dot? })` — `tone`은 `"ok"/"warn"/"danger"/"info"/"muted"`, 기본 `"info"`
- `color` prop으로 커스텀 hex 색상 직접 지정 가능 (tone보다 우선)
- 내부적으로 `toMesTone`으로 tone 정규화 ("ok"→success, "warn"→warning)
- 배경은 해당 색의 22% 투명도, 텍스트는 해당 색상
- `dot=true`이면 레이블 앞에 6×6 원형 점 추가
- 데스크톱 `common/StatusPill.tsx`와 의도적으로 분리 (통합 금지)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes-status.ts]] — `toMesTone`, `MesTone` 타입 출처
- [[ERP/frontend/app/mes/_components/mobile/primitives/ItemRow.tsx]] — 주요 소비처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
