"use client";

import { ArrowLeft, Search } from "lucide-react";
import type { Employee } from "@/lib/api";
import { useDeptColorLookup } from "../DepartmentsContext";

/**
 * 로그인 1단계: 담당자 선택.
 * Round-9 (R9-4) 분리. OperatorLoginCard 에서 추출.
 */
export interface SelectStepProps {
  employees: Employee[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (e: Employee) => void;
  onBack: () => void;
}

export function SelectStep({
  employees,
  search,
  onSearch,
  onSelect,
  onBack,
}: SelectStepProps) {
  const getDeptColor = useDeptColorLookup();
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
              const color = getDeptColor(emp.department);
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
