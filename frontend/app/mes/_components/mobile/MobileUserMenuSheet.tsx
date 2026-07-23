"use client";

import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "./tokens";
import { api } from "@/lib/api";
import { clearCurrentOperator, useCurrentOperator } from "../login/useCurrentOperator";
import { normalizeDepartment } from "@/lib/mes/department";
import { PinInput } from "./primitives";

const WAREHOUSE_ROLE_LABEL: Record<string, string | null> = {
  primary: "창고 정",
  deputy: "창고 부",
  none: null,
};

const DEPARTMENT_ROLE_LABEL: Record<string, string | null> = {
  primary: "부서 정",
  deputy: "부서 부",
  none: null,
};

type PinStep = "idle" | "current" | "new" | "confirm";

export function MobileUserMenuSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const operator = useCurrentOperator();

  // PIN 변경 흐름
  const [pinStep, setPinStep] = useState<PinStep>("idle");
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinDone, setPinDone] = useState(false);

  // 로그아웃 확인
  const [confirmLogout, setConfirmLogout] = useState(false);

  function resetPin() {
    setPinStep("idle");
    setPinCurrent("");
    setPinNew("");
    setPinConfirm("");
    setPinError(null);
    setPinBusy(false);
    setPinDone(false);
  }

  function handleClose() {
    resetPin();
    setConfirmLogout(false);
    onClose();
  }

  async function handlePinConfirm() {
    if (!operator) return;
    if (pinStep === "current") {
      if (!pinCurrent) { setPinError("현재 PIN을 입력해 주세요."); return; }
      setPinError(null);
      setPinStep("new");
      return;
    }
    if (pinStep === "new") {
      if (!pinNew) { setPinError("새 PIN을 입력해 주세요."); return; }
      setPinError(null);
      setPinStep("confirm");
      return;
    }
    if (pinStep === "confirm") {
      if (pinNew !== pinConfirm) { setPinError("새 PIN과 확인 PIN이 일치하지 않습니다."); return; }
      setPinBusy(true);
      setPinError(null);
      try {
        await api.changeMyPin(operator.employee_id, pinCurrent, pinNew);
        setPinDone(true);
        setPinStep("idle");
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "PIN 변경에 실패했습니다.");
      } finally {
        setPinBusy(false);
      }
    }
  }

  if (!operator) return null;

  const warehouseLabel = WAREHOUSE_ROLE_LABEL[operator.warehouse_role] ?? null;
  const deptLabel = DEPARTMENT_ROLE_LABEL[operator.department_role] ?? null;
  const jobTitle = (operator.role ?? "").split("/").pop()?.trim() ?? "";

  return (
    <BottomSheet open={open} onClose={handleClose} ariaLabel="사용자 메뉴">
      {/* 사용자 정보 헤더 */}
      <div className="px-5 pb-3 pt-1">
        <div className={`${TYPO.headline} font-black`} style={{ color: LEGACY_COLORS.text }}>
          {operator.name}
        </div>
        <div className={`${TYPO.caption} mt-0.5`} style={{ color: LEGACY_COLORS.muted2 }}>
          {normalizeDepartment(operator.department)}
          {jobTitle ? ` · ${jobTitle}` : ""}
        </div>
        {(warehouseLabel || deptLabel) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {warehouseLabel && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.green} 18%, transparent)`,
                  color: LEGACY_COLORS.green,
                }}
              >
                {warehouseLabel}
              </span>
            )}
            {deptLabel && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 18%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {deptLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mx-5 border-t" style={{ borderColor: LEGACY_COLORS.border }} />

      {/* PIN 변경 섹션 */}
      <div className="px-5 py-3">
        {pinStep === "idle" ? (
          <div>
            {pinDone && (
              <div className={`${TYPO.caption} mb-2 font-semibold`} style={{ color: LEGACY_COLORS.green }}>
                PIN이 변경되었습니다.
              </div>
            )}
            <button
              type="button"
              onClick={() => { setPinDone(false); setPinError(null); setPinStep("current"); }}
              className="flex w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-opacity active:opacity-70"
              style={{
                background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
                color: LEGACY_COLORS.blue,
              }}
            >
              <KeyRound size={18} />
              <span className={`${TYPO.body} font-semibold`}>비밀번호 변경</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className={`${TYPO.caption} font-bold uppercase tracking-wide`} style={{ color: LEGACY_COLORS.muted2 }}>
              {pinStep === "current" ? "현재 PIN 입력" : pinStep === "new" ? "새 PIN 입력" : "새 PIN 확인"}
            </div>
            <PinInput
              value={pinStep === "current" ? pinCurrent : pinStep === "new" ? pinNew : pinConfirm}
              onChange={(v) => {
                setPinError(null);
                if (pinStep === "current") setPinCurrent(v);
                else if (pinStep === "new") setPinNew(v);
                else setPinConfirm(v);
              }}
              placeholder="••••"
            />
            {pinError && (
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.red }}>{pinError}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetPin}
                disabled={pinBusy}
                className="flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-opacity active:opacity-70"
                style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { void handlePinConfirm(); }}
                disabled={pinBusy}
                className="flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-opacity active:opacity-70"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 18%, transparent)`,
                  color: LEGACY_COLORS.blue,
                }}
              >
                {pinBusy ? "처리 중…" : pinStep === "confirm" ? "변경" : "다음"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-5 border-t" style={{ borderColor: LEGACY_COLORS.border }} />

      {/* 로그아웃 섹션 */}
      <div className="px-5 py-3 pb-2">
        {!confirmLogout ? (
          <button
            type="button"
            onClick={() => setConfirmLogout(true)}
            className="flex w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-opacity active:opacity-70"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
              color: LEGACY_COLORS.red,
            }}
          >
            <LogOut size={18} />
            <span className={`${TYPO.body} font-semibold`}>로그아웃</span>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className={`${TYPO.caption} font-semibold`} style={{ color: LEGACY_COLORS.muted2 }}>
              로그아웃하시겠습니까?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-opacity active:opacity-70"
                style={{ background: LEGACY_COLORS.s3, color: LEGACY_COLORS.muted }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { clearCurrentOperator(); window.location.reload(); }}
                className="flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition-opacity active:opacity-70"
                style={{
                  background: `color-mix(in srgb, ${LEGACY_COLORS.red} 18%, transparent)`,
                  color: LEGACY_COLORS.red,
                }}
              >
                로그아웃
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
