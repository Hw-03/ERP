---
type: file-explanation
source_path: "frontend/lib/api/departments.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# departments.ts — departments.ts 설명

## 이 파일은 무엇을 책임지나

`departments.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `departmentsApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/departments.py]] — `departments.py`는 `departments` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/frontend/lib/api/types/departments.ts]] — `departments.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Departments 도메인 API — `@/lib/api/departments`.
 *
 * Round-6 (R6-D9) 분리. 5 메소드 + getAppSession 1 (관련 헬퍼).
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";
import type { DepartmentMaster } from "./types";

export const departmentsApi = {
  getAppSession: (): Promise<{ boot_id: string; started_at: string }> =>
    fetcher(toApiUrl("/api/app-session")),

  getDepartments: (params?: { isActive?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.isActive !== undefined) query.set("is_active", String(params.isActive));
    return fetcher<DepartmentMaster[]>(toApiUrl(`/api/departments?${query}`));
  },

  createDepartment: (payload: {
    name: string;
    display_order?: number;
    pin: string;
    color_hex?: string;
  }) => postJson<DepartmentMaster>(toApiUrl("/api/departments"), payload),

  updateDepartment: (
    id: number,
    payload: {
      name?: string;
      display_order?: number;
      is_active?: boolean;
      color_hex?: string | null;
      pin: string;
    },
  ) => putJson<DepartmentMaster>(toApiUrl(`/api/departments/${id}`), payload),

  deleteDepartment: (id: number, pin: string) =>
    deleteJson<void>(toApiUrl(`/api/departments/${id}`), { pin }),

  reorderDepartments: (payload: {
    items: { id: number; display_order: number }[];
    pin: string;
  }) => patchJson<{ ok: boolean }>(toApiUrl("/api/departments/reorder"), payload),
};
```
