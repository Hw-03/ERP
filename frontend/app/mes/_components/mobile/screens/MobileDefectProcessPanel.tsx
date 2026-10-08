"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { TYPO } from "../tokens";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import {
  toServerDecision,
  validateDecisionTree,
  type ChildDecision,
} from "../../_defect_hub/DisassembleTree";
import { InlineErrorNote } from "../../_defect_hub/InlineErrorNote";
import { ReasonFormFields } from "../../_defect_hub/ReasonFormFields";
import { hasDefectReason } from "../../_defect_hub/defectCartValidation";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { SectionCard, StickyFooter, Stepper } from "../primitives";
import type { Supplier } from "@/lib/api";
import { SupplierPickerStep } from "../../_warehouse_v2/SupplierPickerStep";
import panelStyles from "./mobileWarehousePanels.module.css";
import { MobileDefectStepHeader } from "./MobileDefectStepHeader";
import { MobileReworkWorkspace } from "../rework/MobileReworkWorkspace";
import type { MobileReworkMemory } from "../rework/useMobileReworkWorkspace";

type ProcessAction = "unquarantine" | "scrap" | "return" | "disassemble";

/**
 * 불량 통합 처리 — 모바일 전용.
 *
 * 데스크톱 DefectProcessPanel 의 동작/옵션(정상복귀·재작업·전체폐기·반품, 사유 선택,
 * has_bom 일 때만 재작업, 창고·튜브 부서 반품, 재작업 시 BOM 재작업 step2)을 그대로 옮기되,
 * 393px 레이아웃(세로 액션 카드·Stepper·인라인 하단 버튼)으로 재구성한다.
 * 데스크톱 컴포넌트는 건드리지 않는다(동명 분리 정책).
 */
