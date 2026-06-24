# PrimaryActionButton.tsx

## 이 파일은 뭐예요?
화면 하단에서 주요 동작을 실행하는 풀 너비 주 액션 버튼입니다. primary/success/danger/neutral 4가지 intent, 건수/합계 메타 정보 표시, 로딩 중 대체 텍스트를 지원합니다.

## 언제 보나요?
- StickyFooter 안에서 "출고 확정", "승인", "제출" 등 화면의 최종 액션 버튼으로 사용
- 단계 진행·완료 버튼이 필요한 위저드 하단

## 중요한 내용
- `PrimaryActionButton({ label, sublabel?, count?, total?, totalUnit?, intent?, icon?, onClick, disabled?, loadingText?, className? })`
- `intent`: `"primary"(파랑/흰글)` / `"success"(초록/텍스트)` / `"danger"(빨강/흰글)` / `"neutral"(s3/텍스트)`, 기본 `"primary"`
- `count`가 있으면 "N건", `total`이 있으면 "합계 수량 단위"를 버튼 우측에 표시
- `loadingText`와 `disabled=true` 조합 시 버튼 텍스트를 `loadingText`로 교체
- `formatQty`로 수량 포맷팅

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/mobile/primitives/StickyFooter.tsx]] — 주요 사용처 컨테이너
- [[ERP/frontend/lib/mes/format.ts]] — `formatQty` 함수 출처
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 색상 팔레트 출처
