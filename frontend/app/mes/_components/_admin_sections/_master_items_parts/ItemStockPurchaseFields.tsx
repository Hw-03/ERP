"use client";

import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { ItemFormData } from "./ItemFormFields";

type StockPurchaseFormData = Pick<
  ItemFormData,
  | "supplier"
  | "supplier_item_code"
  | "standard_purchase_price"
  | "purchase_price_effective_date"
  | "min_stock"
  | "reorder_point"
  | "procurement_lead_time_days"
  | "minimum_order_quantity"
  | "purchase_memo"
>;

type Props<T extends StockPurchaseFormData> = {
  form: T;
  setForm: (updater: (form: T) => T) => void;
  unit: string;
  fillAvailableHeight?: boolean;
};

const INPUT_CLASS = "w-full min-w-0 rounded-[12px] border px-3 py-2 text-sm outline-none transition-colors focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20";
const INPUT_STYLE = {
  background: LEGACY_COLORS.s1,
  borderColor: LEGACY_COLORS.border,
  color: LEGACY_COLORS.text,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  min?: number;
}) {
  return (
    <Field label={label}>
      <div
        className="flex items-center gap-2 rounded-[12px] border px-3 py-2 transition-colors focus-within:border-[var(--c-blue)] focus-within:ring-2 focus-within:ring-[color:var(--c-blue)]/20"
        style={INPUT_STYLE}
      >
        <input
          aria-label={label}
          type="number"
          min={min}
          step="1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <span className="shrink-0 text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          {suffix}
        </span>
      </div>
    </Field>
  );
}

export function ItemStockPurchaseFields<T extends StockPurchaseFormData>({
  form,
  setForm,
  unit,
  fillAvailableHeight = false,
}: Props<T>) {
  const normalizedUnit = unit || "EA";
  const minStock = Number(form.min_stock);
  const reorderPoint = Number(form.reorder_point);
  const showReorderWarning = form.min_stock !== "" && form.reorder_point !== "" && reorderPoint < minStock;

  return (
    <div className={fillAvailableHeight ? "flex h-full flex-col gap-3" : "space-y-3"}>
      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
        <section
          className="rounded-[16px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          aria-labelledby="purchase-criteria-title"
        >
          <h3 id="purchase-criteria-title" className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            구매 기준
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="주 공급사">
              <input
                aria-label="주 공급사"
                type="text"
                value={form.supplier}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({ ...current, supplier: value }));
                }}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="공급사 품번">
              <input
                aria-label="공급사 품번"
                type="text"
                value={form.supplier_item_code}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({ ...current, supplier_item_code: value }));
                }}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label="기준 매입단가">
              <input
                aria-label="기준 매입단가"
                type="text"
                inputMode="decimal"
                value={form.standard_purchase_price}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({ ...current, standard_purchase_price: value }));
                }}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
              <span className="mt-1.5 block text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                원 / {normalizedUnit} · 부가세 별도
              </span>
            </Field>
            <Field label="단가 기준일">
              <input
                aria-label="단가 기준일"
                type="date"
                value={form.purchase_price_effective_date}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({ ...current, purchase_price_effective_date: value }));
                }}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>
          </div>
        </section>

        <section
          className="rounded-[16px] border p-4"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          aria-labelledby="stock-purchase-criteria-title"
        >
          <h3 id="stock-purchase-criteria-title" className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
            재고·발주 기준
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <NumberField
              label="안전재고"
              value={form.min_stock}
              onChange={(value) => setForm((current) => ({ ...current, min_stock: value }))}
              suffix={normalizedUnit}
            />
            <NumberField
              label="발주점"
              value={form.reorder_point}
              onChange={(value) => setForm((current) => ({ ...current, reorder_point: value }))}
              suffix={normalizedUnit}
            />
            <NumberField
              label="조달 리드타임"
              value={form.procurement_lead_time_days}
              onChange={(value) => setForm((current) => ({ ...current, procurement_lead_time_days: value }))}
              suffix="일"
            />
            <NumberField
              label="최소 발주수량(MOQ)"
              value={form.minimum_order_quantity}
              onChange={(value) => setForm((current) => ({ ...current, minimum_order_quantity: value }))}
              suffix={normalizedUnit}
              min={1}
            />
          </div>
          {showReorderWarning && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-[12px] px-3 py-2 text-xs"
              style={{
                background: LEGACY_COLORS.warningBg,
                color: LEGACY_COLORS.yellow,
              }}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              발주점이 안전재고보다 낮습니다. 저장은 가능하지만 발주 기준을 확인하세요.
            </p>
          )}
        </section>
      </div>

      <section
        className={`rounded-[16px] border p-4 ${fillAvailableHeight ? "flex min-h-[169px] flex-1 flex-col" : ""}`}
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        aria-labelledby="purchase-memo-title"
      >
        <h3 id="purchase-memo-title" className="text-sm font-bold" style={{ color: LEGACY_COLORS.text }}>
          구매 메모
        </h3>
        <textarea
          aria-label="구매 메모"
          maxLength={1000}
          rows={3}
          value={form.purchase_memo}
          onChange={(event) => {
            const value = event.target.value;
            setForm((current) => ({ ...current, purchase_memo: value }));
          }}
          placeholder="견적 조건, 납기 주의사항 등을 입력하세요."
          className={`${INPUT_CLASS} mt-3 resize-none ${fillAvailableHeight ? "min-h-24 flex-1" : "h-24"}`}
          style={INPUT_STYLE}
        />
      </section>
    </div>
  );
}
