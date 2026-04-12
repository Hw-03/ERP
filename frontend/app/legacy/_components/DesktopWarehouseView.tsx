"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, PackageCheck, RefreshCw, ScanLine, UserRound } from "lucide-react";
import { api, type Employee, type Item } from "@/lib/api";
import { DesktopRightPanel } from "./DesktopRightPanel";
import {
  LEGACY_COLORS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

type WarehouseMode = "wh2d" | "d2wh" | "whin";

const WAREHOUSE_MODES: { id: WarehouseMode; label: string; subtitle: string }[] = [
  { id: "wh2d", label: "창고 → 부서", subtitle: "창고 출고 처리" },
  { id: "d2wh", label: "부서 → 창고", subtitle: "부서 반납 처리" },
  { id: "whin", label: "창고 입고", subtitle: "외부 수령 반영" },
];

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const [mode, setMode] = useState<WarehouseMode>("wh2d");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [itemId, setItemId] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const [nextEmployees, nextItems] = await Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
    ]);
    setEmployees(nextEmployees);
    setItems(nextItems);
    onStatusChange(`창고입출고용 직원 ${nextEmployees.length}명과 품목 ${nextItems.length}건을 불러왔습니다.`);
  }

  useEffect(() => {
    void loadData().catch((nextError) => {
      onStatusChange(nextError instanceof Error ? nextError.message : "창고입출고 데이터를 불러오지 못했습니다.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSearch]);

  const filteredItems = useMemo(() => {
    const keyword = `${globalSearch} ${localSearch}`.trim().toLowerCase();
    if (!keyword) return items.slice(0, 100);
    return items
      .filter((item) => `${item.item_name} ${item.item_code} ${item.barcode ?? ""}`.toLowerCase().includes(keyword))
      .slice(0, 160);
  }, [globalSearch, items, localSearch]);

  const selectedEmployee = employees.find((employee) => employee.employee_id === employeeId) ?? null;
  const selectedItem = items.find((item) => item.item_id === itemId) ?? null;
  const numericQty = Number(quantity || 0);
  const expectedQuantity =
    selectedItem && numericQty > 0
      ? mode === "wh2d"
        ? Number(selectedItem.quantity) - numericQty
        : Number(selectedItem.quantity) + numericQty
      : null;

  async function submit() {
    if (!selectedEmployee) {
      setError("담당 직원을 먼저 선택해 주세요.");
      return;
    }
    if (!selectedItem) {
      setError("품목을 먼저 선택해 주세요.");
      return;
    }
    if (!numericQty || numericQty <= 0) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const payload = {
        item_id: selectedItem.item_id,
        quantity: numericQty,
        reference_no: referenceNo || undefined,
        produced_by: `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})`,
        notes: notes || undefined,
      };

      if (mode === "wh2d") {
        await api.shipInventory(payload);
      } else {
        await api.receiveInventory(payload);
      }

      await loadData();
      setReferenceNo("");
      setNotes("");
      setQuantity("1");
      onStatusChange(`${selectedItem.item_name} 창고 처리를 완료했습니다.`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "창고입출고 처리를 완료하지 못했습니다.";
      setError(message);
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-5 px-6 py-6">
        <section className="space-y-4 rounded-[28px] border p-5" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              1. 처리 방식
            </div>
            <div className="space-y-2">
              {WAREHOUSE_MODES.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setMode(entry.id)}
                  className="w-full rounded-2xl border px-4 py-3 text-left"
                  style={{
                    background: mode === entry.id ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
                    borderColor: mode === entry.id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <div className="text-sm font-bold">{entry.label}</div>
                  <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {entry.subtitle}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              2. 담당자
            </div>
            <div className="space-y-2">
              {employees.map((employee) => (
                <button
                  key={employee.employee_id}
                  onClick={() => setEmployeeId(employee.employee_id)}
                  className="flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left"
                  style={{
                    background: employeeId === employee.employee_id ? "rgba(79,142,247,.16)" : LEGACY_COLORS.s2,
                    borderColor: employeeId === employee.employee_id ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                  }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full font-black text-white"
                    style={{ background: employeeColor(employee.department) }}
                  >
                    {firstEmployeeLetter(employee.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{employee.name}</div>
                    <div className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                      {normalizeDepartment(employee.department)} / {employee.role}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="min-h-0 rounded-[28px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div>
              <div className="text-lg font-black">창고입출고 작업대</div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                담당자 선택 → 품목 선택 → 수량 입력 → 우측 확인 패널에서 실행 순서로 진행합니다.
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-2" style={{ background: LEGACY_COLORS.s2, color: LEGACY_COLORS.muted2 }}>
              <ArrowRightLeft className="h-4 w-4" />
              {WAREHOUSE_MODES.find((entry) => entry.id === mode)?.label}
            </div>
          </div>

          <div className="border-b px-5 py-4" style={{ borderColor: LEGACY_COLORS.border }}>
            <div className="flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
              <ScanLine className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
              <input
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder="품목명, 코드, 바코드 검색"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: LEGACY_COLORS.text }}
              />
            </div>
          </div>

          <div className="h-[calc(100vh-240px)] overflow-auto">
            <table className="min-w-full text-left">
              <thead className="sticky top-0 z-10" style={{ background: LEGACY_COLORS.s2 }}>
                <tr className="text-xs uppercase tracking-[0.16em]" style={{ color: LEGACY_COLORS.muted2 }}>
                  <th className="px-5 py-3">품목</th>
                  <th className="px-5 py-3">바코드</th>
                  <th className="px-5 py-3">위치</th>
                  <th className="px-5 py-3 text-right">현재고</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.item_id}
                    onClick={() => {
                      setItemId(item.item_id);
                      setLocalSearch(buildItemSearchLabel(item));
                    }}
                    className="cursor-pointer border-b transition hover:bg-white/5"
                    style={{
                      borderColor: LEGACY_COLORS.border,
                      background: itemId === item.item_id ? "rgba(79,142,247,.08)" : undefined,
                      boxShadow: itemId === item.item_id ? `inset 3px 0 0 ${LEGACY_COLORS.blue}` : undefined,
                    }}
                  >
                    <td className="px-5 py-4">
                      <div className="text-sm font-semibold">{item.item_name}</div>
                      <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                        {item.item_code}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                      {item.barcode || "-"}
                    </td>
                    <td className="px-5 py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                      {item.legacy_part || item.location || "-"}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold" style={{ color: LEGACY_COLORS.blue }}>
                      {formatNumber(item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <DesktopRightPanel
        title="실행 확인"
        subtitle="선택한 담당자와 품목 기준으로 실제 재고 처리 API가 바로 반영됩니다."
      >
        <div className="space-y-4">
          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "rgba(79,142,247,.16)", color: LEGACY_COLORS.blue }}>
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold">{selectedEmployee?.name || "담당자 미선택"}</div>
                <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                  {selectedEmployee ? normalizeDepartment(selectedEmployee.department) : "먼저 담당자를 선택해 주세요."}
                </div>
              </div>
            </div>
            <div className="rounded-2xl px-3 py-3" style={{ background: LEGACY_COLORS.s1 }}>
              <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                선택 품목
              </div>
              <div className="text-sm font-semibold">{selectedItem?.item_name || "품목 미선택"}</div>
              <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                {selectedItem ? `${selectedItem.item_code} / ${selectedItem.unit}` : "중앙 목록에서 품목을 선택해 주세요."}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              3. 수량 / 참조
            </div>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              className="mb-3 w-full rounded-2xl border px-4 py-3 text-center font-mono text-xl font-black outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            <div className="mb-3 grid grid-cols-4 gap-2">
              {[-10, -1, 1, 10].map((delta) => (
                <button
                  key={delta}
                  onClick={() => setQuantity((current) => String(Math.max(1, Number(current || 0) + delta)))}
                  className="rounded-2xl px-3 py-2 text-sm font-bold"
                  style={{
                    background: delta < 0 ? "rgba(242,95,92,.14)" : "rgba(31,209,122,.14)",
                    color: delta < 0 ? LEGACY_COLORS.red : LEGACY_COLORS.green,
                  }}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
            <input
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="참조번호"
              className="mb-3 w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="처리 사유 또는 메모"
              className="min-h-[96px] w-full rounded-2xl border px-4 py-3 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </section>

          <section className="rounded-3xl border p-4" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
              4. 실행 요약
            </div>
            <div className="rounded-2xl px-4 py-4" style={{ background: LEGACY_COLORS.s1 }}>
              <div className="mb-1 text-[11px]" style={{ color: LEGACY_COLORS.muted2 }}>
                처리 후 예상 재고
              </div>
              <div className="font-mono text-2xl font-black" style={{ color: LEGACY_COLORS.blue }}>
                {expectedQuantity == null ? "-" : formatNumber(expectedQuantity)}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div>처리 유형: {WAREHOUSE_MODES.find((entry) => entry.id === mode)?.label}</div>
                <div>변경 수량: {formatNumber(numericQty)}</div>
              </div>
            </div>
            {error ? (
              <div className="mt-3 rounded-2xl border px-3 py-2 text-sm" style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.25)", color: LEGACY_COLORS.red }}>
                {error}
              </div>
            ) : null}
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50"
              style={{ background: mode === "wh2d" ? LEGACY_COLORS.red : LEGACY_COLORS.blue, color: "#fff" }}
            >
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              {submitting ? "처리 중..." : mode === "wh2d" ? "출고 실행" : "입고 실행"}
            </button>
          </section>
        </div>
      </DesktopRightPanel>
    </div>
  );
}
