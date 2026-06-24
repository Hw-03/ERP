# index.ts

## 이 파일은 뭐예요?
`@/lib/api/index`로 접근하는 API barrel 진입점입니다. 기존 `@/lib/api` export를 그대로 재노출해 하위 호환성을 유지합니다.

## 언제 보나요?
- 기존 `@/lib/api` import가 여전히 동작하는지 확인할 때
- 도메인별 분리 전후 호환 구조를 파악할 때

## 중요한 내용
- 실제 로직 없음 — `export * from "../api"` 한 줄
- 본체: `frontend/lib/api.ts`
- 도메인별 세부 분리(items/inventory 등)는 각 도메인 파일 직접 참조

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api.ts]] — 실제 export 집합
