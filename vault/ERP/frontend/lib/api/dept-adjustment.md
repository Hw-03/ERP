# dept-adjustment.ts

## 이 파일은 뭐예요?
부서 내 재고 조정(낱개 출고·입고) API 모듈입니다. BOM 템플릿 조회, 컴포넌트 확장, 조정 제출 3개 메소드를 제공합니다.

## 언제 보나요?
- 부서 조정 화면에서 BOM 기반 자동 라인 생성 로직을 볼 때
- 낱개 출고·입고 제출 흐름을 추적할 때

## 중요한 내용
- `deptAdjustmentApi.getBomTemplate(itemId, subType, quantity)` — BOM 기반 조정 라인 템플릿, `BomTemplateResponse`
- `deptAdjustmentApi.expandComponent(payload)` — 컴포넌트 품목을 하위 BOM으로 전개, `AdjLineTemplate[]`
- `deptAdjustmentApi.submitAdjustment(payload)` — 조정 최종 제출, `DeptAdjResult`
- 타입: `AdjLineTemplate`, `BomTemplateResponse`, `DeptAdjResult`, `DeptAdjSubType`, `DeptAdjSubmitPayload` → `./types/dept-adjustment`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/api/types/dept-adjustment.ts]] — 조정 관련 타입
- [[ERP/backend/app/routers/dept_adjustment.py]] — 백엔드 부서 조정 라우터
