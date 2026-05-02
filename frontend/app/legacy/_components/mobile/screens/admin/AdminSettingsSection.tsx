"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ToastState } from "@/features/mes/shared/Toast";
import { LEGACY_COLORS } from "../../../legacyUi";

export function AdminSettingsSection({ showToast }: { showToast: (toast: ToastState) => void }) {
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const [resetPin, setResetPin] = useState("");

  async function changePin() {
    if (pinForm.new_pin !== pinForm.confirm_pin) {
      showToast({ message: "새 PIN이 서로 다릅니다.", type: "error" });
      return;
    }
    await api.updateAdminPin({ current_pin: pinForm.current_pin, new_pin: pinForm.new_pin });
    setPinForm({ current_pin: "", new_pin: "", confirm_pin: "" });
    showToast({ message: "관리자 PIN을 변경했습니다.", type: "success" });
  }

  async function reset() {
    await api.resetDatabase(resetPin);
    setResetPin("");
    showToast({ message: "데이터를 초기화했습니다.", type: "success" });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>PIN 변경</div>
        {(
          [
            ["current_pin", "현재 PIN"],
            ["new_pin", "새 PIN"],
            ["confirm_pin", "새 PIN 확인"],
          ] as [keyof typeof pinForm, string][]
        ).map(([key, label]) => (
          <div key={key} className="mb-3">
            <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1px]" style={{ color: LEGACY_COLORS.muted2 }}>{label}</div>
            <input type="password" value={pinForm[key]} onChange={(event) => setPinForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
          </div>
        ))}
        <button onClick={() => void changePin()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.blue }}>변경</button>
      </div>

      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>엑셀 내보내기</div>
        <div className="grid grid-cols-2 gap-2">
          <a href={api.getItemsExportUrl()} download className="rounded-xl border py-[13px] text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            품목 엑셀
          </a>
          <a href={api.getTransactionsExportUrl()} download className="rounded-xl border py-[13px] text-center text-sm font-bold" style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}>
            거래 엑셀
          </a>
        </div>
      </div>

      <div className="rounded-[14px] border px-[14px] py-4" style={{ background: "rgba(242,95,92,.08)", borderColor: "rgba(242,95,92,.25)" }}>
        <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.red }}>안전 초기화</div>
        <div className="mb-3 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
          관리자 PIN 확인 후 시드 데이터를 다시 적재합니다.
        </div>
        <input type="password" value={resetPin} onChange={(event) => setResetPin(event.target.value)} placeholder="관리자 PIN" className="mb-3 w-full rounded-[11px] border px-[13px] py-[11px] text-sm outline-none" style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }} />
        <button onClick={() => void reset()} className="w-full rounded-xl py-[13px] text-[15px] font-bold text-white" style={{ background: LEGACY_COLORS.red }}>초기화</button>
      </div>
    </div>
  );
}
