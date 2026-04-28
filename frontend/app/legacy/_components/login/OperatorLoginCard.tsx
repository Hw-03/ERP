"use client";

/**
 * 작업자 식별용 PIN 로그인 카드 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, UserCheck } from "lucide-react";
import { api, type Employee } from "@/lib/api";
import { setCurrentOperator } from "./useCurrentOperator";

interface OperatorLoginCardProps {
  onLogin: () => void;
}

type Step = "select" | "pin";

export function OperatorLoginCard({ onLogin }: OperatorLoginCardProps) {
  const [step, setStep] = useState<Step>("select");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getEmployees({ activeOnly: true }).then(setEmployees).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        (e.department).toLowerCase().includes(q),
    );
  }, [employees, search]);

  const handleSelect = useCallback((emp: Employee) => {
    setSelected(emp);
    setPin("");
    setError("");
    setStep("pin");
  }, []);

  const handleBack = useCallback(() => {
    setStep("select");
    setSelected(null);
    setPin("");
    setError("");
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (!selected || pin.length === 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const emp = await api.verifyEmployeePin(selected.employee_id, pin);
      setCurrentOperator({
        employee_id: emp.employee_id,
        name: emp.name,
        department: emp.department,
        level: emp.level,
        employee_code: emp.employee_code,
      });
      onLogin();
    } catch {
      setError("PIN이 올바르지 않습니다.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [selected, pin, loading, onLogin]);

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: step === "select" ? "560px" : "420px", padding: "0 16px" }}>
      <div
        className="relative w-full rounded-[24px] border p-8"
        style={{
          background: "var(--c-s1)",
          borderColor: "var(--c-border)",
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {step === "select" ? (
          <SelectStep
            employees={filtered}
            search={search}
            onSearch={setSearch}
            onSelect={handleSelect}
          />
        ) : (
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

/* ── 1단계: 담당자 선택 ─────────────────────────────────────────────────── */

function SelectStep({
  employees,
  search,
  onSearch,
  onSelect,
}: {
  employees: Employee[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (e: Employee) => void;
}) {
  return (
    <>
      <div className="mb-5">
        <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.18em]" style={{ color: "var(--c-blue)" }}>
          {"// OPERATOR SELECT"}
        </p>
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>
          담당자를 선택하세요
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
          placeholder="이름, 코드, 부서 검색"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--c-muted)]"
          style={{ color: "var(--c-text)" }}
          autoFocus
        />
      </div>

      {/* 직원 목록 */}
      <div className="max-h-[340px] overflow-y-auto rounded-[14px] border" style={{ borderColor: "var(--c-border)" }}>
        {employees.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>
            {search ? "검색 결과가 없습니다." : "활성 직원이 없습니다."}
          </div>
        ) : (
          employees.map((emp, i) => (
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
                style={{ background: "var(--c-blue)", color: "#fff", opacity: 0.85 }}
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
          ))
        )}
      </div>

      <p className="mt-5 text-center text-xs" style={{ color: "var(--c-muted)" }}>
        PIN은 작업자 식별 용도입니다 · © 2026 DEXCOWIN
      </p>
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
            style={{ background: "var(--c-blue)", color: "#fff" }}
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

      <p className="mt-5 text-center text-xs" style={{ color: "var(--c-muted)" }}>
        PIN은 작업자 식별 용도입니다 · © 2026 DEXCOWIN
      </p>
    </>
  );
}
