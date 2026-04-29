"use client";

import { PackagePlus, Search, X } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS, formatNumber } from "../legacyUi";
import { PROCESS_TYPE_OPTIONS, EMPTY_ADD_FORM, MODEL_SLOTS, UNIT_OPTIONS } from "./adminShared";
import { useAdminMasterItemsContext } from "./AdminMasterItemsContext";

// Props 없음. AdminMasterItemsProvider 의 Context 에서 모두 읽는다.
export function AdminMasterItemsSection() {
  const ctx = useAdminMasterItemsContext();
  const {
    visibleItems,
    selectedItem,
    setSelectedItem,
    itemSearch,
    setItemSearch,
    addMode,
    setAddMode,
    addForm,
    setAddForm,
    addItem: onAddItem,
    saveItemField: onSaveItemField,
  } = ctx;
  return (
    <div className="grid h-full gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* 품목 목록 */}
      <div
        className="flex min-h-0 flex-col rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div
            className="flex items-center gap-2 rounded-[14px] border px-3 py-2"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="품목명, 코드 검색"
              className="w-full bg-transparent text-base outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {formatNumber(visibleItems.length)}건
            </span>
            <button
              onClick={() => {
                setAddMode(true);
                setSelectedItem(null);
              }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
              style={{ background: LEGACY_COLORS.green, color: "#fff" }}
            >
              <PackagePlus className="h-3.5 w-3.5" />
              품목 추가
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleItems.map((item, index) => (
            <button
              key={item.item_id}
              onClick={() => setSelectedItem(item)}
              className="block w-full px-4 py-4 text-left"
              style={{
                borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                background:
                  selectedItem?.item_id === item.item_id
                    ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 10%, transparent)`
                    : "transparent",
              }}
            >
              <div className="text-base font-semibold">{item.item_name}</div>
              <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>{item.erp_code}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 품목 추가 / 편집 패널 */}
      <div
        className="overflow-y-auto rounded-[28px] border p-5"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {addMode ? (
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
        ) : selectedItem ? (
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
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              왼쪽 목록에서 품목을 선택하면<br />정보를 수정할 수 있습니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
