"use client";

import { DatabaseBackup, KeyRound } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";

type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

type Props = {
  pinForm: PinForm;
  setPinForm: (updater: (current: PinForm) => PinForm) => void;
  resetPin: string;
  setResetPin: (v: string) => void;
  onChangePin: () => void;
  onResetDatabase: () => void;
};

export function AdminDangerZone({
  pinForm,
  setPinForm,
  resetPin,
  setResetPin,
  onChangePin,
  onResetDatabase,
}: Props) {
  return (
    <div className="overflow-y-auto">
      <div className="grid gap-4 xl:grid-cols-2">
        <div
          className="rounded-[28px] border p-5"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <KeyRound className="h-4 w-4" /> 관리자 PIN 변경
          </div>
          {(Object.entries(pinForm) as [keyof PinForm, string][]).map(([key, value]) => (
            <input
              key={key}
              type="password"
              value={value}
              onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))}
              placeholder={key === "current_pin" ? "현재 PIN" : key === "new_pin" ? "새 PIN" : "새 PIN 확인"}
              className="mb-3 w-full rounded-[18px] border px-4 py-3 text-base outline-none"
              style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          ))}
          <button
            onClick={onChangePin}
            className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
            style={{ background: LEGACY_COLORS.blue }}
          >
            PIN 저장
          </button>
        </div>

        <div
          className="rounded-[28px] border p-5"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
          }}
        >
          <div
            className="mb-3 flex items-center gap-2 rounded-[14px] border px-3 py-2 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 16%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 50%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            ⚠ 복구 불가 — 이 작업은 되돌릴 수 없습니다
          </div>
          <div className="mb-4 flex items-center gap-2 text-base font-bold" style={{ color: LEGACY_COLORS.red }}>
            <DatabaseBackup className="h-4 w-4" /> 안전 초기화
          </div>
          <input
            type="password"
            value={resetPin}
            onChange={(event) => setResetPin(event.target.value)}
            placeholder="관리자 PIN"
            className="mb-3 w-full rounded-[18px] border px-4 py-3 text-base outline-none"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
          />
          <button
            onClick={onResetDatabase}
            className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
            style={{ background: LEGACY_COLORS.red }}
          >
            시드 기준으로 다시 적재
          </button>
        </div>
      </div>
    </div>
  );
}
