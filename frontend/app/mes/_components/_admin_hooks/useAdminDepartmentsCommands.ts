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

export const COLOR_PALETTE = [
  "#2f805d", "#85630d", "#7052a8", "#5c5c5c",
  "#2f6faf", "#9f4d43", "#be185d", "#b45309", "#4d7c0f",
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
  selectedDept: DepartmentMaster | null;
  setSelectedDept: (department: DepartmentMaster | null) => void;
  onStatusChange: (message: string) => void;
  onError: (message: string) => void;
  adminPin: string;
  onAfterAdd?: () => void;
  getAddName: () => string;
};

export type UseAdminDepartmentsCommandsState = {
  add: () => Promise<DepartmentMaster | null>;
  deactivate: (id: number) => Promise<DepartmentMaster | null>;
  reactivate: (id: number) => Promise<DepartmentMaster | null>;
  hardDelete: (id: number) => Promise<boolean>;
  reorder: (ordered: DepartmentMaster[]) => Promise<boolean>;
  updateColor: (id: number, colorHex: string) => Promise<DepartmentMaster | null>;
};

export function useAdminDepartmentsCommands({
  departments,
  selectedDept,
  setSelectedDept,
  onStatusChange,
  onError,
  adminPin,
  onAfterAdd,
  getAddName,
}: UseAdminDepartmentsCommandsArgs): UseAdminDepartmentsCommandsState {
  const { mutateAsync: createDepartment } = useCreateDepartmentMutation();
  const { mutateAsync: updateDepartment } = useUpdateDepartmentMutation();
  const { mutateAsync: deleteDepartment } = useDeleteDepartmentMutation();
  const { mutateAsync: reorderDepartmentRows } = useReorderDepartmentsMutation();

  async function add(): Promise<DepartmentMaster | null> {
    const name = getAddName().trim();
    if (!name) return null;
    try {
      const created = await createDepartment({
        name,
        display_order: departments.length,
        pin: adminPin,
        color_hex: pickAutoColor(departments),
      });
      onAfterAdd?.();
      onStatusChange(`'${created.name}' 부서를 추가했습니다.`);
      return created;
    } catch (error) {
      onError(error instanceof Error ? error.message : "부서 추가 실패");
      return null;
    }
  }

  async function setActive(id: number, isActive: boolean): Promise<DepartmentMaster | null> {
    const department = departments.find((row) => row.id === id);
    if (!department) return null;
    try {
      const updated = await updateDepartment({
        id,
        payload: { is_active: isActive, pin: adminPin },
      });
      if (selectedDept?.id === id) setSelectedDept(updated);
      onStatusChange(`'${department.name}' 부서를 ${isActive ? "활성화" : "비활성화"}했습니다.`);
      return updated;
    } catch (error) {
      onError(error instanceof Error ? error.message : isActive ? "활성화 실패" : "비활성화 실패");
      return null;
    }
  }

  const deactivate = (id: number) => setActive(id, false);
  const reactivate = (id: number) => setActive(id, true);

  async function hardDelete(id: number): Promise<boolean> {
    const department = departments.find((row) => row.id === id);
    if (!department) return false;
    try {
      await deleteDepartment({ id, pin: adminPin });
      if (selectedDept?.id === id) setSelectedDept(null);
      onStatusChange(`'${department.name}' 부서를 삭제했습니다.`);
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "삭제 실패");
      return false;
    }
  }

  async function reorder(ordered: DepartmentMaster[]): Promise<boolean> {
    const active = ordered.filter((department) => department.is_active);
    const inactive = ordered.filter((department) => !department.is_active);
    const items = [
      ...active.map((department, index) => ({ id: department.id, display_order: index })),
      ...inactive.map((department, index) => ({ id: department.id, display_order: active.length + index })),
    ];
    try {
      await reorderDepartmentRows({ items, pin: adminPin });
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "순서 저장 실패");
      return false;
    }
  }

  async function updateColor(id: number, colorHex: string): Promise<DepartmentMaster | null> {
    try {
      const updated = await updateDepartment({
        id,
        payload: { color_hex: colorHex, pin: adminPin },
      });
      if (selectedDept?.id === id) setSelectedDept(updated);
      return updated;
    } catch (error) {
      onError(error instanceof Error ? error.message : "색상 변경 실패");
      return null;
    }
  }

  return { add, deactivate, reactivate, hardDelete, reorder, updateColor };
}
