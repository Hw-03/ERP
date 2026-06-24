# EmptyState.tsx

## 이 파일은 뭐예요?
데이터가 없거나 검색 결과가 없을 때 표시하는 빈 상태 안내 컴포넌트입니다. variant별 기본 문구를 제공하며, 아이콘·액션 버튼·compact 모드를 선택적으로 추가할 수 있습니다.

## 언제 보나요?
- 목록 화면에서 데이터가 0건일 때
- 검색어·필터 조건으로 결과가 없을 때
- 필터가 모든 항목을 가릴 때

## 중요한 내용
- `EmptyStateVariant` — `"no-data"` | `"no-search-result"` | `"filtered-out"` 세 가지 preset
- `VARIANT_DEFAULTS` — variant별 기본 title/description 문자열 매핑
- `compact` prop — `py-6` / `py-12` 및 폰트 크기 전환
- `action` prop — `{ label, onClick }` 형태로 버튼 한 개 추가 가능
- `memo`로 감싼 named export `EmptyState`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS 색상 토큰
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
