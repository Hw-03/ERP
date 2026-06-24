import { LEGACY_COLORS } from "@/lib/mes/color";
import type { DepartmentRole, WarehouseRole } from "@/lib/api";

export const ASSEMBLY_DEPT = "조립";

export const WAREHOUSE_ROLE_LABEL: Record<WarehouseRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "창고 주담당 결재", tone: LEGACY_COLORS.blue },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.cyan },
};

export const DEPARTMENT_ROLE_LABEL: Record<DepartmentRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "부서 주담당 결재", tone: LEGACY_COLORS.green },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.purple },
};

export const LEVEL_LABEL: Record<string, { label: string; hint: string; tone: string }> = {
  admin: { label: "관리자", hint: "전체 시스템 관리 권한", tone: LEGACY_COLORS.red },
  manager: { label: "매니저", hint: "부서 운영·데이터 수정", tone: LEGACY_COLORS.purple },
  staff: { label: "사원", hint: "기본 작업 권한", tone: LEGACY_COLORS.muted2 },
};
