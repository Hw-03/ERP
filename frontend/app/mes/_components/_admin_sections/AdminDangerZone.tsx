"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { AdminPageHeader } from "./_admin_primitives";

type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

type Props = {
  pinForm: PinForm;
  setPinForm: (updater: (current: PinForm) => PinForm) => void;
  onChangePin: () => void;
};


export function AdminDangerZone({
  pinForm,
  setPinForm,
  onChangePin,
}: Props) {

  const canChangePin =
    pinForm.current_pin.trim() &&
    pinForm.new_pin.trim() &&
    pinForm.confirm_pin.trim() &&
    pinForm.new_pin === pinForm.confirm_pin;

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <AdminPageHeader
          icon={ShieldCheck}
          title="보안"
          description="관리자 PIN을 변경하여 계정 보안을 강화하세요."
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
          <div className="w-full max-w-[560px]">
            <div
              className="rounded-[16px] border p-5"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`,
                    color: LEGACY_COLORS.blue,
                  }}
                >
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black" style={{ color: LEGACY_COLORS.text }}>
                    관리자 PIN 변경
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    관리자 인증 PIN을 변경하여 계정 보안을 강화하세요.
                  </div>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <PinField
                  id="admin-current-pin"
                  label="현재 PIN"
                  value={pinForm.current_pin}
                  onChange={(v) => setPinForm((c) => ({ ...c, current_pin: v }))}
                />
                <PinField
                  id="admin-new-pin"
                  label="새 PIN"
                  value={pinForm.new_pin}
                  onChange={(v) => setPinForm((c) => ({ ...c, new_pin: v }))}
                />
                <PinField
                  id="admin-confirm-pin"
                  label="새 PIN 확인"
                  value={pinForm.confirm_pin}
                  onChange={(v) => setPinForm((c) => ({ ...c, confirm_pin: v }))}
                  error={
                    pinForm.confirm_pin.length > 0 && pinForm.new_pin !== pinForm.confirm_pin
                      ? "새 PIN과 일치하지 않습니다."
                      : undefined
                  }
                />
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={onChangePin}
                disabled={!canChangePin}
                className="mt-5"
              >
                PIN 변경
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PinField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[12px] font-bold tracking-[0.04em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0000"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-[10px] border px-3 py-2.5 text-[14px] tracking-widest outline-none focus-visible:border-[var(--c-blue)] focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/20"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: error ? LEGACY_COLORS.red : LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
      {error && (
        <div id={errorId} className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
      )}
    </div>
  );
}
