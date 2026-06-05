"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Delete, Loader2, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";

type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

type KeyDef =
  | { kind: "digit"; value: string }
  | { kind: "back" }
  | { kind: "empty" };

const KEYS: KeyDef[] = [
  { kind: "digit", value: "1" },
  { kind: "digit", value: "2" },
  { kind: "digit", value: "3" },
  { kind: "digit", value: "4" },
  { kind: "digit", value: "5" },
  { kind: "digit", value: "6" },
  { kind: "digit", value: "7" },
  { kind: "digit", value: "8" },
  { kind: "digit", value: "9" },
  { kind: "empty" },
  { kind: "digit", value: "0" },
  { kind: "back" },
];

const PIN_LENGTH = 4;

export function DesktopPinLock({
  onUnlocked,
  onCancel,
}: {
  onUnlocked: (pin: string) => void;
  onCancel?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);

  const dots = useMemo(() => Array.from({ length: PIN_LENGTH }), []);

  const verify = async (pinToVerify: string) => {
    try {
      setLoading(true);
      await api.verifyAdminPin(pinToVerify);
      onUnlocked(pinToVerify);
    } catch {
      setError(true);
      setPin("");
      setShakeNonce((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  const addDigit = (value: string) => {
    if (loading || pin.length >= PIN_LENGTH) return;
    const next = pin + value;
    setPin(next);
    setError(false);
    if (next.length === PIN_LENGTH) void verify(next);
  };

  const removeDigit = () => {
    if (loading) return;
    setPin((current) => current.slice(0, -1));
    setError(false);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6"
      style={{ background: LEGACY_COLORS.bg }}
    >
      {/* 배경 데코: 옅은 브랜드 그라데이션 + 큰 원형 blur 도형 (시선이 카드로 모이게) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 28% 22%, color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent) 0%, transparent 42%), radial-gradient(circle at 78% 82%, color-mix(in srgb, ${LEGACY_COLORS.blue} 6%, transparent) 0%, transparent 48%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-12 h-[320px] w-[320px] rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-8 h-[360px] w-[360px] rounded-full blur-3xl"
        style={{ background: `color-mix(in srgb, ${LEGACY_COLORS.cyan} 8%, transparent)` }}
      />

      {/* 카드 */}
      <div
        className="relative w-full max-w-[440px] rounded-[28px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
          padding: "40px 36px 32px",
        }}
      >
        {/* 잠금 아이콘 */}
        <div className="flex justify-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-[20px]"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
              color: LEGACY_COLORS.blue,
            }}
          >
            <LockKeyhole className="h-8 w-8" />
          </div>
        </div>

        {/* 라벨 + 타이틀 */}
        <div className="mt-5 text-center">
          <div
            className="text-[11px] font-bold uppercase tracking-[0.24em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            Admin Access
          </div>
          <div
            className="mt-2 text-[26px] font-black leading-tight"
            style={{ color: LEGACY_COLORS.text }}
          >
            관리자 인증
          </div>
          <div
            className="mt-2 text-sm"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            관리자 PIN을 입력하세요.
          </div>
        </div>

        {/* PIN 점 */}
        <div
          key={shakeNonce}
          className={`my-7 flex justify-center gap-4 ${error ? "animate-admin-pin-shake" : ""}`}
        >
          {dots.map((_, index) => {
            const filled = index < pin.length;
            return (
              <div
                key={index}
                className="h-[14px] w-[14px] rounded-full border-2 transition-all duration-150"
                style={{
                  borderColor: error
                    ? LEGACY_COLORS.red
                    : filled
                      ? LEGACY_COLORS.blue
                      : LEGACY_COLORS.borderStrong,
                  background: filled
                    ? error
                      ? LEGACY_COLORS.red
                      : LEGACY_COLORS.blue
                    : "transparent",
                  transform: filled ? "scale(1.06)" : "scale(1)",
                }}
              />
            );
          })}
        </div>

        {/* 상태 메시지 슬롯 (고정 높이로 layout 안정) */}
        <div className="mb-5 flex h-[44px] items-center justify-center">
          {error ? (
            <div
              className="rounded-[12px] border px-4 py-2 text-[13px] font-semibold"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 30%, transparent)`,
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 12%, transparent)`,
                color: LEGACY_COLORS.red,
              }}
            >
              PIN이 올바르지 않습니다. 다시 입력해 주세요.
            </div>
          ) : loading ? (
            <div
              className="flex items-center gap-2 rounded-[12px] border px-4 py-2 text-[13px] font-semibold"
              style={{
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, transparent)`,
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 10%, transparent)`,
                color: LEGACY_COLORS.blue,
              }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>PIN 확인 중…</span>
            </div>
          ) : null}
        </div>

        {/* 키패드 */}
        <div className="grid grid-cols-3 gap-2.5">
          {KEYS.map((key, index) => {
            if (key.kind === "empty") {
              return <div key={index} />;
            }
            const isDigit = key.kind === "digit";
            const isBack = key.kind === "back";
            const disabled =
              loading ||
              (isDigit && pin.length >= PIN_LENGTH) ||
              (isBack && pin.length === 0);
            const onClick = isDigit ? () => addDigit(key.value) : removeDigit;
            const label = isDigit ? (
              <span className="text-[22px] font-bold">{key.value}</span>
            ) : (
              <Delete className="h-5 w-5" strokeWidth={2.25} />
            );
            return (
              <button
                key={index}
                type="button"
                onClick={onClick}
                disabled={disabled}
                className="group relative flex h-[60px] items-center justify-center rounded-[16px] border outline-none transition-[transform,box-shadow,background] duration-150 hover:shadow-[0_6px_18px_rgba(45,70,106,0.10)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none disabled:active:scale-100"
                style={{
                  background: isDigit ? LEGACY_COLORS.s1 : LEGACY_COLORS.s2,
                  borderColor: LEGACY_COLORS.border,
                  color: LEGACY_COLORS.text,
                  "--tw-ring-color": `color-mix(in srgb, ${LEGACY_COLORS.blue} 50%, transparent)`,
                  "--tw-ring-offset-color": LEGACY_COLORS.s1,
                } as StyleWithVars}
              >
                {/* hover 시 옅은 blue 오버레이 (inline style hover 한계 우회) */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[16px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-0 group-disabled:opacity-0"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
                  }}
                />
                <span className="relative z-[1] flex items-center justify-center">
                  {label}
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
