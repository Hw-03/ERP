"use client";

/**
 * 거래 메타데이터(notes/reference_no/produced_by) 수정 모달.
 * reason + 수정자 PIN 필수. 재고에 영향 없음.
 *
 * 작업자 식별용 PIN — 실제 보안 인증이 아님.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type Employee, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS, transactionLabel } from "../legacyUi";
import { useCurrentOperator } from "../login/useCurrentOperator";

interface Props {
  open: boolean;
  log: TransactionLog | null;
  onClose: () => void;
  onSuccess: (updated: TransactionLog) => void;
}

export function TransactionEditModal({ open, log, onClose, onSuccess }: Props) {
  const operator = useCurrentOperator();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [notes, setNotes] = useState("");
  const [refNo, setRefNo] = useState("");
  const [producedBy, setProducedBy] = useState("");
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
    setNotes(log.notes ?? "");
    setRefNo(log.reference_no ?? "");
    setProducedBy(log.produced_by ?? "");
    setReason("");
    setPin("");
    setError("");
    setEditorId(operator?.employee_id ?? "");
  }, [open, log, operator]);

  if (!open || !log) return null;

  const canSubmit = reason.trim().length > 0 && editorId && pin.length > 0 && !submitting;

  async function handleSubmit() {
    if (!log || !canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const updated = await api.metaEditTransaction(log.log_id, {
        notes: notes !== (log.notes ?? "") ? notes : undefined,
        reference_no: refNo !== (log.reference_no ?? "") ? (refNo || null) : undefined,
        produced_by: producedBy !== (log.produced_by ?? "") ? (producedBy || null) : undefined,
        reason: reason.trim(),
        edited_by_employee_id: editorId,
        edited_by_pin: pin,
      });
      onSuccess(updated);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "수정 실패";
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
        className="w-full max-w-[520px] rounded-[24px] border p-6"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>
              거래 정보 수정
            </div>
            <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {transactionLabel(log.transaction_type)} · {log.item_name}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10">
            <X className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
          </button>
        </div>

        <p
          className="mb-3 rounded-[10px] border px-3 py-2 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 25%, transparent)`,
            color: LEGACY_COLORS.muted2,
          }}
        >
          이 모달은 메타데이터(메모/참조번호/담당자)만 수정합니다. 재고 수량에는 영향이 없습니다.
        </p>

        <div className="space-y-3">
          <FieldRow label="메모">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px] w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </FieldRow>
          <FieldRow label="참조번호">
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </FieldRow>
          <FieldRow label="담당자">
            <input
              type="text"
              value={producedBy}
              onChange={(e) => setProducedBy(e.target.value)}
              placeholder="예: 홍길동(조립)"
              className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
              style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
            />
          </FieldRow>

          <div className="border-t pt-3" style={{ borderColor: LEGACY_COLORS.border }}>
            <FieldRow label="수정 사유 (필수)">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="왜 수정하는지 짧게 입력"
                className="w-full rounded-[12px] border px-3 py-2 text-sm outline-none"
                style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              />
            </FieldRow>
          </div>

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
            style={{ background: LEGACY_COLORS.blue }}
          >
            {submitting ? "저장 중..." : "수정 저장"}
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
