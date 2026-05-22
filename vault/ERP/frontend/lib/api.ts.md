---
type: file-explanation
source_path: "frontend/lib/api.ts"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# api.ts — api.ts 설명

## 이 파일은 무엇을 책임지나

`api.ts`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/lib/api.ts` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `api`

## 연결되는 파일

- [[ERP/frontend/lib/📁_lib]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```ts
// 5.6-A: fetch wrapper / URL 빌더 / 에러 파서를 lib/api-core.ts 로 분리.
//        외부 import 호환을 위해 동일 이름을 re-export 한다.
import {
  toApiUrl,
  extractErrorMessage,
  parseError,
  fetcher,
  postJson,
  putJson,
  patchJson,
  FALLBACK_SERVER_API_BASE,
} from "./api-core";

// R5-5: 도메인별 API 분리 시작 (items).
import { itemsApi } from "./api/items";
// R6-D1: inventory 도메인 분리.
import { inventoryApi } from "./api/inventory";
// R6-D2: employees 도메인 분리.
import { employeesApi } from "./api/employees";
// R6-D3: admin / settings 도메인 분리.
import { adminApi } from "./api/admin";
// R6-D6: catalog (models + ship-packages + BOM) 도메인 분리.
import { catalogApi } from "./api/catalog";
// R6-D7: production / transactions / exports 도메인 분리.
import { productionApi } from "./api/production";
// R6-D8: stock-requests 도메인 분리.
import { stockRequestsApi } from "./api/stock-requests";
// R6-D9: departments + app-session 도메인 분리 (마지막).
import { departmentsApi } from "./api/departments";
// weekly-report 도메인.
import { weeklyApi } from "./api/weekly";
// dept-adjustment 도메인.
import { deptAdjustmentApi } from "./api/dept-adjustment";
// 입출고 2.0 도메인.
import { ioApi } from "./api/io";

// 외부 import 호환을 위해 동일 이름 그대로 re-export.
// parseError 는 도메인 API (직접 fetch 사용처) 가 본 파일 내부에서 사용 — 이번 PR 에선 그대로.
export {
  extractErrorMessage,
  fetcher,
  postJson,
  putJson,
  patchJson,
  FALLBACK_SERVER_API_BASE,
};

// R4-2: 모든 type / interface 정의는 lib/api/types.ts 로 분리.
// 외부 호환을 위해 본 파일이 동일 이름으로 re-export 한다.
import type {
  ProcessTypeCode,
  TransactionType,
  LocationStatus,
  InventoryLocationRow,
  Department,
```
