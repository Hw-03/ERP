# useItemImageManifest.ts

## 이 파일은 뭐예요?
품목 이미지 경로를 담은 `/images/items/manifest.json`을 마운트 1회만 불러와 `{ mes_code: filename }` 형태의 맵으로 보관하는 훅입니다.

## 언제 보나요?
- 품목 이미지가 안 뜨는 원인을 파악할 때
- manifest.json 파일 위치나 구조를 확인해야 할 때
- 이미지 캐싱 정책(`force-cache`)을 변경하고 싶을 때

## 중요한 내용
- 반환값: `Record<string, string>` — `{ mes_code: "파일명.jpg" }` 맵
- `fetch("/images/items/manifest.json", { cache: "force-cache" })` — Next.js 정적 파일, 브라우저 캐시 활용
- 마운트 1회만 실행 (deps `[]`)
- fetch 실패 시 빈 객체 반환 (silent fallback)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/public/images/items/📁_items]] — manifest.json 위치
- [[ERP/frontend/app/mes/_components/📁__components]] — 품목 이미지를 표시하는 컴포넌트들
