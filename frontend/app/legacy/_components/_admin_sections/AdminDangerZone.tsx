"use client";

import { useState } from "react";
import { AlertTriangle, DatabaseBackup, KeyRound, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { AdminPageHeader } from "./_admin_primitives";

type PinForm = { current_pin: string; new_pin: string; confirm_pin: string };

type Props = {
  pinForm: PinForm;
  setPinForm: (updater: (current: PinForm) => PinForm) => void;
  resetPin: string;
  setResetPin: (v: string) => void;
  onChangePin: () => void;
  onResetDatabase: () => void;
};

const DELETED_LIST = [
  "모든 품목 (Items) — 등록된 품목과 안전재고 정보",
  "모든 거래 이력 (Transactions) — 입출고·생산·조정 등",
  "모든 BOM 구성 — 부모-자식 자재 매핑",
  "모든 출하묶음 — 패키지와 포함 품목",
  "모든 직원과 부서 정보 — 권한·PIN 포함",
];

export function AdminDangerZone({
  pinForm,
  setPinForm,
  resetPin,
  setResetPin,
  onChangePin,
  onResetDatabase,
}: Props) {
  const [resetStage, setResetStage] = useState<"closed" | "warn" | "pin">("closed");
  const [resetBusy, setResetBusy] = useState(false);

  const canChangePin =
    pinForm.current_pin.trim() &&
    pinForm.new_pin.trim() &&
    pinForm.confirm_pin.trim() &&
    pinForm.new_pin === pinForm.confirm_pin;

  function openResetWarn() {
    setResetStage("warn");
  }
  function proceedToPinStage() {
    setResetStage("pin");
  }
  function closeReset() {
    if (resetBusy) return;
    setResetStage("closed");
    setResetPin("");
  }
  async function confirmReset() {
    if (!resetPin.trim()) return;
    setResetBusy(true);
    try {
      await Promise.resolve(onResetDatabase());
    } finally {
      setResetBusy(false);
      setResetStage("closed");
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-col">
        <AdminPageHeader
          icon={SettingsIcon}
          title="설정"
          description="시스템 환경 및 보안 설정을 관리합니다."
        />

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          {/* 일반 설정 */}
          <div>
            <SectionLabel>일반 설정</SectionLabel>
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
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <PinField
                  label="현재 PIN"
                  value={pinForm.current_pin}
                  onChange={(v) => setPinForm((c) => ({ ...c, current_pin: v }))}
                />
                <PinField
                  label="새 PIN"
                  value={pinForm.new_pin}
                  onChange={(v) => setPinForm((c) => ({ ...c, new_pin: v }))}
                />
                <PinField
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
              <button
                type="button"
                onClick={onChangePin}
                disabled={!canChangePin}
                className="mt-4 rounded-[12px] px-5 py-2.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: LEGACY_COLORS.blue }}
              >
                PIN 변경
              </button>
            </div>
          </div>

          {/* 위험 영역 */}
          <div>
            <DangerSectionLabel />
            <div
              className="rounded-[16px] border p-5"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.red} 5%, transparent)`,
                borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                  style={{
                    background: `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
                    color: LEGACY_COLORS.red,
                  }}
                >
                  <DatabaseBackup className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-black" style={{ color: LEGACY_COLORS.red }}>
                    데이터 초기화 / 시드 기준 재적재
                  </div>
                  <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                    현재 데이터를 모두 삭제하고 기본 시드 데이터로 시스템을 재구성합니다.
                    <br />
                    <span style={{ color: LEGACY_COLORS.red, fontWeight: 700 }}>이 작업은 되돌릴 수 없습니다.</span>
                  </div>
                </div>
              </div>

              <div
                className="mt-4 rounded-[12px] border px-3 py-2.5 text-[12px]"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 8%, transparent)`,
                  borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 30%, transparent)`,
                  color: LEGACY_COLORS.yellow,
                }}
              >
                💡 실행 전 [내보내기] 메뉴에서 데이터 백업을 권장합니다.
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={openResetWarn}
                  className="flex items-center gap-1.5 rounded-[12px] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:brightness-110"
                  style={{ background: LEGACY_COLORS.red }}
                >
                  <AlertTriangle className="h-4 w-4" />
                  데이터 초기화
                </button>
                <button
                  type="button"
                  onClick={openResetWarn}
                  className="flex items-center gap-1.5 rounded-[12px] border px-4 py-2.5 text-[13px] font-bold transition-colors hover:brightness-110"
                  style={{
                    background: LEGACY_COLORS.s1,
                    borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 35%, transparent)`,
                    color: LEGACY_COLORS.red,
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  시드 기준 재적재
                </button>
              </div>
            </div>
            <div
              className="mt-3 rounded-[10px] border px-3 py-2 text-[11px]"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.muted2} 8%, transparent)`,
                borderColor: LEGACY_COLORS.border,
                color: LEGACY_COLORS.muted2,
              }}
            >
              위험 영역의 작업은 즉시 실행되며 되돌릴 수 없습니다. 반드시 관리자 확인 후 진행해 주세요.
            </div>
          </div>
        </div>
      </div>

      {/* 1단계: 무엇이 삭제되는지 안내 */}
      <ConfirmModal
        open={resetStage === "warn"}
        title="데이터를 초기화하시겠습니까?"
        tone="danger"
        cautionMessage="이 작업은 다음 데이터를 영구 삭제합니다. 백업 없이 진행할 수 없습니다."
        confirmLabel="다음 단계"
        cancelLabel="취소"
        onClose={closeReset}
        onConfirm={proceedToPinStage}
      >
        <ul className="ml-5 mt-2 list-disc text-[13px]" style={{ color: LEGACY_COLORS.text }}>
          {DELETED_LIST.map((line) => (
            <li key={line} className="mb-1">
              {line}
            </li>
          ))}
        </ul>
        <div
          className="mt-3 rounded-[8px] border px-3 py-2 text-[12px]"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          ⚠ 진행 전에 [내보내기]에서 백업했는지 다시 확인해 주세요.
        </div>
      </ConfirmModal>

      {/* 2단계: PIN 입력 + 최종 확인 */}
      <ConfirmModal
        open={resetStage === "pin"}
        title="정말 삭제하시겠습니까? (최종 확인)"
        tone="danger"
        cautionMessage="이 작업은 즉시 실행되며 되돌릴 수 없습니다. 관리자 PIN을 입력하면 시드 기준으로 시스템이 재구성됩니다."
        confirmLabel="초기화 실행"
        cancelLabel="취소"
        busy={resetBusy}
        busyLabel="초기화 중..."
        onClose={closeReset}
        onConfirm={confirmReset}
      >
        <div className="mt-2">
          <div
            className="mb-1 text-[12px] font-bold uppercase tracking-[0.15em]"
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            관리자 PIN
          </div>
          <input
            type="password"
            inputMode="numeric"
            value={resetPin}
            onChange={(e) => setResetPin(e.target.value)}
            placeholder="0000"
            autoFocus
            className="w-full rounded-[12px] border px-3 py-2.5 text-[14px] tracking-widest outline-none focus:border-[var(--c-red)]"
            style={{
              background: LEGACY_COLORS.s1,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>
      </ConfirmModal>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.22em]"
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {children}
    </div>
  );
}

function DangerSectionLabel() {
  return (
    <div
      className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-black uppercase tracking-[0.22em]"
      style={{ color: LEGACY_COLORS.red }}
    >
      <AlertTriangle className="h-3 w-3" />
      위험 영역 (Danger Zone)
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div>
      <div
        className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </div>
      <input
        type="password"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0000"
        className="w-full rounded-[10px] border px-3 py-2.5 text-[14px] tracking-widest outline-none focus:border-[var(--c-blue)]"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: error ? LEGACY_COLORS.red : LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      />
      {error && (
        <div className="mt-1 text-[11px]" style={{ color: LEGACY_COLORS.red }}>
          {error}
        </div>
      )}
    </div>
  );
}
