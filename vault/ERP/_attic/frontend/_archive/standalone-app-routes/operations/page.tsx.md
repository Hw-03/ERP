---
type: file-explanation
source_path: "_attic/frontend/_archive/standalone-app-routes/operations/page.tsx"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# page.tsx — page.tsx 설명

## 이 파일은 무엇을 책임지나

`page.tsx`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `OperationsPage`
- `Department`
- `Employee`
- `Item`
- `ShipPackage`
- `TransactionLog`
- `OpMode`
- `ToastState`
- `badge`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/standalone-app-routes/operations/📁_operations]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Minus,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageSearch,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Department, type Employee, type Item, type ShipPackage, type TransactionLog } from "@/lib/api";

const DEPARTMENTS: Department[] = ["조립", "고압", "진공", "튜닝", "튜브", "AS", "연구", "영업", "출하", "기타"];

type OpMode = "wh_in" | "wh_out" | "wh2dept" | "dept2wh" | "dept_in" | "dept_pkg";

const OP_MODES: {
  key: OpMode;
  label: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  border: string;
  bg: string;
  btnBg: string;
}[] = [
  { key: "wh_in",    label: "창고 입고",   sub: "외부 → 창고",      icon: <PackagePlus  className="h-6 w-6" />, color: "text-emerald-300", border: "border-emerald-500/30", bg: "bg-emera...
  { key: "wh_out",   label: "창고 출고",   sub: "창고 → 외부",      icon: <PackageMinus className="h-6 w-6" />, color: "text-red-300",     border: "border-red-500/30",     bg: "bg-red-5...
  { key: "wh2dept",  label: "창고→부서",   sub: "창고 → 부서 이동",  icon: <ArrowRight   className="h-6 w-6" />, color: "text-blue-300",    border: "border-blue-500/30",    bg: "bg-blue-5...
  { key: "dept2wh",  label: "부서→창고",   sub: "부서 → 창고 반납",  icon: <ArrowLeft    className="h-6 w-6" />, color: "text-slate-300",   border: "border-slate-500/30",   bg: "bg-slate-...
  { key: "dept_in",  label: "부서 입고",   sub: "공정 내부 입고",    icon: <Boxes        className="h-6 w-6" />, color: "text-purple-300",  border: "border-purple-500/30",  bg: "bg-purple...
  { key: "dept_pkg", label: "패키지 출하", sub: "묶음 출하 처리",    icon: <PackageCheck className="h-6 w-6" />, color: "text-orange-300",  border: "border-orange-500/30",  bg: "bg-orange-...
];

const TX_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "입고", PRODUCE: "생산입고", SHIP: "출고", ADJUST: "조정", BACKFLUSH: "자동차감",
};
const TX_TYPE_COLOR: Record<string, string> = {
  RECEIVE: "text-emerald-300", PRODUCE: "text-emerald-300", SHIP: "text-red-300",
  ADJUST: "text-amber-300", BACKFLUSH: "text-orange-300",
};

type ToastState = { message: string; type: "success" | "error" } | null;

export default function OperationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems]         = useState<Item[]>([]);
```
