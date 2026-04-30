"use client";

import { useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "./legacyUi";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "삭제"];

export function PinLock({ onUnlocked }: { onUnlocked: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const dots = useMemo(() => Array.from({ length: 4 }), []);

  const verify = async (pinToVerify: string) => {
    try {
      setLoading(true);
      await api.verifyAdminPin(pinToVerify);
      onUnlocked(pinToVerify);
    } catch {
      setError(true);
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (value: string) => {
    if (!value || loading || pin.length >= 4) return;
    const next = pin + value;
    setPin(next);
    setError(false);
    if (next.length === 4) void verify(next);
  };

  const removeDigit = () => {
    if (loading) return;
    setPin((current) => current.slice(0, -1));
    setError(false);
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center px-6 pt-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px]" style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.purple} 16%, transparent)`, color: LEGACY_COLORS.purple }}>
        <LockKeyhole className="h-8 w-8" />
      </div>

      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: LEGACY_COLORS.muted2 }}>
          Admin Access
        </div>
        <div className="mt-2 text-2xl font-black">관리자 잠금 해제</div>
        <div className="mt-2 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
          관리자 PIN을 입력하면 설정과 마스터 데이터를 수정할 수 있습니다.
        </div>
      </div>

      <div className="my-6 flex gap-3">
        {dots.map((_, index) => (
          <div
            key={index}
            className="h-4 w-4 rounded-full border-2 transition"
            style={{
              borderColor: error ? LEGACY_COLORS.red : LEGACY_COLORS.borderStrong,
              background: index < pin.length ? (loading ? LEGACY_COLORS.blue : LEGACY_COLORS.purple) : "transparent",
              transform: index < pin.length ? "scale(1.05)" : undefined,
            }}
          />
        ))}
      </div>

      {error ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 28%, transparent)`, background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`, color: LEGACY_COLORS.red }}
        >
          PIN이 올바르지 않습니다.
        </div>
      ) : loading ? (
        <div
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 28%, transparent)`, background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`, color: LEGACY_COLORS.blue }}
        >
          확인 중...
        </div>
      ) : (
        <div className="mb-4 h-[46px]" />
      )}

      <div className="grid w-full max-w-[320px] grid-cols-3 gap-3">
        {KEYS.map((key, index) =>
          key ? (
            <button
              key={`${key}-${index}`}
              onClick={() => (key === "삭제" ? removeDigit() : addDigit(key))}
              disabled={loading || (key !== "삭제" && pin.length >= 4)}
              className="rounded-[18px] border py-4 text-lg font-bold transition disabled:opacity-40"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.text,
              }}
            >
              {key}
            </button>
          ) : (
            <div key={`blank-${index}`} />
          ),
        )}
      </div>
    </div>
  );
}
