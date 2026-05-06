"use client";

import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { MODEL_SLOTS, PROCESS_TYPE_OPTIONS, UNIT_OPTIONS } from "../adminShared";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";

/**
 * Round-11A (#3) 추출 — AdminMasterItemsSection 의 선택 품목 편집 폼.
 */
export function EditItemForm({ selectedItem }: { selectedItem: Item }) {
  const { saveItemField: onSaveItemField } = useAdminMasterItemsContext();
  const categoryLabel =
    PROCESS_TYPE_OPTIONS.find((o) => o.value === selectedItem.process_type_code)?.label
    ?? selectedItem.process_type_code
    ?? "—";
  const slotLabels = MODEL_SLOTS.filter((m) => selectedItem.model_slots.includes(m.slot));

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
        </div>
      )}

      {/* 카테고리 (읽기 전용 — 변경 시 품목코드 정합성 깨짐) */}
      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          카테고리
        </div>
        <div
          className="w-full rounded-[18px] border px-4 py-3 text-base"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted }}
        >
          {categoryLabel}
        </div>
      </div>

      {(
        [
          ["item_name", selectedItem.item_name, "품목명"],
          ["spec", selectedItem.spec || "", "사양"],
          ["supplier", selectedItem.supplier || "", "공급처"],
          ["min_stock", String(selectedItem.min_stock ?? ""), "안전재고"],
          ["barcode", selectedItem.barcode || "", "바코드"],
          ["legacy_model", selectedItem.legacy_model || "", "모델"],
        ] as ["item_name" | "spec" | "barcode" | "legacy_model" | "supplier" | "min_stock", string, string][]
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

      {/* 단위 (편집 가능) */}
      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          단위
        </div>
        <select
          defaultValue={selectedItem.unit || "EA"}
          onChange={(event) => onSaveItemField("unit", event.target.value)}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      {/* 사용 제품 (모델 슬롯) — 읽기 전용 */}
      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          사용 제품
        </div>
        {slotLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {slotLabels.map((m) => (
              <span
                key={m.slot}
                className="rounded-full border px-3 py-1.5 text-sm font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 14%, transparent)`,
                  borderColor: LEGACY_COLORS.purple,
                  color: LEGACY_COLORS.purple,
                }}
              >
                {m.label} <span style={{ opacity: 0.7 }}>({m.symbol})</span>
              </span>
            ))}
          </div>
        ) : (
          <div
            className="w-full rounded-[18px] border px-4 py-3 text-base"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            지정 없음
          </div>
        )}
      </div>

      {/* 옵션/스펙 코드 — 읽기 전용 */}
      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          옵션/스펙 코드
        </div>
        <div
          className="w-full rounded-[18px] border px-4 py-3 text-base"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: selectedItem.option_code ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
          }}
        >
          {selectedItem.option_code || "없음"}
        </div>
      </div>
    </div>
  );
}
