"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";
import { PROCESS_TYPE_OPTIONS, MODEL_SLOTS, UNIT_OPTIONS } from "../adminShared";

export type ItemFormData = {
  item_name: string;
  spec: string;
  legacy_item_type: string;
  supplier: string;
  min_stock: string;
  process_type_code: string;
  unit: string;
  model_slots: number[];
  option_code: string;
  initial_quantity?: string;
  erp_code?: string;
};

interface Props {
  form: ItemFormData;
  setForm: (updater: (f: ItemFormData) => ItemFormData) => void;
  showInitialQuantity?: boolean;
  showErpCode?: boolean;
}

function FieldLabel({ label, badge }: { label: string; badge?: "필수" | "선택" }) {
  return (
    <div
      className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {label}
      {badge && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
          style={{
            background: badge === "필수"
              ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
              : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
            color: badge === "필수" ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

const inputStyle = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
  color: LEGACY_COLORS.text,
};

export function ItemFormFields({ form, setForm, showInitialQuantity, showErpCode }: Props) {
  return (
    <>
      {/* 텍스트/숫자 필드 */}
      {([
        { key: "item_name",   label: "품목명",   badge: "필수" as const, type: "text",   placeholder: "예: 텅스텐 필라멘트" },
        { key: "spec",        label: "규격",     badge: "선택" as const, type: "text",   placeholder: "예: Ø0.3 × L50" },
      ] as const).map(({ key, label, badge, type, placeholder }) => (
        <div key={key}>
          <FieldLabel label={label} badge={badge} />
          <input
            type={type}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
      ))}

      {showInitialQuantity && (
        <div>
          <FieldLabel label="현재 수량" badge="선택" />
          <input
            type="number"
            min={0}
            value={form.initial_quantity ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, initial_quantity: e.target.value }))}
            placeholder="0"
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
      )}

      {([
        { key: "legacy_item_type", label: "자재분류", type: "text",   placeholder: "예: 필라멘트, 애자" },
        { key: "supplier",         label: "공급사",   type: "text",   placeholder: "예: 삼성특수금속" },
        { key: "min_stock",        label: "안전재고", type: "number", placeholder: "0" },
      ] as const).map(({ key, label, type, placeholder }) => (
        <div key={key}>
          <FieldLabel label={label} badge="선택" />
          <input
            type={type}
            min={type === "number" ? 0 : undefined}
            value={form[key] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
      ))}

      {showErpCode && (
        <div>
          <FieldLabel label="품목 코드" badge="선택" />
          <input
            type="text"
            value={form.erp_code ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, erp_code: e.target.value }))}
            placeholder="예: 346-AR-0001"
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
      )}

      {/* 카테고리 */}
      <div>
        <FieldLabel label="카테고리" badge="필수" />
        <AppSelect
          value={form.process_type_code}
          onChange={(v) => setForm((f) => ({ ...f, process_type_code: v }))}
          size="lg"
          triggerStyle={{ background: LEGACY_COLORS.s1 }}
          options={PROCESS_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
        />
      </div>

      {/* 단위 */}
      <div>
        <FieldLabel label="단위" badge="선택" />
        <AppSelect
          value={form.unit}
          onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
          size="lg"
          triggerStyle={{ background: LEGACY_COLORS.s1 }}
          options={UNIT_OPTIONS.map((u) => ({ value: u, label: u }))}
        />
      </div>

      {/* 사용 제품 (모델 슬롯) */}
      <div>
        <FieldLabel label="사용 제품" />
        <div className="flex flex-wrap gap-2">
          {MODEL_SLOTS.map(({ slot, label, symbol }) => {
            const checked = form.model_slots.includes(slot);
            return (
              <button
                key={slot}
                type="button"
                onClick={() =>
                  setForm((f) => ({
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
                  color: checked ? LEGACY_COLORS.white : LEGACY_COLORS.muted2,
                }}
              >
                {label} <span style={{ opacity: 0.7 }}>({symbol})</span>
              </button>
            );
          })}
        </div>
        {form.model_slots.length > 0 && (
          <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.purple }}>
            제품 기호:{" "}
            {MODEL_SLOTS.filter((m) => form.model_slots.includes(m.slot))
              .map((m) => m.symbol)
              .sort()
              .join("")}
          </div>
        )}
      </div>

      {/* 옵션/스펙 코드 */}
      <div>
        <FieldLabel label="옵션/스펙 코드" />
        <input
          type="text"
          value={form.option_code}
          onChange={(e) => setForm((f) => ({ ...f, option_code: e.target.value.toUpperCase() }))}
          placeholder="예: BG (블랙 유광), WM (화이트 무광)"
          maxLength={10}
          className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
          style={inputStyle}
        />
      </div>
    </>
  );
}
