"use client";

import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import clsx from "clsx";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api } from "@/lib/api";
import {
  clearCurrentOperator,
  type Operator,
} from "../../../login/useCurrentOperator";
import { TYPO } from "../../tokens";
import { PrimaryActionButton, SheetHeader } from "../../primitives";

type Mode = "menu" | "pin" | "logout";

export function OperatorMenuSheet({
  open,
  onClose,
  operator,
  onLoggedOut,
  onPinChanged,
}: {
  open: boolean;
  onClose: () => void;
  operator: Operator | null;
  onLoggedOut: () => void;
  onPinChanged?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");

  const handleClose = () => {
    setMode("menu");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={handleClose}>
      {mode === "menu" ? (
        <MenuPanel
          operator={operator}
          onClose={handleClose}
          onChangePin={() => setMode("pin")}
          onLogout={() => setMode("logout")}
        />
      ) : null}
      {mode === "pin" ? (
        <PinChangePanel
          operator={operator}
          onCancel={() => setMode("menu")}
          onSuccess={() => {
            setMode("menu");
            onPinChanged?.();
            onClose();
          }}
        />
      ) : null}
      {mode === "logout" ? (
        <LogoutConfirmPanel
          onCancel={() => setMode("menu")}
          onConfirm={() => {
            clearCurrentOperator();
            setMode("menu");
            onClose();
            onLoggedOut();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}

// ───────────────────────── Menu ─────────────────────────

function MenuPanel({
  operator,
  onClose,
  onChangePin,
  onLogout,
}: {
  operator: Operator | null;
  onClose: () => void;
  onChangePin: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <SheetHeader
        title={operator?.name ?? "담당자"}
        subtitle={
          operator
            ? `${operator.department ?? ""}${operator.warehouse_role && operator.warehouse_role !== "none" ? ` · 창고 ${operator.warehouse_role === "primary" ? "정" : "부"}` : ""}`
            : "로그인 정보"
        }
        onClose={onClose}
      />
      <div className="flex flex-col gap-2 px-5 pb-4">
        <button
          type="button"
          onClick={onChangePin}
          className="flex items-center gap-3 rounded-[18px] border px-4 py-3 text-left active:scale-[0.98]"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[14px]"
            style={{
              background: `${LEGACY_COLORS.blue as string}22`,
              color: LEGACY_COLORS.blue as string,
            }}
          >
            <KeyRound size={20} strokeWidth={1.85} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
              내 PIN 변경
            </span>
            <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              현재 PIN 확인 후 새 PIN 설정
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 rounded-[18px] border px-4 py-3 text-left active:scale-[0.98]"
          style={{
            background: `${LEGACY_COLORS.red as string}10`,
            borderColor: `${LEGACY_COLORS.red as string}55`,
          }}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[14px]"
            style={{
              background: `${LEGACY_COLORS.red as string}22`,
              color: LEGACY_COLORS.red as string,
            }}
          >
            <LogOut size={20} strokeWidth={1.85} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`${TYPO.body} font-black`}
              style={{ color: LEGACY_COLORS.red as string }}
            >
              로그아웃
            </span>
            <span className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
              세션 종료 후 로그인 화면으로 이동
            </span>
          </span>
        </button>
      </div>
    </>
  );
}

// ───────────────────────── PIN 변경 ─────────────────────────

function PinChangePanel({
  operator,
  onCancel,
  onSuccess,
}: {
  operator: Operator | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    current.length >= 4 && next.length >= 4 && next === confirm && !busy && !!operator;

  const submit = async () => {
    if (!operator) return;
    if (next !== confirm) {
      setError("새 PIN이 일치하지 않습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changeMyPin(operator.employee_id, current, next);
      onSuccess();
    } catch (e) {
      const message = e instanceof Error ? e.message : "PIN 변경에 실패했습니다.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader title="PIN 변경" subtitle={operator?.name ?? ""} onClose={onCancel} />
      <div className="flex flex-col gap-3 px-5 pb-4">
        <PinInput label="현재 PIN" value={current} onChange={setCurrent} />
        <PinInput label="새 PIN" value={next} onChange={setNext} />
        <PinInput label="새 PIN 확인" value={confirm} onChange={setConfirm} />
        {error ? (
          <div
            className={`${TYPO.caption} rounded-[12px] px-3 py-2`}
            style={{
              background: `${LEGACY_COLORS.red as string}18`,
              color: LEGACY_COLORS.red as string,
            }}
          >
            {error}
          </div>
        ) : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[14px] border py-3 font-bold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            취소
          </button>
          <PrimaryActionButton
            label="PIN 변경"
            intent="primary"
            onClick={submit}
            disabled={!canSubmit}
            loadingText="변경 중…"
            className="flex-[1.5]"
          />
        </div>
      </div>
    </>
  );
}

function PinInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
        style={{ color: LEGACY_COLORS.muted2 }}
      >
        {label}
      </span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className={clsx(
          TYPO.title,
          "rounded-[14px] border px-4 py-3 font-black tabular-nums tracking-[0.4em]",
        )}
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        placeholder="••••"
      />
    </label>
  );
}

// ───────────────────────── 로그아웃 확인 ─────────────────────────

function LogoutConfirmPanel({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <SheetHeader title="로그아웃" subtitle="확인이 필요합니다" onClose={onCancel} />
      <div className="flex flex-col gap-3 px-5 pb-4">
        <p className={TYPO.body} style={{ color: LEGACY_COLORS.muted2 }}>
          현재 세션을 종료하고 로그인 화면으로 이동합니다. 진행하시겠습니까?
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[14px] border py-3 font-bold"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            취소
          </button>
          <PrimaryActionButton
            label="로그아웃"
            intent="danger"
            icon={LogOut}
            onClick={onConfirm}
            className="flex-[1.5]"
          />
        </div>
      </div>
    </>
  );
}
