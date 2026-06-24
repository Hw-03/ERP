# index.ts

## 이 파일은 뭐예요?
`_warehouse_steps` 폴더의 공개 진입점(barrel export)입니다. 기존 단일 파일(`_warehouse_steps.tsx`, 1,135줄)을 Phase 4에서 책임 단위로 분할한 뒤 외부 import 경로를 유지하기 위해 만들어졌습니다. 현재는 `_constants.ts`만 재익스포트합니다.

## 언제 보나요?
- `_warehouse_steps` 폴더에서 무엇을 export하는지 확인할 때
- 외부 컴포넌트가 `./_warehouse_steps`를 import할 때 실제로 어떤 모듈이 공개되는지 추적할 때

## 중요한 내용
- `export * from "./_constants"` — 타입, 상수, 헬퍼 전체를 외부에 노출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_steps/_constants.ts]] — 실제 내용이 들어있는 파일
