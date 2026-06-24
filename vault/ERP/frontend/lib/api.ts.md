---
type: file-explanation
source_path: "frontend/lib/api.ts"
importance: important
layer: frontend
graph: hub
updated: 2026-06-24
project: DEXCOWIN MES
---

# api.ts

## 이 파일은 뭐예요?

프론트엔드 API 호출의 **통합 re-export 허브**입니다. 도메인별로 분리된 11개+ API 모듈을 한 곳에서 내보내 화면이 `@/lib/api`만 import하면 모든 API에 접근할 수 있게 합니다.

> 새 코드를 작성할 때는 `@/lib/api-core`를 직접 사용하는 것을 권장합니다(주석 참고).

## 통합 도메인 목록

| 도메인 | 진입점 |
|--------|--------|
| 품목 | `itemsApi` |
| 재고 | `inventoryApi` |
| 직원 | `employeesApi` |
| 관리자·설정 | `adminApi` |
| 모델·BOM | `catalogApi` |
| 생산·내역·내보내기 | `productionApi` |
| 결재 요청 | `stockRequestsApi` |
| 부서·세션 | `departmentsApi` |
| 주간보고 | `weeklyApi` |
| 부서 이동 기타 | `deptAdjustmentApi` |
| 입출고 V2 | `ioApi` |
| 알림 | `notificationsApi` |
| 인수인계 | `handoverApi` |

fetch 헬퍼(`postJson`, `putJson`, `patchJson`, `fetcher` 등)와 타입(`api/types.ts`)도 함께 re-export합니다.

## 연결되는 파일

### 먼저 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — fetch wrapper 원천 (toApiUrl, postJson, patchJson, 에러 파서)
- [[ERP/frontend/lib/api/📁_api]] — 도메인별 API 파일 디렉터리 (11개+ 파일)
- [[ERP/frontend/lib/queries/📁_queries]] — 이 api를 사용하는 React Query 훅 모음
