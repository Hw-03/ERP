---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/_constants.ts
status: active
updated: 2026-04-27
source_sha: 7ec01043a6c5
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# _constants.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/_constants.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `3332` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  RotateCcw,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Department, Item } from "@/lib/api";

// ───────────────────────────── Types ─────────────────────────────

export type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-io"
  | "package-out"
  | "defective-register"
  | "supplier-return";
export type Direction = "in" | "out";
export type TransferDirection = "wh-to-dept" | "dept-to-wh";
export type DefectiveSource = "warehouse" | "production";

// ─────────────────────────── Constants ───────────────────────────

export const PAGE_SIZE = 100;

export const PROD_DEPTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "출하"];

export const WORK_TYPES: { id: WorkType; label: string; icon: LucideIcon; description: string }[] = [
  { id: "raw-io", label: "원자재 입출고", icon: Boxes, description: "창고 기준 입고/출고" },
  { id: "warehouse-io", label: "창고 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-io", label: "부서 입출고", icon: Workflow, description: "생산부서 기준 입고/출고" },
  { id: "package-out", label: "패키지 출고", icon: PackageCheck, description: "등록된 묶음 출고" },
  { id: "defective-register", label: "불량 등록", icon: AlertTriangle, description: "불량 격리 처리" },
  { id: "supplier-return", label: "공급업체 반품", icon: RotateCcw, description: "공급업체 반품 처리" },
];

export const CAUTION_WORK_TYPES: WorkType[] = ["defective-register", "supplier-return"];

export const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

export const CATEGORY_LABEL: Record<string, string> = {
  RM: "원자재",
  TA: "튜브조립",
  HA: "고압조립",
  VA: "진공조립",
  AA: "브라켓",
  TF: "튜브반제",
  HF: "고압반제",
  VF: "진공반제",
  AF: "조립반제",
  FG: "완제품",
};

// ─────────────────────────── Helpers ─────────────────────────────

export function matchesSearch(item: Item, keyword: string) {
  if (!keyword) return true;
  const haystack = [
    item.erp_code,
    item.item_name,
    item.barcode ?? "",
    item.spec ?? "",
    item.legacy_model ?? "",
    item.legacy_part ?? "",
    item.location ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

export function workTypeNeedsDept(wt: WorkType): boolean {
  return (
    wt === "warehouse-io"
    || wt === "dept-io"
    || wt === "defective-register"
    || wt === "supplier-return"
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
