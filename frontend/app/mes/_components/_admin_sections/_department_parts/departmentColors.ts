import { getDepartmentFallbackColor } from "@/lib/mes/department";
import type { DepartmentMaster } from "@/lib/api";

export function deptColor(d: DepartmentMaster): string {
  return d.color_hex ?? getDepartmentFallbackColor(d.name);
}

// Tailwind 표준 팔레트 — 4행(shade 밝→어두) × 9열(hue 무지개) 가로 그라데이션
export const TAILWIND_PALETTE: { name: string; hex: string }[] = [
  // Row 1: shade 300 (가장 밝음)
  { name: "slate-300", hex: "#cbd5e1" },
  { name: "red-300", hex: "#fca5a5" },
  { name: "orange-300", hex: "#fdba74" },
  { name: "amber-300", hex: "#fcd34d" },
  { name: "green-300", hex: "#86efac" },
  { name: "cyan-300", hex: "#67e8f9" },
  { name: "blue-300", hex: "#93c5fd" },
  { name: "violet-300", hex: "#c4b5fd" },
  { name: "pink-300", hex: "#f9a8d4" },
  // Row 2: shade 500
  { name: "slate-500", hex: "#64748b" },
  { name: "red-500", hex: "#ef4444" },
  { name: "orange-500", hex: "#f97316" },
  { name: "amber-500", hex: "#f59e0b" },
  { name: "green-500", hex: "#22c55e" },
  { name: "cyan-500", hex: "#06b6d4" },
  { name: "blue-500", hex: "#3b82f6" },
  { name: "violet-500", hex: "#8b5cf6" },
  { name: "pink-500", hex: "#ec4899" },
  // Row 3: shade 700
  { name: "slate-700", hex: "#334155" },
  { name: "red-700", hex: "#b91c1c" },
  { name: "orange-700", hex: "#c2410c" },
  { name: "amber-700", hex: "#b45309" },
  { name: "green-700", hex: "#15803d" },
  { name: "cyan-700", hex: "#0e7490" },
  { name: "blue-700", hex: "#1d4ed8" },
  { name: "violet-700", hex: "#6d28d9" },
  { name: "pink-700", hex: "#be185d" },
  // Row 4: shade 900 (가장 어두움)
  { name: "slate-900", hex: "#0f172a" },
  { name: "red-900", hex: "#7f1d1d" },
  { name: "orange-900", hex: "#7c2d12" },
  { name: "amber-900", hex: "#78350f" },
  { name: "green-900", hex: "#14532d" },
  { name: "cyan-900", hex: "#164e63" },
  { name: "blue-900", hex: "#1e3a8a" },
  { name: "violet-900", hex: "#4c1d95" },
  { name: "pink-900", hex: "#831843" },
];
