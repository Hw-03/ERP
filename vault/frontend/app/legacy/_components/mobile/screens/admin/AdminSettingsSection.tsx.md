---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/admin/AdminSettingsSection.tsx
status: active
updated: 2026-04-27
source_sha: 20e3364ad7d8
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminSettingsSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/admin/AdminSettingsSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `4209` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/admin/admin|frontend/app/legacy/_components/mobile/screens/admin]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { ToastState } from "../../../Toast";
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
