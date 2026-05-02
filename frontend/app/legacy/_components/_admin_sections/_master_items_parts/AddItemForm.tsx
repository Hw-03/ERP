"use client";

import { X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { PROCESS_TYPE_OPTIONS, EMPTY_ADD_FORM, MODEL_SLOTS, UNIT_OPTIONS } from "../adminShared";
import { useAdminMasterItemsContext } from "../AdminMasterItemsContext";

/**
 * Round-11A (#3) 추출 — AdminMasterItemsSection 의 신규 품목 추가 폼.
 */
export function AddItemForm() {
  const {
    setAddMode,
    addForm,
    setAddForm,
    addItem: onAddItem,
  } = useAdminMasterItemsContext();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold">새 품목 추가</div>
        <button
          onClick={() => {
            setAddMode(false);
            setAddForm(() => EMPTY_ADD_FORM);
          }}
          className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
          style={{ color: LEGACY_COLORS.red }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {[
        { key: "item_name", label: "품목명", required: true, type: "text", placeholder: "예: 텅스텐 필라멘트" },
        { key: "spec", label: "규격", required: false, type: "text", placeholder: "예: Ø0.3 × L50" },
        { key: "initial_quantity", label: "현재 수량", required: false, type: "number", placeholder: "0" },
        { key: "legacy_item_type", label: "자재분류", required: false, type: "text", placeholder: "예: 필라멘트, 애자" },
        { key: "supplier", label: "공급사", required: false, type: "text", placeholder: "예: 삼성특수금속" },
        { key: "min_stock", label: "안전재고", required: false, type: "number", placeholder: "0" },
      ].map(({ key, label, required, type, placeholder }) => (
        <div key={key}>
          <div
            className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            {label}
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: required
                  ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
                  : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
                color: required ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
              }}
            >
              {required ? "필수" : "선택"}
            </span>
          </div>
          <input
            type={type}
            min={type === "number" ? 0 : undefined}
            value={(addForm as unknown as Record<string, string>)[key]}
            onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
        </div>
      ))}
      <div>
        <div
          className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          카테고리
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            필수
          </span>
        </div>
        <select
          value={addForm.process_type_code}
          onChange={(e) => setAddForm((f) => ({ ...f, process_type_code: e.target.value }))}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {PROCESS_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div>
        <div
          className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          단위
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
              color: LEGACY_COLORS.muted2,
            }}
          >
            선택
          </span>
        </div>
        <select
          value={addForm.unit}
          onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        >
          {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div>
        <div
          className="mb-2 text-sm font-bold uppercase tracking-[0.18em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          사용 제품 <span style={{ color: LEGACY_COLORS.muted2, fontWeight: 400 }}>(제품 기호)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODEL_SLOTS.map(({ slot, label, symbol }) => {
            const checked = addForm.model_slots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                onClick={() =>
                  setAddForm((f) => ({
                    ...f,
                    model_slots: checked
                      ? f.model_slots.filter((s) => s !== slot)
                      : [...f.model_slots, slot].sort(),
                  }))
                }
                className="rounded-full border px-3 py-1.5 text-sm font-bold transition-colors"
                style={{
                  background: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.s1,
                  borderColor: checked ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
                  color: checked ? "#fff" : LEGACY_COLORS.muted2,
                }}
              >
                {label} <span style={{ opacity: 0.7 }}>({symbol})</span>
              </button>
            );
          })}
        </div>
        {addForm.model_slots.length > 0 && (
          <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.purple }}>
            제품 기호:{" "}
            {MODEL_SLOTS.filter((m) => addForm.model_slots.includes(m.slot))
              .map((m) => m.symbol)
              .sort()
              .join("")}
          </div>
        )}
      </div>
      <div>
        <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
          옵션/스펙 코드
        </div>
        <input
          type="text"
          value={addForm.option_code}
          onChange={(e) => setAddForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))}
          placeholder="예: BG (블랙 유광), WM (화이트 무광)"
          maxLength={10}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>
      <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        품번은 카테고리 기반으로 자동 부여됩니다. (예: RM-00972)
      </div>
      <button
        onClick={onAddItem}
        className="w-full rounded-[18px] py-3 text-base font-bold text-white"
        style={{ background: LEGACY_COLORS.green }}
      >
        추가
      </button>
    </div>
  );
}
