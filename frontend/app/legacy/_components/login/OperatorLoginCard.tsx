"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UserCheck } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { setCurrentOperator } from "./useCurrentOperator";
import { employeeColor } from "../legacyUi";

const DEPT_ORDER = ["튜브", "고압", "진공", "튜닝", "조립", "AS", "영업", "연구", "기타"];

interface OperatorLoginCardProps {
  onLogin: () => void;
}

type Step = "dept" | "select" | "pin";

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const [step, setStep] = useState<Step>("dept");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getEmployees({ activeOnly: true }).then(setEmployees).catch(() => {});
  }, []);

  const departments = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of employees) {
      if (e.department && !seen.has(e.department)) {
        seen.add(e.department);
        result.push(e.department);
      }
    }
    return result.sort((a, b) => {
      const ai = DEPT_ORDER.indexOf(a);
      const bi = DEPT_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [employees]);

  const filtered = useMemo(() => {
    let list = selectedDept ? employees.filter((e) => e.department === selectedDept) : employees;
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    );
  }, [employees, selectedDept, search]);

  const handleSelectDept = useCallback((dept: string) => {
    setSelectedDept(dept);
    setSearch("");
    setStep("select");
  }, []);

  const handleSelect = useCallback((emp: Employee) => {
    setSelected(emp);
    setPin("");
    setError("");
    setStep("pin");
  }, []);

  const handleBack = useCallback(() => {
    if (step === "pin") {
      setStep("select");
      setPin("");
      setError("");
    } else {
      setStep("dept");
      setSelectedDept(null);
      setSearch("");
      setSelected(null);
    }
  }, [step]);

  const handlePinSubmit = useCallback(async () => {
    if (!selected || pin.length === 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const emp = await api.verifyEmployeePin(selected.employee_id, pin);
      const op = {
        employee_id: emp.employee_id,
        name: emp.name,
        department: emp.department,
        level: emp.level,
        employee_code: emp.employee_code,
        warehouse_role: emp.warehouse_role ?? "none",
      };
      try {
        const session = await api.getAppSession();
        setCurrentOperator(op, session.boot_id);
      } catch {
        setCurrentOperator(op);
      }
      onLogin();
    } catch {
      setError("PIN이 올바르지 않습니다.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [selected, pin, loading, onLogin]);

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: "700px", padding: "0 16px" }}>
      <div
        className="relative w-full rounded-[24px] border p-8"
        style={{
          background: "var(--c-s1)",
          borderColor: "var(--c-border)",
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {step === "dept" && (
          <DeptStep departments={departments} onSelect={handleSelectDept} />
        )}
        {step === "select" && (
          <SelectStep
            employees={filtered}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelect}
            onBack={handleBack}
          />
        )}
        {step === "pin" && (
          <PinStep
            employee={selected!}
            pin={pin}
            onPinChange={setPin}
            onSubmit={handlePinSubmit}
            onBack={handleBack}
            error={error}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}

/* ── 부서 버튼 ────────────────────────────────────────────────────────────── */

function DeptButton({ dept, onSelect }: { dept: string; onSelect: (d: string) => void }) {
  const color = employeeColor(dept);
  return (
    <button
      onClick={() => onSelect(dept)}
      className="flex w-full items-center justify-center rounded-[16px] border py-7 text-base font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}
    >
      {dept}
    </button>
  );
}

/* ── 0단계: 부서 선택 ─────────────────────────────────────────────────────── */

function DeptStep({
  departments,
  onSelect,
}: {
  departments: string[];
  onSelect: (dept: string) => void;
}) {
  const top = departments.slice(0, 5);
  const bottom = departments.slice(5);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>
          로그인
        </h1>
      </div>

      {departments.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>
          등록된 부서가 없습니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3 mb-3">
            {top.map((dept) => (
              <DeptButton key={dept} dept={dept} onSelect={onSelect} />
            ))}
          </div>
          {bottom.length > 0 && (
            <div className="flex gap-3 justify-center">
              {bottom.map((dept) => (
                <div key={dept} style={{ flex: "0 0 calc((100% - 48px) / 5)" }}>
                  <DeptButton dept={dept} onSelect={onSelect} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── 1단계: 담당자 선택 ─────────────────────────────────────────────────────── */

function SelectStep({
  employees,
  search,
  onSearch,
  onSelect,
  onBack,
}: {
  employees: Employee[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (e: Employee) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="mb-5">
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--c-muted)" }}
        >
          <ArrowLeft size={13} />
          부서 다시 선택
        </button>
        <h1 className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>
          로그인
        </h1>
      </div>

      {/* 검색 */}
      <div
        className="mb-4 flex items-center gap-2 rounded-[12px] border px-3 py-2.5 transition-colors focus-within:border-[var(--c-blue)]"
        style={{ background: "var(--c-s2)", borderColor: "var(--c-border)" }}
      >
        <Search size={14} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="이름, 코드 검색"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--c-muted)]"
          style={{ color: "var(--c-text)" }}
          autoFocus
        />
      </div>

      {/* 직원 목록 */}
      <div className="max-h-[480px] overflow-y-auto rounded-[14px] border" style={{ borderColor: "var(--c-border)" }}>
        {employees.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>
            {search ? "검색 결과가 없습니다." : "활성 직원이 없습니다."}
          </div>
        ) : (
          employees.map((emp, i) => {
            const color = employeeColor(emp.department);
            return (
              <button
                key={emp.employee_id}
                onClick={() => onSelect(emp)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--c-s2)]"
                style={{
                  borderBottom: i < employees.length - 1 ? "1px solid var(--c-border)" : "none",
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
                >
                  {emp.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--c-text)" }}>
                    {emp.name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--c-muted)" }}>
                    {emp.department} · {emp.employee_code}
                  </div>
                </div>
                <ArrowLeft size={14} style={{ color: "var(--c-muted)", transform: "rotate(180deg)" }} />
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/* ── 2단계: PIN 입력 ──────────────────────────────────────────────────────── */

function PinStep({
  employee,
  pin,
  onPinChange,
  onSubmit,
  onBack,
  error,
  loading,
}: {
  employee: Employee;
  pin: string;
  onPinChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}) {
  const canSubmit = pin.length > 0 && !loading;
  const color = employeeColor(employee.department);

  return (
    <>
      {/* 헤더 */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--c-muted)" }}
        >
          <ArrowLeft size={13} />
          담당자 다시 선택
        </button>

        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
            style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
          >
            {employee.name.charAt(0)}
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: "var(--c-text)" }}>
              {employee.name}
            </div>
            <div className="text-xs" style={{ color: "var(--c-muted)" }}>
              {employee.department} · {employee.employee_code}
            </div>
          </div>
        </div>
      </div>

      {/* PIN 입력 */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--c-muted)" }}>
          PIN
        </label>
        <div
          className="flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 transition-colors focus-within:border-[var(--c-blue)]"
          style={{ background: "var(--c-s2)", borderColor: error ? "var(--c-red, #f87171)" : "var(--c-border)" }}
        >
          <UserCheck size={15} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
          <input
            type="password"
            inputMode="numeric"
            maxLength={20}
            placeholder="PIN 입력"
            value={pin}
            onChange={(e) => onPinChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void onSubmit(); }}
            className="min-w-0 flex-1 bg-transparent text-sm tracking-widest outline-none placeholder:text-[var(--c-muted)]"
            style={{ color: "var(--c-text)" }}
            autoFocus
          />
        </div>
        {error && (
          <p className="mt-1.5 text-xs" style={{ color: "var(--c-red, #f87171)" }}>
            {error}
          </p>
        )}
      </div>

      <button
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-semibold text-white transition-opacity"
        style={{
          background: "var(--c-blue)",
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            <UserCheck size={15} />
            확인
          </>
        )}
      </button>
    </>
  );
}
