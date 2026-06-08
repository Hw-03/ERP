"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

export function DeptAddForm({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = Boolean(value.trim());
  return (
    <form
      className="flex max-w-[420px] flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div>
        <label htmlFor="dept-add-name" className="mb-1 block text-[12px] font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
          부서명 <span style={{ color: LEGACY_COLORS.red }}>*</span>
        </label>
        <input
          id="dept-add-name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="예: 설계"
          className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] outline-none focus:border-[var(--c-blue)]"
          style={{
            background: LEGACY_COLORS.s1,
            borderColor: LEGACY_COLORS.border,
            color: LEGACY_COLORS.text,
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-[12px] py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        style={{ background: LEGACY_COLORS.blue }}
      >
        부서 추가
      </button>
    </form>
  );
}
