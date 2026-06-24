---
type: file-explanation
source_path: "frontend/lib/api/catalog.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# catalog.ts — catalog.ts 설명

## 이 파일은 무엇을 책임지나

`catalog.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `catalogApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/frontend/lib/api/types/catalog.ts]] — `catalog.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Catalog 도메인 API — `@/lib/api/catalog`.
 *
 * Round-6 (R6-D6) 분리. 마스터 데이터 관련:
 *   - Models (3 메소드)
 *   - BOM (7 메소드)
 *
 * 총 10 메소드.
 */

import { deleteJson, fetcher, patchJson, postJson, toApiUrl } from "../api-core";
import type {
  BOMDetailEntry,
  BOMEntry,
  BOMTreeNode,
  ProductModel,
} from "./types";

export const catalogApi = {
  // Models -----------------------------------------------------------------
  getModels: () => fetcher<ProductModel[]>(toApiUrl("/api/models")),

  createModel: (payload: { model_name: string; symbol?: string }) =>
    postJson<ProductModel>(toApiUrl("/api/models"), payload),

  deleteModel: (slot: number, pin: string) => deleteJson<void>(toApiUrl(`/api/models/${slot}`), { pin }),

  // BOM --------------------------------------------------------------------
  getAllBOM: () => fetcher<BOMDetailEntry[]>(toApiUrl("/api/bom")),
  getBOM: (parentItemId: string) => fetcher<BOMEntry[]>(toApiUrl(`/api/bom/${parentItemId}`)),
  getBOMTree: (parentItemId: string) =>
    fetcher<BOMTreeNode>(toApiUrl(`/api/bom/${parentItemId}/tree`)),
  /** 주어진 품목을 자식으로 사용하는 parent BOM 행. 직접 사용처(1단계). */
  getBOMWhereUsed: (itemId: string) =>
    fetcher<BOMDetailEntry[]>(toApiUrl(`/api/bom/where-used/${itemId}`)),

  createBOM: (payload: {
    parent_item_id: string;
    child_item_id: string;
    quantity: number;
    unit: string;
    notes?: string;
  }) => postJson<BOMEntry>(toApiUrl("/api/bom"), payload),

  deleteBOM: (bomId: string) => deleteJson<void>(toApiUrl(`/api/bom/${bomId}`)),

  updateBOM: (bomId: string, payload: { quantity?: number; unit?: string }) =>
    patchJson<BOMEntry>(toApiUrl(`/api/bom/${bomId}`), payload),
};
```
