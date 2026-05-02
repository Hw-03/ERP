"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BOMDetailEntry, DepartmentMaster, Employee, Item, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { DeptManagementPanel } from "./DeptManagementPanel";

/**
 * Round-11A (#4) 추출 — DesktopAdminView 우측 요약/안내 패널.
 *
 * `section === "departments"` 분기는 DeptManagementPanel 또는 안내 카드,
 * 그 외 section 은 안내 카드 + 현재 상태 요약.
 */
export interface AdminRightPanelContentProps {
  section: string;
  selectedDept: DepartmentMaster | null;
  setSelectedDept: Dispatch<SetStateAction<DepartmentMaster | null>>;
  departments: DepartmentMaster[];
  setDepartments: Dispatch<SetStateAction<DepartmentMaster[]>>;
  adminPin: string;
  onStatusChange: (status: string) => void;
  setMessage: (m: string) => void;

  items: Item[];
  employees: Employee[];
  packages: ShipPackage[];
  allBomRows: BOMDetailEntry[];
}

export function AdminRightPanelContent({
  section,
  selectedDept,
  setSelectedDept,
  departments,
  setDepartments,
  adminPin,
  onStatusChange,
  setMessage,
  items,
  employees,
  packages,
  allBomRows,
}: AdminRightPanelContentProps) {
  if (section === "departments") {
    if (selectedDept) {
      return (
        <DeptManagementPanel
          dept={selectedDept}
          adminPin={adminPin}
          departments={departments}
          setDepartments={setDepartments}
          setSelectedDept={setSelectedDept}
          onStatusChange={onStatusChange}
          onError={setMessage}
        />
      );
    }
    return (
      <div className="space-y-4">
        <div
          className="rounded-[20px] border p-4 text-sm leading-6"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          부서를 클릭하면 색상 변경, 비활성화, 삭제 옵션이 표시됩니다.
        </div>
        <div
          className="rounded-[20px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
            현재 상태
          </div>
          <div className="space-y-1.5 text-sm">
            <div>활성 {formatQty(departments.filter((d) => d.is_active).length)}개</div>
            <div>비활성 {formatQty(departments.filter((d) => !d.is_active).length)}개</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-[28px] border p-5 text-base leading-6"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {section === "items" && "품목 섹션에서는 이름, 바코드, 공급처, 모델 정보를 바로 수정할 수 있습니다."}
        {section === "employees" && "직원 섹션에서는 직원의 운영 상태를 빠르게 전환할 수 있습니다."}
        {section === "bom" && "BOM 섹션에서는 상위 품목을 기준으로 하위 자재를 추가하거나 제거할 수 있습니다."}
        {section === "packages" && "출하묶음 섹션에서는 패키지를 만들고 구성 품목을 빠르게 추가할 수 있습니다."}
        {section === "export" && "엑셀 내보내기 섹션에서 품목·거래 데이터를 엑셀 파일로 다운로드할 수 있습니다."}
        {section === "settings" && "설정 섹션에서는 관리자 PIN 변경, 초기화를 관리합니다."}
      </div>
      <div
        className="rounded-[28px] border p-5"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.muted2 }}>
          현재 상태
        </div>
        <div className="space-y-2 text-base">
          <div>품목 {formatQty(items.length)}건</div>
          <div>직원 {formatQty(employees.length)}명</div>
          <div>출하묶음 {formatQty(packages.length)}건</div>
          <div>BOM {formatQty(allBomRows.length)}건</div>
        </div>
      </div>
    </div>
  );
}
