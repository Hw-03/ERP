"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import { DisassembleTree, toServerDecision, validateDecisionTree, type ChildDecision } from "./DisassembleTree";
import { ReasonFormFields } from "./ReasonFormFields";
import { InlineErrorNote } from "./InlineErrorNote";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";

type DisposalAction = "unquarantine" | "scrap" | "disassemble";

interface PaPfDefectWizardProps {
  open: boolean;
  onClose: () => void;
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

export function PaPfDefectWizard({
  open,
  onClose,
  location,
  currentEmployee,
  onSubmitted,
}: PaPfDefectWizardProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [action, setAction] = useState<DisposalAction>("disassemble");
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [processQty, setProcessQty] = useState<number>(Number(location.quantity));
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!busy && e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy, onClose]);

  // action 변경 시 decisions 초기화
  useEffect(() => {
    if (action !== "disassemble") setDecisions([]);
  }, [action]);

  const canSubmit =
    category.trim() !== "" &&
    !busy &&
    (action !== "disassemble" || (decisions.length > 0 && validateDecisionTree(decisions)));

  const submitLabel: Record<DisposalAction, string> = {
    unquarantine: "정상 복귀로 변경",
    scrap: "즉시 처리 →",
    disassemble: "즉시 처리 →",
  };

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (action === "unquarantine") {
        await defectsApi.unquarantine({
          item_id: location.item_id,
          qty: processQty,
          dept: location.department,
          reason_category: category,
          reason_memo: memo,
          actor_employee_id: currentEmployee.employee_id,
        });
      } else if (action === "scrap") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_scrap",
          reason_category: category,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [
            {
              item_id: location.item_id,
              quantity: processQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      } else {
        // disassemble — 재귀 트리 페이로드
        const childDecisions = decisions.map(toServerDecision);
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_disassemble",
          reason_category: category,
          reason_memo: memo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines: [
            {
              item_id: location.item_id,
              quantity: processQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      }
      onSubmitted();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !mounted) return null;

  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="flex w-full max-w-[600px] flex-col gap-0 overflow-hidden rounded-[24px] border"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-start gap-3 px-6 py-5"
          style={{ borderBottom: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: LEGACY_COLORS.red }} />
          <div className="flex flex-col gap-0.5">
            <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
              [처리] {location.mes_code} {location.item_name} × {location.quantity}개
            </div>
            <div className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              {location.department} [불량] / 격리 {formatDate(location.defective_at)}
            </div>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          {/* 처리 수량 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</span>
            <input
              type="number"
              min={1}
              max={Number(location.quantity)}
              value={processQty}
              onChange={(e) => {
                const v = Math.max(1, Math.min(Number(location.quantity), Number(e.target.value) || 1));
                setProcessQty(v);
                setDecisions([]);
              }}
              className="w-16 rounded-[8px] border px-2 py-1 text-center text-base font-black"
              style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
            />
            <span className="text-xs font-black" style={{ color: LEGACY_COLORS.muted2 }}>
              / 총 {location.quantity}개 격리
            </span>
          </div>

          {/* 처리 방식 선택 */}
          <div className="flex flex-col gap-3">
            <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
              이 격리 항목을 어떻게 할까요?
            </div>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: "unquarantine", label: "정상 복귀 (잘못 격리)" },
                  { value: "scrap", label: "전부 폐기 (BOM 통째)" },
                  { value: "disassemble", label: "재작업" },
                ] as { value: DisposalAction; label: string }[]
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-[10px] border px-4 py-2.5 text-sm font-bold transition-colors"
                  style={{
                    borderColor:
                      action === value
                        ? LEGACY_COLORS.red
                        : LEGACY_COLORS.border,
                    background:
                      action === value
                        ? "color-mix(in srgb, var(--c-red) 8%, transparent)"
                        : LEGACY_COLORS.s2,
                    color:
                      action === value ? LEGACY_COLORS.red : LEGACY_COLORS.text,
                  }}
                >
                  <input
                    type="radio"
                    name="disposal-action"
                    value={value}
                    checked={action === value}
                    onChange={() => setAction(value)}
                    className="accent-red-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* BOM 재작업 트리 — 분해 선택 시만 표시 */}
          {action === "disassemble" && (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
                BOM 재작업 트리
              </div>
              <DisassembleTree
                parentItemId={location.item_id}
                parentItemName={location.item_name}
                parentMesCode={location.mes_code}
                parentQty={processQty}
                parentDept={location.department}
                decisions={decisions}
                onChange={setDecisions}
              />
            </div>
          )}

          {/* 본인 사유 */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>
              사유 (본인)
            </div>
            <ReasonFormFields
              category={category}
              memo={memo}
              onCategoryChange={setCategory}
              onMemoChange={setMemo}
              required
            />
          </div>

          {/* 에러 */}
          {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}
        </div>

        {/* 푸터 */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: `1px solid ${LEGACY_COLORS.border}` }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125 disabled:opacity-50"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (action === "unquarantine") {
                void handleSubmit();
              } else {
                setConfirmOpen(true);
              }
            }}
            disabled={!canSubmit}
            className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.red }}
          >
            {busy ? "처리 중..." : submitLabel[action]}
          </button>
        </div>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title={action === "scrap" ? "폐기 확인" : "재작업 확인"}
        tone="danger"
        cautionMessage="이 작업은 즉시 반영됩니다."
        confirmLabel="즉시 처리"
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
      >
        <span style={{ color: LEGACY_COLORS.text }}>
          {action === "scrap"
            ? `${location.item_name} × ${processQty}개를 폐기합니다.`
            : `${location.item_name} × ${processQty}개를 재작업합니다. 하위 품목은 정상·격리·폐기로 나눠 처리됩니다.`}
        </span>
      </ConfirmModal>
    </div>,
    document.body,
  );
}
