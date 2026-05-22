---
type: file-explanation
source_path: "frontend/lib/api/types/io.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# io.ts — io.ts 설명

## 이 파일은 무엇을 책임지나

`io.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoWorkType`
- `IoSubType`
- `IoSourceKind`
- `IoLineOrigin`
- `IoLineDirection`
- `IoBucket`
- `IoLine`
- `IoBundle`
- `IoPreviewTarget`
- `IoPreviewPayload`
- 그 외 4개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/io.py]] — `io.py`는 `io` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
import type { Department } from "./shared";

export type IoWorkType = "receive" | "warehouse_io" | "process" | "defect";

export type IoSubType =
  | "receive_supplier"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "produce"
  | "disassemble"
  | "dept_transfer"
  | "adjust_in"
  | "adjust_out"
  | "defect_quarantine"
  | "defect_restore"
  | "defect_process"
  | "supplier_return";

export type IoSourceKind = "direct_item" | "bom_parent" | "manual";
export type IoLineOrigin = "direct" | "bom_auto" | "package_auto" | "manual";
export type IoLineDirection = "in" | "out" | "move" | "defective" | "adjust";
export type IoBucket = "warehouse" | "production" | "defective" | "none";

export interface IoLine {
  line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  unit: string;
  direction: IoLineDirection;
  from_bucket: IoBucket;
  from_department: Department | string | null;
  to_bucket: IoBucket;
  to_department: Department | string | null;
  quantity: number;
  bom_expected: number | null;
  included: boolean;
  origin: IoLineOrigin;
  edited: boolean;
  has_children: boolean;
  shortage: number;
  exclusion_note: string | null;
}

export interface IoBundle {
  bundle_id: string;
  source_kind: IoSourceKind;
  title: string;
  source_item_id: string | null;
  quantity: number;
  expanded_level: number;
  lines: IoLine[];
}

export interface IoPreviewTarget {
```
