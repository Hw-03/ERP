"use client";

import type { Employee, Item, ShipPackage } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import type { WorkType } from "../_warehouse_steps";

type Props = {
  selectedEmployee: Employee | null;
  effectiveLabel: string;
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  totalQty: number;
  notes: string;
};

export function WarehouseConfirmContent({
  selectedEmployee,
  effectiveLabel,
  workType,
  selectedEntries,
  selectedPackage,
  totalQty,
  notes,
}: Props) {
  return (
    <>
      <dl
        className="mb-4 grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 rounded-[14px] border p-3 text-sm"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>담당자</dt>
        <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>
          {selectedEmployee
            ? `${selectedEmployee.name} · ${normalizeDepartment(selectedEmployee.department)}`
            : "-"}
        </dd>
        <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>작업</dt>
        <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{effectiveLabel}</dd>
        {workType !== "package-out" ? (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>품목 수</dt>
            <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedEntries.length}건</dd>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>총 수량</dt>
            <dd className="font-black tabular-nums" style={{ color: LEGACY_COLORS.text }}>
              {formatQty(totalQty)} EA
            </dd>
          </>
        ) : (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>패키지</dt>
            <dd className="font-black" style={{ color: LEGACY_COLORS.text }}>{selectedPackage?.name ?? "-"}</dd>
          </>
        )}
        {notes && (
          <>
            <dt className="font-bold" style={{ color: LEGACY_COLORS.muted2 }}>메모</dt>
            <dd className="truncate" style={{ color: LEGACY_COLORS.text }}>{notes}</dd>
          </>
        )}
      </dl>

      {workType !== "package-out" && selectedEntries.length > 0 && (
        <div
          className="mb-1 max-h-[180px] overflow-y-auto rounded-[14px] border"
          style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, overscrollBehavior: "contain" }}
        >
          <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
            {selectedEntries.map((entry) => (
              <li
                key={entry.item.item_id}
                className="flex items-center justify-between px-3 py-2 text-xs"
                style={{ borderColor: LEGACY_COLORS.border }}
              >
                <span className="truncate" style={{ color: LEGACY_COLORS.text }}>
                  {entry.item.item_name}
                </span>
                <span className="shrink-0 font-black tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                  ×{formatQty(entry.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
