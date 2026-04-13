"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type Department, type Employee, type Item, type ShipPackage } from "@/lib/api";
import { BottomSheet } from "./BottomSheet";
import type { ToastState } from "./Toast";
import {
  DEPARTMENT_ICONS,
  LEGACY_COLORS,
  LEGACY_SHADOWS,
  buildItemSearchLabel,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeDepartment,
} from "./legacyUi";

const DEPARTMENTS = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

function departmentToApiValue(label: (typeof DEPARTMENTS)[number]) {
  const map: Record<(typeof DEPARTMENTS)[number], Department> = {
    튜브: "?쒕툕" as Department,
    고압: "怨좎븬" as Department,
    진공: "吏꾧났" as Department,
    튜닝: "?쒕떇" as Department,
    조립: "議곕┰" as Department,
    출하: "異쒗븯" as Department,
  };
  return map[label];
}

export function DeptIOTab({
  showToast,
  onOpenHistory,
}: {
  showToast: (toast: ToastState) => void;
  onOpenHistory: () => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState<(typeof DEPARTMENTS)[number]>("조립");
  const [mode, setMode] = useState<"in" | "out">("out");
  const [employeeId, setEmployeeId] = useState("");
  const [usePackage, setUsePackage] = useState(false);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000 }),
      api.getShipPackages(),
    ]).then(([nextEmployees, nextItems, nextPackages]) => {
      setEmployees(nextEmployees);
      setItems(nextItems);
      setPackages(nextPackages);
      setLoading(false);
    });
  }, []);

  const selectedDepartmentValue = departmentToApiValue(department);
  const visibleEmployees = useMemo(
    () => employees.filter((employee) => employee.department === selectedDepartmentValue),
    [employees, selectedDepartmentValue],
  );
  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items.slice(0, 40);
    return items
      .filter((item) => `${item.item_name} ${item.item_code} ${item.barcode ?? ""}`.toLowerCase().includes(keyword))
      .slice(0, 50);
  }, [items, search]);

  const selectedEmployee = employees.find((employee) => employee.employee_id === employeeId) ?? null;
  const selectedItem = items.find((item) => item.item_id === itemId) ?? null;
  const selectedPackage = packages.find((pkg) => pkg.package_id === packageId) ?? null;

  function resetForm() {
    setSearch("");
    setItemId("");
    setPackageId("");
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
    if (usePackage && !packageId) {
      setError("출하 패키지를 선택해 주세요.");
      return false;
    }
    if (!usePackage && !itemId) {
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
    if (!selectedEmployee) return;
    try {
      setSubmitting(true);
      const producedBy = `${selectedEmployee.name} (${department})`;
      if (usePackage && selectedPackage) {
        await api.shipPackage({
          package_id: selectedPackage.package_id,
          quantity: Number(qty),
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: note || undefined,
        });
      } else if (selectedItem) {
        const payload = {
          item_id: selectedItem.item_id,
          quantity: Number(qty),
          reference_no: referenceNo || undefined,
          produced_by: producedBy,
          notes: note || undefined,
        };
        if (mode === "in") {
          await api.receiveInventory(payload);
        } else {
          await api.shipInventory(payload);
        }
      }
      setConfirmOpen(false);
      resetForm();
      showToast({
        message: usePackage ? "패키지 출하가 완료되었습니다." : mode === "in" ? "부서 입고가 완료되었습니다." : "부서 출고가 완료되었습니다.",
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
    return <div className="py-10 text-center text-sm" style={{ color: LEGACY_COLORS.muted2 }}>데이터를 불러오는 중...</div>;
  }

  return (
    <div className="pb-6">
      {/* 이력 확인 버튼 */}
      <button
        onClick={onOpenHistory}
        className="mb-5 flex w-full items-center justify-center rounded-2xl border px-4 py-4 text-sm font-semibold"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.muted2,
          boxShadow: LEGACY_SHADOWS.sm,
        }}
      >
        📋 입출고 내역 확인
      </button>

      {/* 부서 선택 */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
        부서 선택
      </div>
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {DEPARTMENTS.map((entry) => {
          const active = entry === department;
          return (
            <button
              key={entry}
              onClick={() => {
                setDepartment(entry);
                setEmployeeId("");
              }}
              className="shrink-0 rounded-2xl border px-3 py-3"
              style={{
                background: active ? "rgba(79,142,247,.12)" : LEGACY_COLORS.s2,
                borderColor: active ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
                minWidth: 68,
                boxShadow: active ? LEGACY_SHADOWS.md : LEGACY_SHADOWS.sm,
              }}
            >
              <div className="text-xl">{DEPARTMENT_ICONS[entry]}</div>
              <div className="mt-1 text-xs font-bold" style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.text }}>
                {entry}
              </div>
            </button>
          );
        })}
      </div>

      {/* 담당 직원 */}
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
        담당 직원
      </div>
      <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
        {visibleEmployees.map((employee) => {
          const active = employee.employee_id === employeeId;
          return (
            <button
              key={employee.employee_id}
              onClick={() => setEmployeeId(employee.employee_id)}
              className="shrink-0 px-1"
            >
              <div className="mb-1.5 flex justify-center">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border-[2.5px] text-base font-black text-white"
                  style={{
                    background: employeeColor(employee.department),
                    borderColor: active ? LEGACY_COLORS.blue : "transparent",
                    boxShadow: active ? `0 0 0 3px rgba(79,142,247,.25), ${LEGACY_SHADOWS.md}` : LEGACY_SHADOWS.sm,
                    opacity: employeeId && !active ? 0.35 : 1,
                  }}
                >
                  {firstEmployeeLetter(employee.name)}
                </div>
              </div>
              <div
                className="max-w-[52px] truncate text-xs font-semibold"
                style={{ color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2 }}
              >
                {employee.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* 입고 / 출고 모드 */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            setMode("in");
            setUsePackage(false);
            resetForm();
          }}
          className="rounded-2xl border px-3 py-4 text-sm font-bold"
          style={{
            background: mode === "in" ? "rgba(31,209,122,.15)" : LEGACY_COLORS.s2,
            borderColor: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.border,
            color: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.text,
            boxShadow: mode === "in" ? LEGACY_SHADOWS.md : LEGACY_SHADOWS.sm,
          }}
        >
          부서 입고
        </button>
        <button
          onClick={() => {
            setMode("out");
            resetForm();
          }}
          className="rounded-2xl border px-3 py-4 text-sm font-bold"
          style={{
            background: mode === "out" ? "rgba(242,95,92,.15)" : LEGACY_COLORS.s2,
            borderColor: mode === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.border,
            color: mode === "out" ? LEGACY_COLORS.red : LEGACY_COLORS.text,
            boxShadow: mode === "out" ? LEGACY_SHADOWS.md : LEGACY_SHADOWS.sm,
          }}
        >
          부서 출고
        </button>
      </div>

      {/* 개별 품목 / 출하 패키지 토글 */}
      {mode === "out" ? (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              setUsePackage(false);
              resetForm();
            }}
            className="rounded-xl border px-4 py-2 text-xs font-semibold"
            style={{
              background: !usePackage ? LEGACY_COLORS.blue : LEGACY_COLORS.s2,
              borderColor: !usePackage ? LEGACY_COLORS.blue : LEGACY_COLORS.border,
              color: !usePackage ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            개별 품목
          </button>
          <button
            onClick={() => {
              setUsePackage(true);
              resetForm();
            }}
            className="rounded-xl border px-4 py-2 text-xs font-semibold"
            style={{
              background: usePackage ? LEGACY_COLORS.purple : LEGACY_COLORS.s2,
              borderColor: usePackage ? LEGACY_COLORS.purple : LEGACY_COLORS.border,
              color: usePackage ? "#fff" : LEGACY_COLORS.muted2,
            }}
          >
            출하 패키지
          </button>
        </div>
      ) : null}

      {/* 패키지 선택 or 품목 검색 */}
      {usePackage ? (
        <div className="mb-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
            출하 패키지
          </div>
          <select
            value={packageId}
            onChange={(event) => setPackageId(event.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          >
            <option value="">패키지 선택</option>
            {packages.map((pkg) => (
              <option key={pkg.package_id} value={pkg.package_id}>
                {pkg.package_code} · {pkg.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div
            className="mb-3 flex items-center gap-2 rounded-xl border px-4"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <span>🔍</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setItemId("");
              }}
              placeholder="품명 검색.."
              className="w-full bg-transparent py-3 text-sm outline-none"
              style={{ color: LEGACY_COLORS.text }}
            />
          </div>

          <div
            className="mb-5 max-h-[220px] overflow-y-auto rounded-2xl border"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, boxShadow: LEGACY_SHADOWS.sm }}
          >
            {visibleItems.map((item, index) => (
              <button
                key={item.item_id}
                onClick={() => {
                  setItemId(item.item_id);
                  setSearch(buildItemSearchLabel(item));
                }}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                style={{ borderBottom: index === visibleItems.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}` }}
              >
                <div>
                  <div className="text-sm font-semibold">{item.item_name}</div>
                  <div className="mt-0.5 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {item.item_code}
                  </div>
                </div>
                <div className="font-mono text-sm font-bold" style={{ color: LEGACY_COLORS.cyan }}>
                  {formatNumber(item.quantity)} {item.unit}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 수량 */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
          수량
        </div>
        <input
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          inputMode="numeric"
          className="mb-2 w-full rounded-xl border px-4 py-3 text-center text-2xl font-bold outline-none"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
            fontFamily: 'Menlo, "Courier New", monospace',
          }}
        />
        <div className="grid grid-cols-4 gap-2">
          {[-10, -1, 1, 10].map((delta) => (
            <button
              key={delta}
              onClick={() => setQty((current) => String(Math.max(1, Number(current || 0) + delta)))}
              className="rounded-xl py-3 text-sm font-bold"
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

      {/* 비고 */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
          비고
        </div>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="메모 (선택)"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      {/* 참조번호 */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: LEGACY_COLORS.muted }}>
          참조번호
        </div>
        <input
          value={referenceNo}
          onChange={(event) => setReferenceNo(event.target.value)}
          placeholder="예: DIO-240412"
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
        />
      </div>

      {/* 에러 */}
      {error ? (
        <div
          className="mb-4 rounded-xl border px-4 py-3 text-sm"
          style={{ background: "rgba(242,95,92,.12)", borderColor: "rgba(242,95,92,.3)", color: LEGACY_COLORS.red }}
        >
          {error}
        </div>
      ) : null}

      {/* 처리 버튼 */}
      <button
        onClick={() => {
          if (validate()) setConfirmOpen(true);
        }}
        className="w-full rounded-2xl py-4 text-base font-bold"
        style={{
          background: mode === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
          color: mode === "in" ? "#000" : "#fff",
          boxShadow: LEGACY_SHADOWS.md,
        }}
      >
        {usePackage ? "패키지 출하" : mode === "in" ? "부서 입고" : "부서 출고"}
      </button>

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="부서 처리 확인">
        <div className="space-y-2 px-5 pb-8">
          {[
            ["부서", department],
            ["직원", selectedEmployee ? `${selectedEmployee.name} (${normalizeDepartment(selectedEmployee.department)})` : "-"],
            ["대상", usePackage ? selectedPackage?.name || "-" : selectedItem?.item_name || "-"],
            ["수량", formatNumber(qty)],
            ["참조번호", referenceNo || "-"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: LEGACY_COLORS.s2 }}
            >
              <div className="text-xs font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
              <div className="text-right text-sm font-medium">{value}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 pt-3">
            <button
              onClick={() => setConfirmOpen(false)}
              className="rounded-xl border py-4 text-sm font-semibold"
              style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            >
              취소
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-xl py-4 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: LEGACY_COLORS.blue, boxShadow: LEGACY_SHADOWS.sm }}
            >
              {submitting ? "처리 중..." : "확인"}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
