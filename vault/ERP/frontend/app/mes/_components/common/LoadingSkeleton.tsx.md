# LoadingSkeleton.tsx

## 이 파일은 뭐예요?
데이터 로딩 중에 표시하는 pulse 애니메이션 skeleton UI 컴포넌트입니다. 테이블·카드·리스트 세 가지 레이아웃 variant를 지원합니다.

## 언제 보나요?
- API 요청이 진행 중일 때 목록/카드/테이블 자리를 채워 레이아웃 이탈을 막을 때
- 초기 로딩 UX 개선이 필요한 화면

## 중요한 내용
- `variant` — `"table"` (5열 그리드) | `"card"` (auto-fill 그리드) | `"list"` (원형 아이콘 + 텍스트 줄, 기본값)
- `rows` — 반복 항목 수, 기본값 4 (최소 1)
- 내부 `Bar` 헬퍼 컴포넌트 — 너비(w)·높이(h) 지정 가능한 pulse 막대

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — LEGACY_COLORS.s1 / s3 배경색
- [[ERP/frontend/app/mes/_components/common/index.ts]] — re-export 포함
