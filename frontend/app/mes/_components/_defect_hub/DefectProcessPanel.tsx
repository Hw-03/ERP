"use client";
import { useDesktopWorkGuard } from "../DesktopTabHome";

import { useEffect, useRef, useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { formatQty } from "@/lib/mes/format";
import { defectsApi } from "@/lib/api/defects";
import { defectLocationId, defectSource } from "@/lib/api/defect-source";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { DefectLocation } from "@/lib/api/types/defects";
import type { Department } from "@/lib/api/types/shared";
import { DisassembleTree, toServerDecision, validateDecisionTree, type ChildDecision } from "./DisassembleTree";
import { InlineErrorNote } from "./InlineErrorNote";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { ReasonFormFields } from "./ReasonFormFields";
import { hasDefectReason } from "./defectCartValidation";
import { QuantityInput } from "../common/QuantityInput";
import { makeClientRequestId } from "@/lib/uuid";
import { ApiError } from "@/lib/api-core";
import type { Supplier } from "@/lib/api";
import { SupplierPickerStep } from "../_warehouse_v2/SupplierPickerStep";
import { DefectQuantitySummary } from "./DefectQuantitySummary";
import stepperStyles from "./DefectFlowStepper.module.css";
import processStyles from "./DefectProcessPanel.module.css";

type ProcessAction = "unquarantine" | "scrap" | "return" | "disassemble";

interface Props {
  location?: DefectLocation;
  locations?: DefectLocation[];
  batchMode?: boolean;
  restoreOnly?: boolean;
  currentEmployee: { employee_id: string; name: string; department: string };
  onDone: () => void;
  onCancel: () => void;
  onInvalidated?: (message: string) => void;
}

export function DefectProcessPanel({
  location: singleLocation,
  locations: selectedLocations,
  batchMode = false,
  restoreOnly = false,
  currentEmployee,
  onDone,
  onCancel,
  onInvalidated,
}: Props) {
  const processingLocations = selectedLocations?.length
    ? selectedLocations
    : singleLocation
      ? [singleLocation]
      : [];
  const location = processingLocations[0];
  if (!location) throw new Error("처리할 불량 격리 기록이 필요합니다.");
  const isBatch = batchMode || processingLocations.length > 1;
  const canReturn = processingLocations.every((current) => current.department === "창고" || current.department === "튜브");
  const supplierScope = location.return_supplier_scope ?? "warehouse";
  const mixedSupplierScopes = processingLocations.some((current) => (current.return_supplier_scope ?? "warehouse") !== supplierScope);
  const mixedScopeMessage = "창고와 튜브 업체가 필요한 기록을 나누어 반품하세요.";

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [action, setAction] = useState<ProcessAction>("unquarantine");
  const [lastFollowupLabel, setLastFollowupLabel] = useState("BOM 확인");
  const availableQty = Math.max(
    1,
    processingLocations.reduce(
      (total, current) => total + (Number(current.available_quantity) || 0),
      0,
    ),
  );
  const [processQty, setProcessQty] = useState<number>(availableQty);
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const hasReason = action === "unquarantine" || hasDefectReason(category, memo);
  const [decisions, setDecisions] = useState<ChildDecision[]>([]);
  const [decisionParentQty, setDecisionParentQty] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierListReady, setSupplierListReady] = useState(false);
  useDesktopWorkGuard("defect-process", processQty !== availableQty || !!category || !!memo || decisions.length > 0 || selectedSupplier !== null, busy);
  const locationIdentity = processingLocations.map(defectLocationId).join(":");
  const locationIdentityRef = useRef(locationIdentity);
  const batchRequestIdsRef = useRef<Partial<Record<ProcessAction, string>>>({});
  const batchSnapshot = processingLocations.map((current) =>
    `${defectLocationId(current)}:${current.available_quantity}:${current.pending_quantity}`,
  ).join("|");
  const batchSnapshotRef = useRef(batchSnapshot);
  const batchInvalidatedRef = useRef(false);
  const maxQty = availableQty;
  const boundedProcessQty = Math.max(1, Math.min(maxQty, processQty));

  useEffect(() => {
    if (!isBatch || busy || batchInvalidatedRef.current || batchSnapshotRef.current === batchSnapshot) return;
    batchInvalidatedRef.current = true;
    setConfirmOpen(false);
    setSelectedSupplier(null);
    setSupplierListReady(false);
    onInvalidated?.("선택한 기록의 수량 또는 처리 대기 상태가 변경되었습니다.");
  }, [batchSnapshot, busy, isBatch, onInvalidated]);

  useEffect(() => {
    if (locationIdentityRef.current === locationIdentity) return;
    locationIdentityRef.current = locationIdentity;
    setStep(1);
    setAction("unquarantine");
    setProcessQty(availableQty);
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
    batchRequestIdsRef.current = {};
  }, [locationIdentity, availableQty]);

  useEffect(() => {
    const freshMax = availableQty;
    setProcessQty((currentQty) => isBatch ? freshMax : Math.max(1, Math.min(freshMax, currentQty)));
  }, [availableQty, isBatch]);

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
  }, [supplierScope, mixedSupplierScopes]);

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
    if (busy || !hasReason || (action === "disassemble" && !reworkReady) || (action === "return" && (!canReturn || mixedSupplierScopes || !supplierListReady || !selectedSupplier || (selectedSupplier.scope ?? "warehouse") !== supplierScope))) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const batchClientRequestId = isBatch
        ? batchRequestIdsRef.current[action]
          ?? (batchRequestIdsRef.current[action] = `defect-batch:${makeClientRequestId()}`)
        : undefined;
      if (action === "unquarantine") {
        if (isBatch) {
          await defectsApi.unquarantineBulk({
            actor_employee_id: currentEmployee.employee_id,
            reason_category: null,
            reason_category_id: null,
            reason_memo: memo || null,
            lines: processingLocations.map((current) => ({
              ...defectSource(current),
              item_id: current.item_id,
              department: current.department,
              quantity: Number(current.available_quantity),
            })),
          });
        } else {
          await defectsApi.unquarantine({
            ...defectSource(location),
            item_id: location.item_id,
            qty: boundedProcessQty,
            dept: location.department,
            reason_category: null,
            reason_category_id: null,
            reason_memo: memo || null,
            actor_employee_id: currentEmployee.employee_id,
          });
        }
      } else if (action === "scrap") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          client_request_id: batchClientRequestId,
          request_type: "defect_scrap",
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          notes: memo || null,
          lines: processingLocations.map((current) => ({
            ...defectSource(current),
            item_id: current.item_id,
            quantity: isBatch ? Number(current.available_quantity) : boundedProcessQty,
            from_bucket: "defective" as const,
            from_department: current.department as Department,
            to_bucket: "none" as const,
          })),
        });
      } else if (action === "return") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          client_request_id: batchClientRequestId,
          request_type: "defect_return",
          supplier_id: selectedSupplier!.supplier_id,
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          notes: memo || null,
          lines: processingLocations.map((current) => ({
            ...defectSource(current),
            item_id: current.item_id,
            quantity: isBatch ? Number(current.available_quantity) : boundedProcessQty,
            from_bucket: "defective" as const,
            from_department: current.department as Department,
            to_bucket: "none" as const,
          })),
        });
      } else {
        const childDecisions = decisions.map(toServerDecision);
        await stockRequestsApi.createStockRequest({
          requester_employee_id: currentEmployee.employee_id,
          client_request_id: batchClientRequestId,
          request_type: "defect_disassemble",
          reason_category: category || null,
          reason_category_id: categoryId,
          reason_memo: memo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines: processingLocations.map((current) => ({
            ...defectSource(current),
            item_id: current.item_id,
            quantity: isBatch ? Number(current.available_quantity) : boundedProcessQty,
            from_bucket: "defective" as const,
            from_department: current.department as Department,
            to_bucket: "none" as const,
          })),
        });
      }
      onDone();
    } catch (err: unknown) {
      if (isBatch && err instanceof ApiError && (err.status === 422 || err.status === 409) && onInvalidated) {
        setConfirmOpen(false);
        onInvalidated(err.message);
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const formatDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "-");
  const quantitySummary = <DefectQuantitySummary availableLabel="격리 가용 재고"
    available={processingLocations.reduce((total, current) => total + (Number(current.available_quantity) || 0), 0)}
    total={boundedProcessQty} count={processingLocations.length} countLabel="격리 기록" unit="개" />;
  const nextStepLabel = restoreOnly ? null : action === "return" ? "공급업체 선택" : action === "disassemble" && location.has_bom ? "BOM 확인" : null;
  useEffect(() => {
    if (nextStepLabel) setLastFollowupLabel(nextStepLabel);
  }, [nextStepLabel]);
  const processHeader = <>
    <h2 className="sr-only">{step === 3 ? "반품 공급업체 선택" : isBatch ? "불량 여러 건 처리" : "불량 처리"}</h2>
    <nav aria-label="불량 처리 단계" className={`iwp mb-3 shrink-0 ${stepperStyles.root} ${processStyles.stepper}`}>
      <div className={processStyles.primaryStep}><button type="button" className={`iwpb done ${processStyles.stepButton}`} disabled={busy} onClick={onCancel}><span className="iwpl">격리 목록</span></button></div>
      <div className={processStyles.primaryStep}><button type="button" className={`iwpb ${step === 1 ? "a" : "done"} ${processStyles.stepButton}`} disabled={busy || step === 1} aria-current={step === 1 ? "step" : undefined} onClick={() => setStep(1)}><span className="iwpl">처리 선택</span></button></div>
      <div className={`${processStyles.followup} ${nextStepLabel ? processStyles.followupShown : ""}`} aria-hidden={!nextStepLabel} inert={!nextStepLabel}>
        <button type="button" className={`iwpb ${step === 1 ? "locked" : "a"} ${processStyles.stepButton}`} disabled aria-current={step !== 1 && nextStepLabel ? "step" : undefined}><span className="iwpl">{nextStepLabel ?? lastFollowupLabel}</span></button>
      </div>
    </nav>
  </>;

  if (step === 3) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {processHeader}
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="break-words text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>{location.item_name}</div>
            <div className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>{location.mes_code}</div>
          </div>
          {quantitySummary}
        </div>
        <div className="min-h-0 flex-1">
          {mixedSupplierScopes ? <InlineErrorNote>{mixedScopeMessage}</InlineErrorNote> : <SupplierPickerStep
            employeeId={currentEmployee.employee_id}
            selectedSupplierId={selectedSupplier?.supplier_id ?? null}
            selectedSupplierName={selectedSupplier?.name ?? null}
            onSelect={setSelectedSupplier}
            onLoadStateChange={setSupplierListReady}
            variant="desktop"
            mode="select"
            supplierScope={supplierScope}
          />}
        </div>
        <div className="flex shrink-0 justify-end pt-1">
          <button
            type="button"
            disabled={busy || !canReturn || mixedSupplierScopes || !supplierListReady || !selectedSupplier}
            onClick={() => setConfirmOpen(true)}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white disabled:opacity-40"
            style={{ background: LEGACY_COLORS.blueSolid }}
          >
            반품 확인
          </button>
        </div>
        <ConfirmModal
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
            {location.item_name} × {boundedProcessQty}개{isBatch ? ` (${processingLocations.length}건)` : ""}를 {selectedSupplier?.name}에 반품합니다.
          </span>
        </ConfirmModal>
      </div>
    );
  }

  // Step 2: BOM 확인 (재작업)
  if (step === 2) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        {processHeader}

        {/* 스크롤 영역 */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          {/* 요약 박스 */}
          {quantitySummary}
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
                {isBatch ? (
                  <span className="text-xl font-black" style={{ color: LEGACY_COLORS.blue }}>{formatQty(boundedProcessQty)}개</span>
                ) : (
                  <QuantityInput
                    min={1}
                    max={maxQty}
                    value={boundedProcessQty}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(maxQty, Number(e.target.value) || 1));
                      setProcessQty(v);
                      setDecisions([]);
                    }}
                    className="w-24 rounded-[10px] border px-3 py-2 text-base font-black"
                    style={{ borderColor: tint(LEGACY_COLORS.blue, 35), background: LEGACY_COLORS.s1, color: LEGACY_COLORS.blue }}
                  />
                )}
                <span className="text-sm font-bold" style={{ color: LEGACY_COLORS.muted2 }}>/ 처리 가능 {formatQty(maxQty)}개</span>
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
                parentMesCode={location.mes_code ?? ""}
                parentQty={boundedProcessQty}
                parentDept={location.department}
                decisions={decisions}
                onChange={handleDecisionsChange}
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
            style={{ background: LEGACY_COLORS.yellowSolid }}
          >
            {busy ? "처리 중..." : "최종 처리 →"}
          </button>
        </div>

        <ConfirmModal
          open={confirmOpen}
          title="재작업 확인"
          tone="danger"
          cautionMessage="확인하면 즉시 재고에 반영됩니다."
          confirmLabel="즉시 재작업"
          busy={busy}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
        >
          <span style={{ color: LEGACY_COLORS.text }}>{location.item_name} × {boundedProcessQty}개{isBatch ? ` (${processingLocations.length}건)` : ""}를 재작업합니다.</span>
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
      {processHeader}

      {/* 스크롤 영역 */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {/* 품목 정보 */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-[16px] border px-6 py-5"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="break-words text-2xl font-black" style={{ color: LEGACY_COLORS.text }}>{location.item_name}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold" style={{ color: LEGACY_COLORS.muted }}>
              {isBatch && <span style={{ color: LEGACY_COLORS.blue }}>선택한 격리 기록 {processingLocations.length}건</span>}
              <span style={{ color: LEGACY_COLORS.muted2 }}>{location.mes_code}</span>
              <span>부서 <span style={{ color: LEGACY_COLORS.text }}>{location.department}</span></span>
              <span>격리일 <span style={{ color: LEGACY_COLORS.text }}>{formatDate(location.defective_at)}</span></span>
            </div>
          </div>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-5">
            <div className="flex min-h-11 shrink-0 items-center gap-3">
              <span className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>처리 수량</span>
              {isBatch ? (
                <span className="text-xl font-black" style={{ color: LEGACY_COLORS.text }}>{formatQty(boundedProcessQty)}개</span>
              ) : (
                <QuantityInput
                  aria-label="처리 수량"
                  min={1}
                  max={maxQty}
                  value={boundedProcessQty}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(maxQty, Number(e.target.value) || 1));
                    setProcessQty(v);
                    setDecisions([]);
                  }}
                  className="w-28 rounded-[10px] border px-3 py-2.5 text-base font-black"
                  style={{ borderColor: LEGACY_COLORS.border, background: LEGACY_COLORS.s2, color: LEGACY_COLORS.text }}
                />
              )}
            </div>
            {quantitySummary}
          </div>
        </div>

        {/* 작업 선택 */}
        <div className="flex flex-col gap-3">
          <span className="text-sm font-black" style={{ color: LEGACY_COLORS.muted2 }}>작업 선택</span>
          <div className={`grid grid-cols-1 gap-3 ${restoreOnly ? "" : location.has_bom && canReturn ? "sm:grid-cols-2 xl:grid-cols-4" : location.has_bom || canReturn ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            <ActionCard
              label="정상 복귀"
              desc="불량 해제 후 정상 재고로"
              color={LEGACY_COLORS.green}
              selected={action === "unquarantine"}
              onClick={() => setAction("unquarantine")}
            />
            {!restoreOnly && location.has_bom && (
              <ActionCard
                label="재작업"
                desc="즉시 BOM 재작업 처리"
                color={LEGACY_COLORS.yellow}
                selected={action === "disassemble"}
                onClick={() => setAction("disassemble")}
              />
            )}
            {!restoreOnly && <ActionCard
              label="전체 폐기"
              desc="즉시 격리 재고 차감"
              color={LEGACY_COLORS.red}
              selected={action === "scrap"}
              onClick={() => setAction("scrap")}
            />}
            {!restoreOnly && canReturn && (
              <ActionCard
                label="반품"
                desc="즉시 반품 처리"
                color={LEGACY_COLORS.muted2}
                selected={action === "return"}
                onClick={() => setAction("return")}
              />
            )}
          </div>
        </div>

        <ReasonFormFields
          employeeId={currentEmployee.employee_id}
          category={category}
          categoryId={categoryId}
          memo={memo}
          onCategoryChange={(name, id) => { setCategory(name); setCategoryId(id ?? null); }}
          onMemoChange={setMemo}
          required
          showCategory={action !== "unquarantine"}
          animateCategory
        />

        {action === "return" && mixedSupplierScopes && <InlineErrorNote>{mixedScopeMessage}</InlineErrorNote>}
        {errorMsg && <InlineErrorNote>{errorMsg}</InlineErrorNote>}
      </div>

      {/* 하단 */}
      <div className="flex shrink-0 items-center justify-end gap-3 pt-4">
        {action === "disassemble" ? (
          <button
            type="button"
            disabled={busy || !hasReason}
            onClick={() => setStep(2)}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: LEGACY_COLORS.yellowSolid }}
          >
            다음 →
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !hasReason || (action === "return" && (!canReturn || mixedSupplierScopes))}
            onClick={() => action === "return" ? setStep(3) : setConfirmOpen(true)}
            className="rounded-[16px] px-8 py-3 text-base font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
            style={{ background: actionColor[action] }}
          >
            {busy ? "처리 중..." : action === "unquarantine" ? "정상 복귀 →" : action === "scrap" ? "즉시 폐기 →" : "공급업체 선택 →"}
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={action === "unquarantine" ? "정상 복귀 확인" : action === "scrap" ? "폐기 확인" : "반품 확인"}
        tone="danger"
        cautionMessage={action === "unquarantine" ? "이 작업은 즉시 반영됩니다." : "확인하면 즉시 재고에 반영됩니다."}
        confirmLabel={action === "unquarantine" ? "즉시 복귀" : action === "scrap" ? "즉시 폐기" : "즉시 반품"}
        busy={busy}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); void handleSubmit(); }}
      >
        <span style={{ color: LEGACY_COLORS.text }}>
          {action === "unquarantine"
            ? `${location.item_name} × ${boundedProcessQty}개${isBatch ? ` (${processingLocations.length}건)` : ""}를 정상 재고로 복귀합니다.`
            : action === "scrap"
            ? `${location.item_name} × ${boundedProcessQty}개${isBatch ? ` (${processingLocations.length}건)` : ""}를 폐기합니다.`
            : `${location.item_name} × ${boundedProcessQty}개${isBatch ? ` (${processingLocations.length}건)` : ""}를 반품합니다.`}
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
