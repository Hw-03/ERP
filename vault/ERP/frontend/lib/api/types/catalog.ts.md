---
type: file-explanation
source_path: "frontend/lib/api/types/catalog.ts"
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

- `BOMEntry`
- `BOMDetailEntry`
- `BOMTreeNode`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Catalog 도메인 타입 — `@/lib/api/types/catalog`.
 * (BOM)
 * Round-10A (#2) 본문 이전.
 */

export interface BOMEntry {
  bom_id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity: number;
  unit: string;
  notes: string | null;
}

export interface BOMDetailEntry {
  bom_id: string;
  parent_item_id: string;
  parent_item_name: string;
  parent_mes_code: string | null;
  child_item_id: string;
  child_item_name: string;
  child_mes_code: string | null;
  quantity: number;
  unit: string;
}

export interface BOMTreeNode {
  item_id: string;
  mes_code: string;
  item_name: string;
  process_type_code: string | null;
  unit: string;
  required_quantity: number;
  current_stock: number;
  children: BOMTreeNode[];
}
```
