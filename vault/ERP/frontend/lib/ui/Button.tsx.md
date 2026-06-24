# Button.tsx

## 이 파일은 뭐예요?
프로젝트 전체에서 공통으로 쓰이는 버튼 컴포넌트입니다. `primary / secondary / ghost / danger` 4종 variant와 `sm / md / lg` 3단계 크기, 로딩 스피너, 아이콘 슬롯을 지원합니다.

## 언제 보나요?
- 새 버튼을 추가하거나 기존 버튼 스타일을 조정할 때
- 로딩 상태 표시(`loading` prop)나 아이콘 정렬 방식이 헷갈릴 때

## 중요한 내용
- `ButtonVariant` — `"primary" | "secondary" | "ghost" | "danger"`
- `ButtonSize` — `"sm" | "md" | "lg"`
- `ButtonProps` — `ButtonHTMLAttributes<HTMLButtonElement>` 확장, 추가 props: `variant`, `size`, `iconLeft`, `iconRight`, `loading`
- `Button` — `forwardRef` 래핑, `disabled || loading` 두 조건 모두 비활성화 처리
- 색상은 `LEGACY_COLORS`(CSS 변수)로 라이트/다크 자동 전환
- 로딩 중에는 `iconLeft` 대신 스피너를, `iconRight`는 아예 숨김

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰 정의
- [[ERP/frontend/lib/ui/index.ts]] — `Button`은 index.ts에서 재export되지 않음 (직접 `@/lib/ui/Button`으로 import)
