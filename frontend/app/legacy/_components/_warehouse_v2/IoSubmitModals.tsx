"use client";

import { CheckCircle2, XCircle } from "lucide-react";

interface ResultState {
  kind: "success" | "error";
  title: string;
  message: string;
}

interface Props {
  result: ResultState | null;
  onClose: () => void;
}

export function IoSubmitModals({ result, onClose }: Props) {
  if (!result) return null;

  const Icon = result.kind === "success" ? CheckCircle2 : XCircle;
  const iconColor = result.kind === "success" ? "text-emerald-600" : "text-red-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-6 w-6 ${iconColor}`} />
          <div>
            <h3 className="text-base font-black text-slate-900">{result.title}</h3>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{result.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-black text-white hover:bg-slate-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

export type { ResultState as IoSubmitResultState };
