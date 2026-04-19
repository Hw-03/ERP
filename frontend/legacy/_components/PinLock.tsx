"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "./legacyUi";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PinLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const dots = useMemo(() => Array.from({ length: 4 }), []);

  const addDigit = (value: string) => {
    if (!value || loading) return;
    setPin((current) => (current.length >= 8 ? current : current + value));
    setError(false);
  };

  const removeDigit = () => {
    if (loading) return;
    setPin((current) => current.slice(0, -1));
    setError(false);
  };

  const submit = async () => {
    if (pin.length < 4) {
      setError(true);
      return;
    }
    try {
      setLoading(true);
      await api.verifyAdminPin(pin);
      onUnlocked();
    } catch {
      setError(true);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center px-6 pt-5">
      <div className="mb-6 text-center">
        <div className="mb-2 text-3xl">🔐</div>
        <div className="text-lg font-black">관리자 잠금</div>
        <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          관리자 PIN을 입력해 주세요.
        </div>
      </div>

      <div className="mb-6 flex gap-[14px]">
        {dots.map((_, index) => (
          <div
            key={index}
            className="h-[15px] w-[15px] rounded-full border-2 transition"
            style={{
              borderColor: error ? LEGACY_COLORS.red : LEGACY_COLORS.border,
              background: index < pin.length ? LEGACY_COLORS.purple : "transparent",
              transform: index < pin.length ? "scale(1.1)" : undefined,
            }}
          />
        ))}
      </div>

      {error ? (
        <div
          className="mb-4 rounded-xl border px-4 py-2 text-sm"
          style={{
            borderColor: "rgba(242,95,92,.35)",
            background: "rgba(242,95,92,.12)",
            color: LEGACY_COLORS.red,
          }}
        >
          PIN이 올바르지 않습니다.
        </div>
      ) : null}

      <div className="grid w-full max-w-[280px] grid-cols-3 gap-[9px]">
        {KEYS.map((key, index) =>
          key ? (
            <button
              key={`${key}-${index}`}
              onClick={() => (key === "⌫" ? removeDigit() : addDigit(key))}
              className="rounded-[14px] border py-4 text-xl font-bold"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
                fontFamily: 'Menlo, "Courier New", monospace',
              }}
            >
              {key}
            </button>
          ) : (
            <div key={`blank-${index}`} />
          ),
        )}
      </div>

      <button
        onClick={submit}
        disabled={loading || pin.length < 4}
        className="mt-5 w-full max-w-[280px] rounded-xl py-[13px] text-sm font-bold text-white disabled:opacity-50"
        style={{ background: LEGACY_COLORS.blue }}
      >
        {loading ? "확인 중..." : "확인"}
      </button>
    </div>
  );
}
