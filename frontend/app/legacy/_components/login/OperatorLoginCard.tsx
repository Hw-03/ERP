"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UserCheck } from "lucide-react";
import { api, type DepartmentMaster, type Employee } from "@/lib/api";
import { setCurrentOperator } from "./useCurrentOperator";
import { useLoginEmployees } from "./useLoginEmployees";
import { PinStep } from "./PinStep";
import { SelectStep } from "./SelectStep";
import { useDepartments, useDeptColor } from "../DepartmentsContext";


interface OperatorLoginCardProps {
  onLogin: () => void;
}

type Step = "dept" | "select" | "pin";

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const [step, setStep] = useState<Step>("dept");
  // R8-5: employees fetch 는 별도 hook (mount 시 1회)
  const employees = useLoginEmployees();
  const deptMasters = useDepartments();
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
  const color = useDeptColor(dept.name);
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


