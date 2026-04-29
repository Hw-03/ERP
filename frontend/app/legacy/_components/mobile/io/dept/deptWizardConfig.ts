"use client";

import type { Department } from "@/lib/api";

export const DEPT_WIZARD_DEPARTMENTS: Department[] = [
  "튜브",
  "고압",
  "진공",
  "튜닝",
  "조립",
  "출하",
];

export const DEPT_STEPS = [
  { key: "department", label: "부서" },
  { key: "direction", label: "입고 / 출고" },
  { key: "items", label: "품목/수량" },
  { key: "confirm", label: "확인" },
] as const;
