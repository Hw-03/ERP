# ImageLightbox.tsx

## 이 파일은 뭐예요?
이미지를 화면 중앙에 크게 띄우는 확대 모달입니다. `document.body`에 포털로 렌더링되며 backdrop 클릭·ESC 키·우상단 닫기 버튼 세 가지 방법으로 닫힙니다.

## 언제 보나요?
- 자재 이미지를 클릭했을 때 전체 화면 미리보기가 필요한 경우
- 확대 모달 닫기 동작이나 포털 마운트 타이밍 문제가 생겼을 때

## 중요한 내용
- `ImageLightbox({ open, src, alt, onClose })` — 네 props만으로 완결; 부모가 `open` 상태를 직접 관리
- SSR hydration 불일치를 막기 위해 `mounted` state로 클라이언트에서만 포털 렌더링
- `z-[460]` — 다른 모달(dirty-guard `z-400`, ConfirmModal 등)보다 위에 표시
- `next/image` 대신 native `<img>` 사용 — 원본 해상도 그대로 보여주는 목적이라 최적화 불필요 (ESLint 규칙 비활성 주석 포함)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/color.ts]] — `LEGACY_COLORS` 토큰 정의
- [[ERP/frontend/lib/ui/index.ts]] — `ImageLightbox`는 index.ts에서 재export되지 않음 (직접 `@/lib/ui/ImageLightbox`로 import)
