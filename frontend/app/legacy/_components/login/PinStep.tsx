"use client";

import { ArrowLeft, Loader2, UserCheck } from "lucide-react";
import type { Employee } from "@/lib/api";
import { useDeptColor } from "../DepartmentsContext";

/**
 * 로그인 2단계: PIN 입력.
 * Round-9 (R9-4) 분리. OperatorLoginCard 에서 추출.
 */
export interface PinStepProps {
  employee: Employee;
  pin: string;
  onPinChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error: string;
  loading: boolean;
}

export function PinStep({
  employee,
  pin,
  onPinChange,
  onSubmit,
  onBack,
  error,
  loading,
}: PinStepProps) {
  const canSubmit = pin.length > 0 && !loading;
  const color = useDeptColor(employee.department);

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
