"use client";

// W5: Departments 도메인 Commands sub-hook.
// 책임: list-level 명령 — add / deactivate / reactivate / hardDelete / reorder / updateColor.

import type { DepartmentMaster } from "@/lib/api";
import { employeeColor } from "@/lib/mes/color";
import {
  useCreateDepartmentMutation,
  useDeleteDepartmentMutation,
  useReorderDepartmentsMutation,
  useUpdateDepartmentMutation,
} from "@/lib/queries/useDepartmentsQuery";
import { useRefreshDepartments } from "../DepartmentsContext";

export const COLOR_PALETTE = [
  "#1d4ed8", "#c2410c", "#6d28d9", "#0e7490",
  "#be185d", "#b45309", "#0f766e", "#4d7c0f",
  "#9333ea", "#0284c7", "#dc2626", "#059669",
];

function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h =
    max === r ? (g - b) / d + (g < b ? 6 : 0)
    : max === g ? (b - r) / d + 2
    : (r - g) / d + 4;
  return (h / 6) * 360;
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function pickAutoColor(existingDepts: DepartmentMaster[]): string {
  const usedColors = existingDepts.map((d) => (d.color_hex ?? employeeColor(d.name)).toLowerCase());
  const unused = COLOR_PALETTE.find((c) => !usedColors.includes(c.toLowerCase()));
  if (unused) return unused;
  const usedHues = usedColors.map(hexToHue);
  let bestColor = COLOR_PALETTE[0]!;
  let bestMinDist = -1;
  for (const c of COLOR_PALETTE) {
    const h = hexToHue(c);
    const minDist = Math.min(...usedHues.map((uh) => hueDist(h, uh)));
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestColor = c;
    }
  }
  return bestColor;
}

export type UseAdminDepartmentsCommandsArgs = {
  departments: DepartmentMaster[];
  setDepartments: (updater: (prev: DepartmentMaster[]) => DepartmentMaster[]) => void;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (d: DepartmentMaster | null) => void;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  adminPin: string;
  /** add 후 호출 — form.reset() 용도 */
  onAfterAdd?: () => void;
  /** add 시 사용할 이름 (form.addName) */
  getAddName: () => string;
};

export type UseAdminDepartmentsCommandsState = {
  add: () => void;
  deactivate: (id: number) => void;
  reactivate: (id: number) => void;
  hardDelete: (id: number) => void;
  reorder: (ordered: DepartmentMaster[]) => void;
  updateColor: (id: number, colorHex: string) => void;
};

export function useAdminDepartmentsCommands({
  departments,
  setDepartments,
  selectedDept,
  setSelectedDept,
  onStatusChange,
  onError,
  adminPin,
  onAfterAdd,
  getAddName,
}: UseAdminDepartmentsCommandsArgs): UseAdminDepartmentsCommandsState {
  const refreshDepartments = useRefreshDepartments();
  const createMutation = useCreateDepartmentMutation();
  const updateMutation = useUpdateDepartmentMutation();
  const deleteMutation = useDeleteDepartmentMutation();
  const reorderMutation = useReorderDepartmentsMutation();

  function add() {
    const name = getAddName().trim();
    if (!name) return;
    const color_hex = pickAutoColor(departments);
    createMutation.mutate(
      { name, display_order: departments.length, pin: adminPin, color_hex },
      {
        onSuccess: (created) => {
          setDepartments((prev) => [...prev, created]);
          onAfterAdd?.();
          onStatusChange(`'${created.name}' 부서를 추가했습니다.`);
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "부서 추가 실패"),
      },
    );
  }

  function deactivate(id: number) {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    if (!confirm(`'${dept.name}' 부서를 비활성화하시겠습니까?`)) return;
    updateMutation.mutate(
      { id, payload: { is_active: false, pin: adminPin } },
      {
        onSuccess: (updated) => {
          setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
          if (selectedDept?.id === id) setSelectedDept(updated);
          onStatusChange(`'${dept.name}' 부서를 비활성화했습니다.`);
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "비활성화 실패"),
      },
    );
  }

  function reactivate(id: number) {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    updateMutation.mutate(
      { id, payload: { is_active: true, pin: adminPin } },
      {
        onSuccess: (updated) => {
          setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
          if (selectedDept?.id === id) setSelectedDept(updated);
          onStatusChange(`'${dept.name}' 부서를 활성화했습니다.`);
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "활성화 실패"),
      },
    );
  }

  function hardDelete(id: number) {
    const dept = departments.find((d) => d.id === id);
    if (!dept) return;
    if (!confirm(`'${dept.name}' 부서를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    deleteMutation.mutate(
      { id, pin: adminPin },
      {
        onSuccess: () => {
          setDepartments((prev) => prev.filter((d) => d.id !== id));
          if (selectedDept?.id === id) setSelectedDept(null);
          onStatusChange(`'${dept.name}' 부서를 삭제했습니다.`);
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "삭제 실패"),
      },
    );
  }

  function reorder(ordered: DepartmentMaster[]) {
    const active = ordered.filter((d) => d.is_active);
    const inactive = ordered.filter((d) => !d.is_active);
    const items = [
      ...active.map((d, i) => ({ id: d.id, display_order: i })),
      ...inactive.map((d, i) => ({ id: d.id, display_order: active.length + i })),
    ];
    const reindexed = ordered.map((d) => ({
      ...d,
      display_order: items.find((it) => it.id === d.id)!.display_order,
    }));
    setDepartments(() => reindexed);
    reorderMutation.mutate(
      { items, pin: adminPin },
      {
        onSuccess: () => {
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "순서 저장 실패"),
      },
    );
  }

  function updateColor(id: number, colorHex: string) {
    updateMutation.mutate(
      { id, payload: { color_hex: colorHex, pin: adminPin } },
      {
        onSuccess: (updated) => {
          setDepartments((prev) => prev.map((d) => (d.id === id ? updated : d)));
          if (selectedDept?.id === id) setSelectedDept(updated);
          void refreshDepartments();
        },
        onError: (err) => onError(err instanceof Error ? err.message : "색상 변경 실패"),
      },
    );
  }

  return { add, deactivate, reactivate, hardDelete, reorder, updateColor };
}
