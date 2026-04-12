"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function PinLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 8) return;
    setPin((p) => p + d);
    setError(null);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError("PIN은 4자리 이상이어야 합니다.");
      return;
    }
    try {
      setLoading(true);
      await api.verifyAdminPin(pin);
      onUnlocked();
    } catch {
      setError("비밀번호가 올바르지 않습니다.");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <div className="mb-1 text-2xl">🔒</div>
        <h2 className="text-lg font-bold text-slate-100">관리자 잠금</h2>
        <p className="mt-1 text-sm text-slate-400">관리자 PIN을 입력하세요</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-3">
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full transition ${
              i < pin.length ? "bg-blue-500" : "bg-slate-700"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-red-800/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Keypad */}
      <div className="grid w-full max-w-[260px] grid-cols-3 gap-3">
        {digits.map((d) => (
          <button
            key={d}
            onClick={() => {
              if (d === "⌫") handleDelete();
              else if (d !== ".") handleDigit(d);
            }}
            className={`flex h-14 items-center justify-center rounded-2xl text-lg font-semibold transition ${
              d === "⌫"
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                : d === "."
                  ? "cursor-default opacity-0"
                  : "bg-slate-800 text-slate-100 hover:bg-slate-700 active:scale-95"
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || pin.length < 4}
        className="w-full max-w-[260px] rounded-2xl bg-blue-600 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {loading ? "확인 중..." : "확인"}
      </button>
    </div>
  );
}
