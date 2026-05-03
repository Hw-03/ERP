"use client";

/**
 * RECEIVE/SHIP 수량 보정 전용 모달.
 * 원본 거래 수량을 변경하는 게 아니라, 차액만큼 ADJUST 보정 거래를 생성한다.
 * 재고에 영향을 주는 작업이므로 일반 메타 수정과 분리.
 *
 * SHIP 수량 변환 규칙:
 *   - UI 입력: 항상 양수
 *   - 백엔드 전송: -abs(input) 으로 음수 변환
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api, type Employee, type TransactionLog, type TransactionType } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { useCurrentOperator } from "../login/useCurrentOperator";

interface Props {
  open: boolean;
  log: TransactionLog | null;
  onClose: () => void;
  onSuccess: (result: { original: TransactionLog; correction: TransactionLog }) => void;
}

export const QUANTITY_CORRECTABLE_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  "RECEIVE",
  "SHIP",
]);

export function TransactionQuantityCorrectModal({ open, log, onClose, onSuccess }: Props) {
  const operator = useCurrentOperator();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [qty, setQty] = useState(""); // 항상 양수 입력
  const [reason, setReason] = useState("");
  const [editorId, setEditorId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getEmployees({ activeOnly: true }).then(setEmployees).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !log) return;
    // 현재 수량의 절대값을 기본값으로
    setQty(String(Math.abs(Number(log.quantity_change))));
    setReason("");
    setPin("");
    setError("");
    setEditorId(operator?.employee_id ?? "");
  }, [open, log, operator]);

  if (!open || !log) return null;

  const isShip = log.transaction_type === "SHIP";
  const qtyNum = Number(qty);
  const qtyValid = qty.trim().length > 0 && Number.isFinite(qtyNum) && qtyNum > 0;
  const canSubmit = qtyValid && reason.trim().length > 0 && editorId && pin.length > 0 && !submitting;

  // SHIP은 음수로 전송, RECEIVE는 양수 그대로
  const willSendQty = isShip ? -Math.abs(qtyNum) : Math.abs(qtyNum);
  const delta = willSendQty - Number(log.quantity_change);

  async function handleSubmit() {
    if (!log || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await api.quantityCorrectTransaction(log.log_id, {
        quantity_change: willSendQty,
        reason: reason.trim(),
        edited_by_employee_id: editorId,
        edited_by_pin: pin,
      });
      onSuccess(result);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "보정 실패";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-[24px] border p-6"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              수량 보정
            </div>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {getTransactionLabel(log.transaction_type)} · {log.item_name}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10">
            <X className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
          </button>
        </div>

        {/* 경고 배너 */}
        <div
          className="mb-4 flex items-start gap-2 rounded-[12px] border px-3 py-2.5"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 12%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 35%, transparent)`,
          }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.yellow }} />
          <p className="text-xs" style={{ color: LEGACY_COLORS.text }}>
            이 작업은 실제 창고 재고 수량을 변경합니다. 차액만큼 ADJUST 보정 거래가 생성되며, 원본 거래는 보존됩니다.
          </p>
        </div>

        {/* 원본 수량 표시 */}
        <div
          className="mb-3 rounded-[12px] border px-3 py-2"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <div className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            원본 수량 변화
          </div>
          <div className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>
            {Number(log.quantity_change) >= 0 ? "+" : ""}
            {formatQty(log.quantity_change)} {log.item_unit}
          </div>
        </div>

        <div className="space-y-3">
          <FieldRow label={`보정 수량 (${isShip ? "양수 입력 → 음수 저장" : "양수만"})`}>
            <input
              type="number"
              min="0"
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-[12px] border px-3 py-2 text-base outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
            {qtyValid && (
              <p className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                저장값: {willSendQty > 0 ? "+" : ""}{willSendQty} · 차액(delta): {delta > 0 ? "+" : ""}{delta}
              </p>
            )}
          </FieldRow>

          <FieldRow label="보정 사유 (필수)">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 입고 수량 오기재"
              className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </FieldRow>

          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="수정자">
              <select
                value={editorId}
                onChange={(e) => setEditorId(e.target.value)}
                className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                <option value="">선택</option>
                {employees.map((e) => (
                  <option key={e.employee_id} value={e.employee_id}>
                    {e.name} ({e.employee_code})
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="PIN">
              <input
                type="password"
                inputMode="numeric"
                maxLength={20}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="0000"
                className="w-full rounded-[12px] border px-3 py-2 text-sm tracking-widest outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </FieldRow>
          </div>

          {error && (
            <p className="text-xs" style={{ color: LEGACY_COLORS.red }}>
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-[14px] border px-4 py-2.5 text-sm font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            취소
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-[14px] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: LEGACY_COLORS.yellow, color: "#1a1a1a" }}
          >
            {submitting ? "보정 중..." : "수량 보정"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.15em]" style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
