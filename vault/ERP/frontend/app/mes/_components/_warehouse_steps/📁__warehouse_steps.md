# 📁 _warehouse_steps

## 이 폴더는 뭐예요?

**V1 입출고 wizard**의 단계별 컴포넌트입니다. 현재는 `_warehouse_v2/`의 `IoComposeView`로 대체됐으나, V1 경로가 완전히 제거될 때까지 보존됩니다.

## 주요 파일

- `EmployeeStep.tsx` — 직원 선택 단계
- `_constants.ts` — 단계별 상수
- `index.ts` — 진입점

## 언제 여기를 보나요?

- V1 입출고 흐름에 남아 있는 버그를 추적할 때 (드묾)
- V1 → V2 전환 작업을 할 때

## 건드릴 때 조심할 점

- 신규 기능은 `_warehouse_v2/`에만 추가. 이 폴더는 새 기능 추가 금지

## 관련 파일

### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — V2 대체 UI
