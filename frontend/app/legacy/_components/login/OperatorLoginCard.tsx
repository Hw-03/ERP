"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UserCheck } from "lucide-react";
import { api, type DepartmentMaster, type Employee } from "@/lib/api";
import { setCurrentOperator } from "./useCurrentOperator";
import { employeeColor } from "../legacyUi";


interface OperatorLoginCardProps {
  onLogin: () => void;
}

type Step = "dept" | "select" | "pin";

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const [step, setStep] = useState<Step>("dept");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deptMasters, setDeptMasters] = useState<DepartmentMaster[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getDepartments({ isActive: true }),
    ]).then(([emps, depts]) => {
      setEmployees(emps);
      setDeptMasters(depts);
    }).catch(() => {});
  }, []);

  // 브라우저 뒤로가기/앞으로가기로 단계 이동 지원
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 현재 진입 시점을 dept 단계로 표시
    window.history.replaceState({ loginStep: "dept" }, "");

    const handlePopState = (e: PopStateEvent) => {
      const target = e.state?.loginStep as Step | undefined;
      if (target === "dept" || target === "select" || target === "pin") {
        setStep(target);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
    if (typeof window !== "undefined") {
      window.history.pushState({ loginStep: "select" }, "");
    }
  }, []);

  const handleSelect = useCallback((emp: Employee) => {
    setSelected(emp);
    setPin("");
    setError("");
    setStep("pin");
    if (typeof window !== "undefined") {
      window.history.pushState({ loginStep: "pin" }, "");
    }
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.back();
    }
  }, []);

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
    <div className="relative mx-auto w-full" style={{ maxWidth: "1100px", padding: "0 16px" }}>
      <div
        className="relative flex w-full flex-col rounded-[28px] border p-12"
        style={{
          background: "var(--c-s1)",
          borderColor: "var(--c-border)",
          boxShadow: "var(--c-card-shadow)",
          minHeight: "560px",
        }}
      >
        {step === "dept" && (
          <DeptStep departments={deptMasters} onSelect={handleSelectDept} />
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

function DeptButton({ dept, onSelect }: { dept: DepartmentMaster; onSelect: (name: string) => void }) {
  const color = dept.color_hex ?? employeeColor(dept.name);
  return (
    <button
      onClick={() => onSelect(dept.name)}
      className="flex w-full items-center justify-center rounded-[20px] border py-8 text-2xl font-bold transition-all active:scale-[0.98]"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 22%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 12%, transparent)`;
      }}
    >
      {dept.name}
    </button>
  );
}

/* ── 0단계: 부서 선택 ─────────────────────────────────────────────────────── */

function DeptStep({
  departments,
  onSelect,
}: {
  departments: DepartmentMaster[];
  onSelect: (dept: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      {/* 상단 여백 + 로그인 (상단 공간 약간 위쪽) */}
      <div className="flex flex-1 items-start pt-12">
        <h1 className="text-3xl font-bold" style={{ color: "var(--c-text)" }}>
          로그인
        </h1>
      </div>

      {/* 부서 버튼 — 5열 그리드, 자동 줄바꿈 */}
      {departments.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--c-muted)" }}>
          등록된 부서가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-4">
          {departments.map((dept) => (
            <DeptButton key={dept.id} dept={dept} onSelect={onSelect} />
          ))}
        </div>
      )}

      {/* 하단 여백 */}
      <div className="flex-1" />
    </div>
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
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--c-muted)" }}
        >
          <ArrowLeft size={14} />
          부서 다시 선택
        </button>
        <h1 className="text-3xl font-bold" style={{ color: "var(--c-text)" }}>
          로그인
        </h1>
      </div>

      {/* 검색 */}
      <div
        className="mb-5 flex items-center gap-2.5 rounded-[14px] border px-4 py-3.5 transition-colors focus-within:border-[var(--c-blue)]"
        style={{ background: "var(--c-s2)", borderColor: "var(--c-border)" }}
      >
        <Search size={16} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
        <input
          type="text"
          placeholder="이름, 코드 검색"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--c-muted)]"
          style={{ color: "var(--c-text)" }}
          autoFocus
        />
      </div>

      {/* 직원 그리드 */}
      {employees.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center rounded-[16px] border py-16 text-center text-sm"
          style={{ borderColor: "var(--c-border)", color: "var(--c-muted)" }}
        >
          {search ? "검색 결과가 없습니다." : "활성 직원이 없습니다."}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          <div className="grid grid-cols-5 gap-4">
            {employees.map((emp) => {
              const color = employeeColor(emp.department);
              return (
                <button
                  key={emp.employee_id}
                  onClick={() => onSelect(emp)}
                  className="group flex flex-col items-center rounded-[18px] border p-5 transition-all hover:scale-[1.02] hover:border-[var(--c-blue)] hover:shadow-md active:scale-[0.98]"
                  style={{
                    background: "var(--c-s1)",
                    borderColor: "var(--c-border)",
                  }}
                >
                  <div
                    className="mb-3 flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold transition-transform"
                    style={{
                      background: `color-mix(in srgb, ${color} 18%, transparent)`,
                      color,
                    }}
                  >
                    {emp.name.charAt(0)}
                  </div>
                  <div
                    className="w-full truncate text-center text-base font-semibold"
                    style={{ color: "var(--c-text)" }}
                  >
                    {emp.name}
                  </div>
                  <div
                    className="mt-1 w-full truncate text-center text-xs"
                    style={{ color: "var(--c-muted)" }}
                  >
                    {emp.employee_code}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
      <div className="mb-8">
        <button
          onClick={onBack}
          className="mb-5 flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--c-muted)" }}
        >
          <ArrowLeft size={14} />
          담당자 다시 선택
        </button>

        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold"
            style={{ background: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
          >
            {employee.name.charAt(0)}
          </div>
          <div>
            <div className="text-2xl font-bold" style={{ color: "var(--c-text)" }}>
              {employee.name}
            </div>
            <div className="text-sm" style={{ color: "var(--c-muted)" }}>
              {employee.department} · {employee.employee_code}
            </div>
          </div>
        </div>
      </div>

      {/* PIN 입력 */}
      <div className="mb-6">
        <label
          className="mb-2 block text-sm font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--c-muted)" }}
        >
          PIN
        </label>
        <div
          className="flex items-center gap-3 rounded-[16px] border px-5 py-5 transition-colors focus-within:border-[var(--c-blue)]"
          style={{ background: "var(--c-s2)", borderColor: error ? "var(--c-red, #f87171)" : "var(--c-border)" }}
        >
          <UserCheck size={18} style={{ color: "var(--c-muted)", flexShrink: 0 }} />
          <input
            type="password"
            inputMode="numeric"
            maxLength={20}
            placeholder="PIN 입력"
            value={pin}
            onChange={(e) => onPinChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void onSubmit(); }}
            className="min-w-0 flex-1 bg-transparent text-base tracking-widest outline-none placeholder:text-[var(--c-muted)]"
            style={{ color: "var(--c-text)" }}
            autoFocus
          />
        </div>
        {error && (
          <p className="mt-2 text-sm" style={{ color: "var(--c-red, #f87171)" }}>
            {error}
          </p>
        )}
      </div>

      <button
        onClick={() => void onSubmit()}
        disabled={!canSubmit}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-[16px] py-5 text-base font-semibold text-white transition-opacity"
        style={{
          background: "var(--c-blue)",
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <>
            <UserCheck size={18} />
            확인
          </>
        )}
      </button>
    </>
  );
}
