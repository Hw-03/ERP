"use client";

import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { MODEL_SLOTS } from "../adminShared";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";

/**
 * Round-11A (#3) 추출 — AdminMasterItemsSection 의 선택 품목 편집 폼.
 */
export function EditItemForm({ selectedItem }: { selectedItem: Item }) {
  const { saveItemField: onSaveItemField } = useAdminMasterItemsContext();

  return (
    <div className="space-y-4">
      <div className="mb-2 text-base font-bold">{selectedItem.item_name}</div>
      {selectedItem.erp_code && (
        <div
          className="rounded-[14px] border px-4 py-3"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 8%, transparent)`,
            borderColor: LEGACY_COLORS.purple,
          }}
        >
          <div className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: LEGACY_COLORS.purple }}>
            품목 코드
          </div>
          <div className="mt-1 text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            {selectedItem.erp_code}
          </div>
          {selectedItem.model_slots.length > 0 && (
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {MODEL_SLOTS.filter((m) => selectedItem.model_slots.includes(m.slot))
                .map((m) => m.label)
                .join(" · ")}
            </div>
          )}
        </div>
      )}
      {(
        [
          ["item_name", selectedItem.item_name, "품목명"],
          ["spec", selectedItem.spec || "", "사양"],
          ["barcode", selectedItem.barcode || "", "바코드"],
          ["legacy_model", selectedItem.legacy_model || "", "모델"],
          ["supplier", selectedItem.supplier || "", "공급처"],
        ] as ["item_name" | "spec" | "barcode" | "legacy_model" | "supplier", string, string][]
      ).map(([field, value, label]) => (
        <div key={field}>
          <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
            {label}
          </div>
          <input
            defaultValue={value}
            onBlur={(event) => onSaveItemField(field, event.target.value)}
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </div>
      ))}
    </div>
  );
}
