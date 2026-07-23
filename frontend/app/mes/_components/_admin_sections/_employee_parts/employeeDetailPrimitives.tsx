import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";

export function DetailCardSlot({
  title,
  headerAccessory,
  children,
  className,
}: {
  title: string;
  headerAccessory?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[14px] border p-4 ${className ?? ""}`}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="text-[12px] font-black tracking-[0.12em]"
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {title}
        </span>
        {headerAccessory}
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
        className="text-[12px] font-bold tracking-[0.04em]"
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
      className="w-full rounded-[10px] border px-3 py-2 text-[14px] outline-none focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20"
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
  triggerAriaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  triggerAriaLabel?: string;
}) {
  return (
    <AppSelect
      value={value}
      onChange={onChange}
      options={options}
      size="md"
      triggerAriaLabel={triggerAriaLabel}
      triggerStyle={{ background: LEGACY_COLORS.s1 }}
    />
  );
}
