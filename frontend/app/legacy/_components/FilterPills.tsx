"use client";

export function FilterPills({
  options,
  value,
  onChange,
  colorActive = "bg-blue-600 border-blue-500 text-white",
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  colorActive?: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
            opt.value === value
              ? colorActive
              : "border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
