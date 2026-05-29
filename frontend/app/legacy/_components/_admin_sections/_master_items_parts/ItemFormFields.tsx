"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";
import { PROCESS_TYPE_OPTIONS, MODEL_SLOTS, UNIT_OPTIONS } from "../adminShared";

export type ItemFormData = {
  item_name: string;
  legacy_item_type: string;
  supplier: string;
  min_stock: string;
  process_type_code: string;
  unit: string;
  model_slots: number[];
  option_code: string;
  initial_quantity?: string;
  item_code?: string;
};

interface Props {
  form: ItemFormData;
  setForm: (updater: (f: ItemFormData) => ItemFormData) => void;
  showInitialQuantity?: boolean;
  showItemCode?: boolean;
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

/** model_slots + process_type_code 로 권장 prefix 계산 */
function previewCodePrefix(slots: number[], processType: string): string {
  const sorted = [...slots].sort((a, b) => a - b);
  const symbols = sorted
    .map((s) => MODEL_SLOTS.find((m) => m.slot === s)?.symbol)
    .filter(Boolean)
    .join("");
  if (!symbols || !processType) return "";
  return `${symbols}-${processType}-`;
}

const CODE_PARSE = /^([0-9]+)-([A-Z]{2})-(\d{4})(?:-(\w+))?$/;

/** form 상태에서 표시할 코드 미리보기 계산.
 *  - 카테고리 변경 시 새 카테고리는 백엔드 의존이라 "???? (저장 시 부여)" 안내.
 *  - 모델만 변경 (또는 미변경) 시 serial 유지, prefix·option 갱신.
 */
function previewFullCode(form: ItemFormData): string {
  const prefix = previewCodePrefix(form.model_slots, form.process_type_code);
  if (!prefix) return form.item_code || "(자동 부여)";

  const m = (form.item_code || "").match(CODE_PARSE);
  if (!m) {
    // 기존 코드 패턴 모름 — 미리보기는 prefix 만 보여줌.
    return `${prefix}???? (저장 시 부여)`;
  }
  const [, , oldPt, serial] = m;
  if (oldPt !== form.process_type_code) {
    return `${prefix}???? (저장 시 부여)`;
  }
  const opt = form.option_code ? `-${form.option_code}` : "";
  return `${prefix}${serial}${opt}`;
}

function ItemCodeSection({
  form,
}: {
  form: ItemFormData;
}) {
  const prefix = previewCodePrefix(form.model_slots, form.process_type_code);

  return (
    <div>
      <FieldLabel label="품목 코드" />
      {prefix && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span
            className="rounded-[10px] px-3 py-1 text-sm font-mono"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 12%, transparent)`,
              color: LEGACY_COLORS.purple,
              border: `1px solid color-mix(in srgb, ${LEGACY_COLORS.purple} 30%, transparent)`,
            }}
          >
            현재 코드 prefix: <strong>{prefix}</strong>
          </span>
        </div>
      )}
      <div
        className="w-full rounded-[18px] border px-4 py-3 text-base font-mono"
        style={{
          ...inputStyle,
          background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
          color: form.item_code ? LEGACY_COLORS.text : LEGACY_COLORS.muted2,
        }}
        aria-readonly
      >
        {previewFullCode(form)}
      </div>
      <p className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
        품목 코드는 사용제품·카테고리·옵션에서 자동 계산됩니다. 사용제품만 바꾸면 번호 유지(즉시 미리 보임), 카테고리를 바꾸면 새 카테고리의 다음 번호가 저장 시 부여됩니다.
      </p>
    </div>
  );
}

export function ItemFormFields({ form, setForm, showInitialQuantity, showItemCode }: Props) {
  return (
    <>
      {/* 텍스트/숫자 필드 */}
      {([
        { key: "item_name", label: "품목명", badge: "필수" as const, type: "text", placeholder: "예: 텅스텐 필라멘트" },
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
            step={1}
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
            step={type === "number" ? 1 : undefined}
            value={form[key] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={inputStyle}
          />
        </div>
      ))}

      {showItemCode && (
        <ItemCodeSection form={form} />
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
        {form.model_slots.length > 0 ? (
          <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.purple }}>
            제품 기호:{" "}
            {MODEL_SLOTS.filter((m) => form.model_slots.includes(m.slot))
              .map((m) => m.symbol)
              .sort()
              .join("")}
          </div>
        ) : (
          <div className="mt-1.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            사용 제품이 지정되지 않았습니다. 위 칩을 클릭해 모델 슬롯을 선택하세요.
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
