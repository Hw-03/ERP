"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import { DisassembleTree, toServerDecision, validateDecisionTree, type ChildDecision } from "./DisassembleTree";
import { InlineErrorNote } from "./InlineErrorNote";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { REASON_CATEGORIES } from "./reasonCategories";

type ProcessAction = "unquarantine" | "scrap" | "return" | "disassemble";

interface Props {
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}

export function DefectProcessPanel({ location, currentEmployee, onDone, onCancel }: Props) {
  const isWarehouse = location.department === "창고";

  const [step, setStep] = useState<1 | 2>(1);
  const [action, setAction] = useState<ProcessAction>("unquarantine");
  const [processQty, setProcessQty] = useState<number>(Number(location.quantity));
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setStep(1);
    setAction("unquarantine");
    setProcessQty(Number(location.quantity));
    setCategory("");
    setMemo("");
    setDecisions([]);
    setBusy(false);
    setErrorMsg(null);
    setConfirmOpen(false);
  }, [location.item_id, location.department, location.quantity]);

  useEffect(() => {
    if (action !== "disassemble") setDecisions([]);
  }, [action]);

  const reworkReady = decisions.length > 0 && validateDecisionTree(decisions);

  async function handleSubmit() {
    if (busy || (action === "disassemble" && !reworkReady)) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (action === "unquarantine") {
        await defectsApi.unquarantine({
          item_id: location.item_id,
          qty: processQty,
          dept: location.department,
          reason_category: category || null,
          reason_memo: memo || null,
          actor_employee_id: currentEmployee.employee_id,
        });
      } else if (action === "scrap") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_scrap",
          reason_category: category || null,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [{
            item_id: location.item_id,
            quantity: processQty,
            from_bucket: "defective",
            from_department: location.department as Department,
            to_bucket: "none",
          }],
        });
      } else if (action === "return") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_return",
          reason_category: category || null,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [{
            item_id: location.item_id,
            quantity: processQty,
            from_bucket: "defective",
            from_department: location.department as Department,
            to_bucket: "none",
          }],
        });
      } else {
        const childDecisions = decisions.map(toServerDecision);
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_disassemble",
          reason_category: category || null,
          reason_memo: memo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines: [{
            item_id: location.item_id,
            quantity: processQty,
            from_bucket: "defective",
            from_department: location.department as Department,
            to_bucket: "none",
          }],
        });
      }
      onDone();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");

  // Step 2: BOM 확인 (재작업)
  if (step === 2) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        {/* 헤더 */}
        <div className="mb-5 flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={busy}
            className="flex items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
          >
            <ArrowLeft className="h-4 w-4" />
            이전
          </button>
          <div>
            <h2 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 처리</h2>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              <span>① 처리 선택</span>
              <span>→</span>
              <span style={{ color: LEGACY_COLORS.yellow }}>② BOM 확인</span>
            </div>
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          {/* 요약 박스 */}
          <div
            className="flex shrink-0 flex-wrap items-center gap-5 rounded-[16px] border px-6 py-4"
            style={{ background: tint(LEGACY_COLORS.blue, 7), borderColor: tint(LEGACY_COLORS.blue, 25) }}
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted2 }}>품목</span>
              <span className="text-base font-black" style={{ color: LEGACY_COLORS.text }}>{location.mes_code} {location.item_name}</span>
            </div>
            <div className="h-10 w-px" style={{ background: tint(LEGACY_COLORS.blue, 20) }} />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</span>
              <div className="flex items-center gap-2">
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
                  className="w-24 rounded-[10px] border px-3 py-2 text-center text-base font-black"
                  style={{ borderColor: tint(LEGACY_COLORS.blue, 35), background: LEGACY_COLORS.s1, color: LEGACY_COLORS.blue }}
                />
                <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/ {formatQty(location.quantity)}개</span>
              </div>
            </div>
            <div className="h-10 w-px" style={{ background: tint(LEGACY_COLORS.blue, 20) }} />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted2 }}>작업</span>
              <span className="text-base font-black" style={{ color: LEGACY_COLORS.yellow }}>재작업</span>
            </div>
            {category && (
              <>
                <div className="h-10 w-px" style={{ background: tint(LEGACY_COLORS.blue, 20) }} />
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-black uppercase tracking-[0.8px]" style={{ color: LEGACY_COLORS.muted2 }}>사유</span>
                  <span className="text-base font-bold" style={{ color: LEGACY_COLORS.text }}>{category}</span>
                </div>
              </>
            )}
          </div>

          {/* BOM 트리 */}
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <span className="text-sm font-black uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted2 }}>BOM 재작업 트리</span>
            <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>

          {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}
        </div>

        {/* 하단 */}
        <div className="flex shrink-0 items-center justify-between gap-2 pt-4">
          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>정상·격리·폐기 합계가 처리 수량과 같아야 합니다.</span>
          <button
            type="button"
            disabled={busy || !reworkReady}
            onClick={() => setConfirmOpen(true)}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.yellow }}
          >
            {busy ? "처리 중..." : "최종 처리 →"}
          </button>
        </div>

        <ConfirmModal
          open={confirmOpen}
          title="재작업 확인"
          tone="danger"
          cautionMessage="이 작업은 즉시 반영됩니다."
          confirmLabel="즉시 처리"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
        >
          <span style={{ color: LEGACY_COLORS.text }}>{location.item_name} × {processQty}개를 재작업합니다.</span>
        </ConfirmModal>
      </div>
    );
  }

  // Step 1
  const actionColor: Record<ProcessAction, string> = {
    unquarantine: LEGACY_COLORS.green,
    disassemble: LEGACY_COLORS.yellow,
    scrap: LEGACY_COLORS.red,
    return: LEGACY_COLORS.muted2,
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 헤더 */}
      <div className="mb-5 flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-2 rounded-[12px] border px-4 py-2 text-sm font-bold transition-colors hover:brightness-110 disabled:opacity-50"
          style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2, background: LEGACY_COLORS.s2 }}
        >
          <ArrowLeft className="h-4 w-4" />
          목록
        </button>
        <div>
          <h2 className="text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>불량 처리</h2>
          {location.has_bom && (
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              <span style={{ color: LEGACY_COLORS.yellow }}>① 처리 선택</span>
              <span>→</span>
              <span>② BOM 확인</span>
            </div>
          )}
        </div>
      </div>

      {/* 스크롤 영역 */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {/* 품목 정보 */}
        <div
          className="flex flex-col gap-2 rounded-[16px] border px-6 py-5"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{location.mes_code}</span>
            <span className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>{location.item_name}</span>
          </div>
          <div className="flex gap-6 text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
            <span>격리 수량 <span style={{ color: LEGACY_COLORS.text }}>{formatQty(location.quantity)}개</span></span>
            <span>부서 <span style={{ color: LEGACY_COLORS.text }}>{location.department}</span></span>
            <span>격리일 <span style={{ color: LEGACY_COLORS.text }}>{formatDate(location.defective_at)}</span></span>
          </div>
        </div>

        {/* 처리 수량 */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</span>
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
            className="w-28 rounded-[10px] border px-3 py-2.5 text-center text-base font-black"
            style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
          />
          <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/ 총 {formatQty(location.quantity)}개</span>
        </div>

        {/* 작업 선택 */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>작업 선택</span>
          <div className="flex gap-3">
            <ActionCard
              label="정상 복귀"
              desc="불량 해제 후 정상 재고로"
              color={LEGACY_COLORS.green}
              selected={action === "unquarantine"}
              onClick={() => setAction("unquarantine")}
            />
            {location.has_bom && (
              <ActionCard
                label="재작업"
                desc="BOM 재작업 후 처리"
                color={LEGACY_COLORS.yellow}
                selected={action === "disassemble"}
                onClick={() => setAction("disassemble")}
              />
            )}
            <ActionCard
              label="전체 폐기"
              desc="재고 차감, 되돌릴 수 없음"
              color={LEGACY_COLORS.red}
              selected={action === "scrap"}
              onClick={() => setAction("scrap")}
            />
            {isWarehouse && (
              <ActionCard
                label="반품"
                desc="창고 재고에서 차감"
                color={LEGACY_COLORS.muted2}
                selected={action === "return"}
                onClick={() => setAction("return")}
              />
            )}
          </div>
        </div>

        {/* 사유 카테고리 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            사유 카테고리 <span className="font-bold" style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-[12px] border px-4 py-3 text-base font-bold outline-none transition-colors"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: category ? LEGACY_COLORS.text : LEGACY_COLORS.muted,
            }}
          >
            <option value="">카테고리 선택</option>
            {REASON_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* 메모 */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>
            메모 <span className="font-bold" style={{ color: LEGACY_COLORS.muted }}>(선택)</span>
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 스크래치 다수 / 우측 끝단"
            rows={4}
            className="w-full resize-none rounded-[12px] border px-4 py-3 text-base outline-none transition-colors"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          />
        </div>

        {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}
      </div>

      {/* 하단 */}
      <div className="flex shrink-0 items-center justify-end gap-3 pt-4">
        {action === "disassemble" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStep(2)}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.yellow }}
          >
            다음 →
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (action === "unquarantine") {
                void handleSubmit();
              } else {
                setConfirmOpen(true);
              }
            }}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: actionColor[action] }}
          >
            {busy ? "처리 중..." : action === "unquarantine" ? "정상 복귀 →" : action === "scrap" ? "전체 폐기 →" : "반품 →"}
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={action === "scrap" ? "폐기 확인" : "반품 확인"}
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
            : `${location.item_name} × ${processQty}개를 반품합니다.`}
        </span>
      </ConfirmModal>
    </div>
  );
}

interface ActionCardProps {
  label: string;
  desc: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}

function ActionCard({ label, desc, color, selected, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col gap-3 rounded-[16px] border px-6 py-8 text-left transition-all"
      style={{
        background: selected ? tint(color, 8) : LEGACY_COLORS.s2,
        borderColor: selected ? color : LEGACY_COLORS.border,
        borderWidth: "2px",
      }}
    >
      <span className="text-base font-black" style={{ color: selected ? color : LEGACY_COLORS.muted2 }}>{label}</span>
      <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>{desc}</span>
    </button>
  );
}
