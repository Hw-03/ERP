"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Employee, type Item } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WMode = "wh2d" | "d2wh" | "whin";

const MODES: { id: WMode; icon: string; label: string }[] = [
  { id: "wh2d", icon: "🏭→🔧", label: "창고→생산부" },
  { id: "d2wh", icon: "🔧→🏭", label: "생산부→창고" },
  { id: "whin", icon: "📥", label: "창고 입고" },
];

function previewFlow(mode: WMode) {
  if (mode === "wh2d") return { from: "🏭 창고", to: "🔧 생산부" };
  if (mode === "d2wh") return { from: "🔧 생산부", to: "🏭 창고" };
  return { from: "🚚 외부", to: "🏭 창고" };
}

export function WarehouseIOTab({
  showToast,
  onOpenHistory,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
}) {
  const [mode, setMode] = useState<WMode>("wh2d");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.getEmployees({ activeOnly: true }), api.getItems({ limit: 2000 })]).then(
      ([nextEmployees, nextItems]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setLoading(false);
      },
    );
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = itemSearch.trim().toLowerCase();
    if (!keyword) return items.slice(0, 30);
    return items
      .filter((item) => {
        const haystack = `${item.item_name} ${item.item_code} ${item.barcode ?? ""}`.toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 50);
  }, [itemSearch, items]);

  const selectedEmployee = employees.find((employee) => employee.employee_id === employeeId) ?? null;
  const selectedItem = items.find((item) => item.item_id === itemId) ?? null;
  const flow = previewFlow(mode);
  const previewQty = Number(qty || 0);

  const expectedQuantity =
    selectedItem && previewQty > 0
      ? mode === "wh2d"
        ? Number(selectedItem.quantity) - previewQty
        : Number(selectedItem.quantity) + previewQty
      : null;

  function resetForm() {
    setItemSearch("");
    setItemId("");
    setQty("1");
    setNote("");
    setReferenceNo("");
    setError(null);
  }

  function validate() {
    if (!employeeId) {
      setError("담당 직원을 선택해 주세요.");
      return false;
    }
    if (!itemId) {
      setError("품목을 선택해 주세요.");
      return false;
    }
    if (!Number(qty) || Number(qty) <= 0) {
      setError("수량을 확인해 주세요.");
      return false;
    }
    setError(null);
    return true;
  }

  async function submit() {
    if (!selectedEmployee || !selectedItem) return;
    try {
      setSubmitting(true);
      const payload = {
        item_id: selectedItem.item_id,
        quantity: Number(qty),
        reference_no: referenceNo || undefined,
        produced_by: `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})`,
        notes: note || undefined,
      };

      if (mode === "wh2d") {
        await api.shipInventory(payload);
      } else {
        await api.receiveInventory(payload);
      }

      setConfirmOpen(false);
      resetForm();
      showToast({
        message: `${MODES.find((entry) => entry.id === mode)?.label} 처리 완료`,
        type: "success",
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "처리하지 못했습니다.";
      setError(message);
      showToast({ message, type: "error" });
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>데이터를 불러오는 중...</div>;
  }

  return (
    <div className="pb-4">
      <button
        onClick={onOpenHistory}
        className="mb-3 flex w-full items-center justify-center rounded-xl border px-4 py-[13px] text-[15px] font-bold transition-all hover:brightness-110"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
      >
        📋 입출고 내역 확인
      </button>

      <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
        이동 유형
      </div>
      <div className="mb-[14px] grid grid-cols-3 gap-2">
        {MODES.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setMode(entry.id);
              resetForm();
            }}
            className="rounded-[14px] border px-2 py-3 text-center transition-all hover:brightness-110"
            style={{
              background: mode === entry.id ? "rgba(79,142,247,.12)" : LEGACY_COLORS.s2,
              borderColor: mode === entry.id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
            }}
          >
            <div className="mb-1 text-[22px]">{entry.icon}</div>
            <div
              className="text-xs font-bold"
              style={{ color: mode === entry.id ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}
            >
              {entry.label}
            </div>
          </button>
        ))}
      </div>

      <div
        className="mb-[14px] flex items-center gap-2 rounded-xl border px-[14px] py-[10px]"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="flex-1 rounded-lg px-3 py-[5px] text-center text-[13px] font-bold" style={{ background: LEGACY_COLORS.s3 }}>
          {flow.from}
        </div>
        <div className="text-xl" style={{ color: LEGACY_COLORS.blue }}>
          →
        </div>
        <div className="flex-1 rounded-lg px-3 py-[5px] text-center text-[13px] font-bold" style={{ background: LEGACY_COLORS.s3 }}>
          {flow.to}
        </div>
      </div>

      <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
        담당 직원
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {employees.map((employee) => {
          const active = employee.employee_id === employeeId;
          const color = employeeColor(employee.department);
          return (
            <button
              key={employee.employee_id}
              onClick={() => setEmployeeId(employee.employee_id)}
              className="shrink-0 px-1 transition-all hover:brightness-110"
            >
              <div className="mb-1 flex justify-center">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] text-base font-black text-white"
                  style={{
                    background: color,
                    borderColor: active ? LEGACY_COLORS.blue : "transparent",
                    boxShadow: active ? "0 0 0 3px rgba(79,142,247,.2)" : "none",
                    opacity: employeeId && !active ? 0.35 : 1,
                  }}
                >
                  {firstEmployeeLetter(employee.name)}
                </div>
              </div>
              <div
                className="max-w-[48px] truncate text-[9px] font-semibold"
                style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
              >
                {employee.name}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => {
          searchRef.current?.focus();
          showToast({ message: "카메라 스캔은 다음 단계에서 연결합니다. 검색창으로 바로 이동했습니다.", type: "info" });
        }}
        className="mb-[10px] flex w-full items-center gap-3 rounded-xl border px-[14px] py-3 text-left transition-all hover:brightness-110"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div
          className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[22px]"
          style={{ background: "rgba(79,142,247,.15)" }}
        >
          📷
        </div>
        <div>
          <div className="text-sm font-bold">QR 스캔</div>
          <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
            카메라로 상품 인식
          </div>
        </div>
        <div className="ml-auto text-[22px]" style={{ color: LEGACY_COLORS.muted }}>
          ›
        </div>
      </button>

      <div className="mb-[10px] flex items-center gap-[10px]">
        <div className="h-px flex-1" style={{ background: LEGACY_COLORS.border }} />
        <span className="text-[10px] font-semibold" style={{ color: LEGACY_COLORS.muted }}>
          또는 직접 선택
        </span>
        <div className="h-px flex-1" style={{ background: LEGACY_COLORS.border }} />
      </div>

      <div className="mb-2 flex items-center gap-2 rounded-[11px] border px-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
        <span>🔍</span>
        <input
          ref={searchRef}
          value={itemSearch}
          onChange={(event) => {
            setItemSearch(event.target.value);
            setItemId("");
          }}
          placeholder="품명 검색.."
          className="w-full bg-transparent py-[10px] text-sm outline-none"
          style={{ color: LEGACY_COLORS.text }}
        />
      </div>

      <div
        className="mb-3 max-h-[200px] overflow-y-auto rounded-[14px] border"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {filteredItems.map((item, index) => (
          <button
            key={item.item_id}
            onClick={() => {
              setItemId(item.item_id);
              setItemSearch(buildItemSearchLabel(item));
            }}
            className="flex w-full items-center justify-between px-[14px] py-3 text-left transition-colors hover:bg-white/[0.12]"
            style={{
              borderBottom: index === filteredItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
            }}
          >
            <div>
              <div className="text-sm font-semibold">{item.item_name}</div>
              <div className="text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {item.item_code}
              </div>
            </div>
            <div className="font-mono text-xs" style={{ color: LEGACY_COLORS.cyan }}>
              {formatNumber(item.quantity)} {item.unit}
            </div>
          </button>
        ))}
      </div>

      {selectedItem ? (
        <div className="mb-3">
          <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
            선택된 품목
          </div>
          <div className="rounded-[14px] border px-[14px] py-3" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
            <div className="text-sm font-bold">{selectedItem.item_name}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
              {selectedItem.item_code} · {selectedItem.spec || "-"}
            </div>
            <div className="mt-3 flex gap-5">
              <div>
                <div className="text-[9px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  현재 재고
                </div>
                <div className="font-mono text-[22px] font-black" style={{ color: LEGACY_COLORS.blue }}>
                  {formatNumber(selectedItem.quantity)}
                </div>
              </div>
              <div>
                <div className="text-[9px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  처리 후 예상
                </div>
                <div className="font-mono text-[22px] font-black" style={{ color: LEGACY_COLORS.green }}>
                  {expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-3">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
          수량
        </div>
        <input
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          inputMode="numeric"
          className="mb-[7px] w-full rounded-[11px] border px-[13px] py-[11px] text-center text-[22px] font-bold outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
            fontFamily: 'Menlo, "Courier New", monospace',
          }}
        />
        <div className="grid grid-cols-4 gap-[7px]">
          {[-10, -1, 1, 10].map((delta) => (
            <button
              key={delta}
              onClick={() => setQty((current) => String(Math.max(1, Number(current || 0) + delta)))}
              className="rounded-[10px] py-[11px] text-sm font-bold"
              style={{
                background: delta < 0 ? "rgba(242,95,92,.15)" : "rgba(31,209,122,.12)",
                color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
              }}
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
          비고
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="메모 (선택)"
          className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      <div className="mb-3">
        <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
          참조번호
        </div>
        <input
          value={referenceNo}
          onChange={(event) => setReferenceNo(event.target.value)}
          placeholder="예: LOT-240412"
          className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      {selectedItem ? (
        <div className="mb-3 rounded-[11px] border px-[14px] py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
          <div className="text-sm font-semibold">{MODES.find((entry) => entry.id === mode)?.label}</div>
          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {selectedEmployee ? `${selectedEmployee.name} · ` : ""}
            {selectedItem.item_name} · {formatNumber(qty)} {selectedItem.unit}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.25)", color: LEGACY_COLORS.red }}>
          {error}
        </div>
      ) : null}

      <button
        onClick={() => {
          if (validate()) setConfirmOpen(true);
        }}
        className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white"
        style={{ background: LEGACY_COLORS.green, color: "#000" }}
      >
        처리하기
      </button>

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="이동 확인">
        <div className="space-y-2 px-5 pb-6">
          {[
            ["유형", MODES.find((entry) => entry.id === mode)?.label || "-"],
            ["직원", selectedEmployee ? `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})` : "-"],
            ["품목", selectedItem?.item_name || "-"],
            ["수량", selectedItem ? `${formatNumber(qty)} ${selectedItem.unit}` : "-"],
            ["참조번호", referenceNo || "-"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: LEGACY_COLORS.s2 }}>
              <div className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {label}
              </div>
              <div className="text-right text-sm">{value}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => setConfirmOpen(false)}
              className="rounded-xl border py-3 text-sm"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              취소
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue }}
            >
              {submitting ? "처리 중..." : "확인"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
