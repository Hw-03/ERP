"use client";

import type { IoSubType, IoWorkType } from "./types";
import { IO_SUB_TYPES, IO_WORK_TYPES } from "./ioWorkType";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  onWorkTypeChange: (workType: IoWorkType) => void;
  onSubTypeChange: (subType: IoSubType) => void;
}

export function IoWorkTypeStep({ workType, subType, onWorkTypeChange, onSubTypeChange }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">작업 선택</h2>
          <p className="text-xs font-medium text-slate-500">작업 유형은 5개만 사용합니다.</p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {IO_WORK_TYPES.map((row) => {
          const Icon = row.icon;
          const active = workType === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onWorkTypeChange(row.id)}
              className={[
                "flex min-h-24 flex-col items-start gap-2 rounded-md border p-3 text-left transition",
                active
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-black">{row.label}</span>
              <span className="text-xs font-semibold leading-5 text-slate-500">{row.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {IO_SUB_TYPES[workType].map((row) => {
          const active = subType === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSubTypeChange(row.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-black transition",
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
              ].join(" ")}
              title={row.description}
            >
              {row.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
