# AsyncState.tsx

## 이 파일은 뭐예요?
비동기 데이터 로딩 상태(로딩·에러·빈값·데이터)를 조건부로 처리하는 래퍼 컴포넌트입니다. 에러 시 재시도 버튼 포함 에러 박스, 로딩 시 스켈레톤, 비었을 때 빈 상태 뷰를 자동으로 분기 렌더링합니다.

## 언제 보나요?
- API 데이터를 fetch해서 목록이나 상세 정보를 표시하는 모든 모바일 화면
- 로딩 스피너/스켈레톤과 에러 처리를 한번에 처리하고 싶을 때

## 중요한 내용
- `AsyncState({ loading, error?, empty?, skeleton?, emptyView?, onRetry?, children })` — 우선순위: error > loading > empty > children
- `AsyncSkeletonRows({ count? })` — 기본 4개의 펄스 애니메이션 회색 행 스켈레톤, `skeleton` prop의 기본값
- 에러 시 `tint(LEGACY_COLORS.red, 8)` 배경 박스 + `AlertCircle` 아이콘 + `onRetry` 버튼(선택)
- `empty=true`이면 `emptyView` 렌더링 (없으면 null)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint` 함수 출처