export function MobileDefectProcessPanel({
  location,
  currentEmployee,
  onDone,
  onCancel,
}: {
  location: DefectLocation;
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const canReturn = location.department === "창고" || location.department === "튜브";
  const supplierScope = location.return_supplier_scope ?? "warehouse";
  const maxQty = Math.max(1, Number(location.available_quantity) || 1);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [action, setAction] = useState<ProcessAction>("unquarantine");
  const [processQty, setProcessQty] = useState<number>(maxQty);
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const hasReason = hasDefectReason(category, memo);
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [decisionParentQty, setDecisionParentQty] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierListReady, setSupplierListReady] = useState(false);
  const locationIdentityRef = useRef(location.record_id);
  const reworkSessionRef = useRef<MobileReworkMemory | null>(null);
  const boundedProcessQty = Math.max(1, Math.min(maxQty, processQty));

  useEffect(() => {
    window.history.replaceState({ defect: "process", recordId: location.record_id, step: 1 }, "");
    function onPop(event: PopStateEvent): void {
      const state = event.state;
      if (state?.defect !== "process" || state.recordId !== location.record_id) return;
      setConfirmOpen(false);
      if (state.step === 2) setAction("disassemble");
      setStep(state.step === 2 ? 2 : 1);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [location.record_id]);

  useEffect(() => {
    if (locationIdentityRef.current === location.record_id) return;
    locationIdentityRef.current = location.record_id;
    setStep(1);
    setAction("unquarantine");
    setProcessQty(Math.max(1, Number(location.available_quantity) || 1));
    setCategory("");
    setCategoryId(null);
    setMemo("");
    setDecisions([]);
    setDecisionParentQty(null);
    setBusy(false);
    setErrorMsg(null);
    setConfirmOpen(false);
    setSelectedSupplier(null);
    setSupplierListReady(false);
  }, [location.record_id, location.available_quantity]);

  useEffect(() => {
    const freshMax = Math.max(1, Number(location.available_quantity) || 1);
    setProcessQty((currentQty) => Math.max(1, Math.min(freshMax, currentQty)));
  }, [location.available_quantity]);

  useEffect(() => {
    if (action !== "disassemble") {
      setDecisions([]);
      setDecisionParentQty(null);
    }
    if (action !== "return") {
      setSelectedSupplier(null);
      setSupplierListReady(false);
    }
  }, [action]);

  useEffect(() => {
    setSelectedSupplier(null);
    setSupplierListReady(false);
    setConfirmOpen(false);
  }, [supplierScope]);

  useEffect(() => {
    if (decisionParentQty !== null && decisionParentQty !== boundedProcessQty) {
      setDecisions([]);
      setDecisionParentQty(null);
      setConfirmOpen(false);
    }
  }, [boundedProcessQty, decisionParentQty]);

  const reworkReady = decisionParentQty === boundedProcessQty
    && decisions.length > 0
    && validateDecisionTree(decisions);

  function handleDecisionsChange(next: ChildDecision[]) {
    setDecisions(next);
    setDecisionParentQty(next.length > 0 ? boundedProcessQty : null);
  }

  async function handleSubmit() {
    if (busy || !hasReason || (action === "disassemble" && !reworkReady) || (action === "return" && (!canReturn || !supplierListReady || !selectedSupplier || (selectedSupplier.scope ?? "warehouse") !== supplierScope))) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (action === "unquarantine") {
        await defectsApi.unquarantine({
          record_id: location.record_id,
          item_id: location.item_id,
          qty: boundedProcessQty,
          dept: location.department,
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          actor_employee_id: currentEmployee.employee_id,
        });
      } else if (action === "scrap" || action === "return") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: action === "scrap" ? "defect_scrap" : "defect_return",
          supplier_id: action === "return" ? selectedSupplier!.supplier_id : undefined,
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          notes: memo || null,
          lines: [
            {
              record_id: location.record_id,
              item_id: location.item_id,
              quantity: boundedProcessQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      } else {
        const childDecisions = decisions.map(toServerDecision);
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          request_type: "defect_disassemble",
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines: [
            {
              record_id: location.record_id,
              item_id: location.item_id,
              quantity: boundedProcessQty,
              from_bucket: "defective",
              from_department: location.department as Department,
              to_bucket: "none",
            },
          ],
        });
      }
      onDone();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const actionColor: Record<ProcessAction, string> = {
    unquarantine: LEGACY_COLORS.green,
    disassemble: LEGACY_COLORS.yellow,
    scrap: LEGACY_COLORS.red,
    return: LEGACY_COLORS.muted2,
  };
  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");
  const processSteps = action === "disassemble" ? ["처리 선택", "BOM 확인"] : action === "return" ? ["처리 선택", "공급업체 선택"] : ["처리 선택"];

  if (step === 3) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <MobileDefectStepHeader title="공급업체 선택" steps={processSteps} current={1} onBack={() => setStep(1)} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SupplierPickerStep
            employeeId={currentEmployee.employee_id}
            selectedSupplierId={selectedSupplier?.supplier_id ?? null}
            selectedSupplierName={selectedSupplier?.name ?? null}
            onSelect={setSelectedSupplier}
            onLoadStateChange={setSupplierListReady}
            variant="mobile"
            mode="select"
            supplierScope={supplierScope}
          />
        </div>
        <StickyFooter flat compact embedded className="!px-0 !pt-0">
          <button
            type="button"
            disabled={busy || !canReturn || !supplierListReady || !selectedSupplier}
            onClick={() => setConfirmOpen(true)}
            className={clsx("w-full rounded-[16px] px-4 py-[14px] font-black text-white disabled:opacity-40", TYPO.body)}
            style={{ background: LEGACY_COLORS.blueSolid }}
          >
            반품 확인
          </button>
        </StickyFooter>
        <ConfirmModal
          className={panelStyles.touchScope}
          open={confirmOpen}
          title="반품 확인"
          tone="danger"
          cautionMessage="확인하면 즉시 재고에 반영됩니다."
          confirmLabel="즉시 반품"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
        >
          <span style={{ color: LEGACY_COLORS.text }}>
            {location.item_name} × {boundedProcessQty}개를 {selectedSupplier?.name}에 반품합니다.
          </span>
        </ConfirmModal>
      </div>
    );
  }

  // ── Step 2: BOM 재작업 ──────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <MobileReworkWorkspace
          sessionId={location.record_id}
          parentItemId={location.item_id}
          parentItemName={location.item_name}
          parentMesCode={location.mes_code ?? ""}
          parentQty={boundedProcessQty}
          reason={[category, memo].filter(Boolean).join(" · ")}
          decisions={decisions}
          onChange={handleDecisionsChange}
          sessionRef={reworkSessionRef}
          steps={processSteps}
          current={1}
          onBack={() => window.history.back()}
          onConfirm={() => setConfirmOpen(true)}
          busy={busy}
          canSubmit={hasReason && reworkReady}
          error={errorMsg}
        />

        <ConfirmModal
          className={panelStyles.touchScope}
          open={confirmOpen}
          title="재작업 확인"
          tone="danger"
          cautionMessage="확인하면 즉시 재고에 반영됩니다."
          confirmLabel="즉시 재작업"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void handleSubmit();
          }}
        >
          <span style={{ color: LEGACY_COLORS.text }}>
            {location.item_name} × {boundedProcessQty}개를 재작업합니다.
          </span>
        </ConfirmModal>
      </div>
    );
  }

  // ── Step 1: 액션 선택 + 사유 ─────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 pb-3"><MobileDefectStepHeader title="처리 선택" steps={processSteps} current={0} onBack={onCancel} backLabel="목록" /></div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {/* 품목 정보 */}
      <SectionCard padding="sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className={clsx(TYPO.caption, "font-bold")} style={{ color: LEGACY_COLORS.muted2 }}>
              {location.mes_code}
            </span>
            <span className={clsx(TYPO.title, "font-black")} style={{ color: LEGACY_COLORS.text }}>
              {location.item_name}
            </span>
          </div>
          <div className={clsx(TYPO.caption, "flex flex-wrap gap-x-4 gap-y-1 font-bold")} style={{ color: LEGACY_COLORS.muted }}>
            <span>남음 {formatQty(location.quantity)}개</span>
            <span>처리 가능 {formatQty(location.available_quantity)}개</span>
            <span>{location.department}</span>
            <span>격리일 {formatDate(location.defective_at)}</span>
          </div>
        </div>
      </SectionCard>

      {/* 처리 수량 */}
      <div className="flex items-center justify-between gap-3">
        <span className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          처리 수량
        </span>
        <div className="flex items-center gap-2">
          <Stepper
            value={boundedProcessQty}
            onChange={(n) => setProcessQty(Math.max(1, Math.min(maxQty, n)))}
            min={1}
            max={maxQty}
            danger={action === "scrap"}
          />
          <span className={clsx(TYPO.caption, "font-bold whitespace-nowrap")} style={{ color: LEGACY_COLORS.muted2 }}>
            / {formatQty(maxQty)}
          </span>
        </div>
      </div>

      {/* 작업 선택 — 세로 카드 */}
      <div className="flex flex-col gap-2">
        <span className={clsx(TYPO.body, "font-black")} style={{ color: LEGACY_COLORS.muted2 }}>
          작업 선택
        </span>
        <ActionRow
          label="정상 복귀"
          color={LEGACY_COLORS.green}
          selected={action === "unquarantine"}
          onClick={() => setAction("unquarantine")}
        />
        {location.has_bom && (
          <ActionRow
            label="재작업"
            color={LEGACY_COLORS.yellow}
            selected={action === "disassemble"}
            onClick={() => setAction("disassemble")}
          />
        )}
        <ActionRow
          label="전체 폐기"
          color={LEGACY_COLORS.red}
          selected={action === "scrap"}
          onClick={() => setAction("scrap")}
        />
        {canReturn && (
          <ActionRow
            label="반품"
            color={LEGACY_COLORS.muted2}
            selected={action === "return"}
            onClick={() => setAction("return")}
          />
        )}
      </div>

      <ReasonFormFields
        employeeId={currentEmployee.employee_id}
        category={category}
        categoryId={categoryId}
        memo={memo}
        onCategoryChange={(name, id) => { setCategory(name); setCategoryId(id ?? null); }}
        onMemoChange={setMemo}
        required
        mobilePresentation
      />

      {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}
      </div>

      {/* 하단 액션 — 항상 보이도록 고정 */}
      <StickyFooter flat compact embedded className="!px-0">
        <button
          type="button"
          disabled={busy || !hasReason || (action === "return" && !canReturn)}
          onClick={() => {
            if (action === "disassemble") {
              window.history.pushState({ defect: "process", recordId: location.record_id, step: 2 }, "");
              setStep(2);
            } else if (action === "return") {
              setStep(3);
            } else {
              setConfirmOpen(true);
            }
          }}
          className={clsx(
            "w-full rounded-[16px] px-4 py-[14px] font-black text-white transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40",
            TYPO.body,
          )}
          style={{ background: actionColor[action] }}
        >
          {busy
            ? "처리 중..."
            : action === "disassemble"
            ? "다음 →"
            : action === "unquarantine"
            ? "정상 복귀 →"
            : action === "scrap"
            ? "즉시 폐기 →"
            : "공급업체 선택 →"}
        </button>
      </StickyFooter>

      <ConfirmModal
        className={panelStyles.touchScope}
        open={confirmOpen}
        title={action === "unquarantine" ? "정상 복귀 확인" : action === "scrap" ? "폐기 확인" : "반품 확인"}
        tone="danger"
        cautionMessage={action === "unquarantine" ? "이 작업은 즉시 반영됩니다." : "확인하면 즉시 재고에 반영됩니다."}
        confirmLabel={action === "unquarantine" ? "즉시 복귀" : action === "scrap" ? "즉시 폐기" : "즉시 반품"}
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleSubmit();
        }}
      >
        <span style={{ color: LEGACY_COLORS.text }}>
          {action === "unquarantine"
            ? `${location.item_name} × ${boundedProcessQty}개를 정상 재고로 복귀합니다.`
            : action === "scrap"
            ? `${location.item_name} × ${boundedProcessQty}개를 폐기합니다.`
            : `${location.item_name} × ${boundedProcessQty}개를 반품합니다.`}
        </span>
      </ConfirmModal>
    </div>
  );
}

function ActionRow({
  label,
  color,
  selected,
  onClick,
}: {
  label: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center rounded-[12px] border px-4 py-3 text-left transition-[transform] active:scale-[0.99]"
      style={{
        background: selected ? tint(color, 8) : LEGACY_COLORS.s2,
        borderColor: selected ? color : LEGACY_COLORS.border,
        borderWidth: 2,
      }}
    >
      <span className="text-base font-bold" style={{ color: selected ? color : LEGACY_COLORS.text }}>
        {label}
      </span>
    </button>
  );
}
