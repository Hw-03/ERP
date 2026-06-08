import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";

export function DetailCardSlot({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="rounded-[14px] border p-4"
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div
        className="mb-3 text-[11px] font-black uppercase tracking-[0.18em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function FieldRow({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
        {required && (
          <span className="ml-1" style={{ color: LEGACY_COLORS.red }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none focus:border-[var(--c-blue)]"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
        color: LEGACY_COLORS.text,
      }}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <AppSelect
      value={value}
      onChange={onChange}
      options={options}
      size="md"
      triggerStyle={{ background: LEGACY_COLORS.s1 }}
    />
  );
}
