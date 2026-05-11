"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardCheck, PackageCheck, Save } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { api, type IoLine, type IoSourceKind, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { WizardStepCard } from "./_atoms";
import { IoWorkTypeStep, IoSubTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { IO_WORK_TYPES, requiresApproval, requiresDepartments, subTypeLabel } from "./ioWorkType";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { useIoWorkState, type IoStep } from "./useIoWorkState";
import type { IoComposeViewProps } from "./types";

function locationQuantity(item: Item, department: string | null | undefined, status: "PRODUCTION" | "DEFECTIVE") {
  if (!department) return 0;
  return item.locations.find((loc) => loc.department === department && loc.status === status)?.quantity ?? 0;
}

function workTypeLabel(workType: IoWorkType) {
  return IO_WORK_TYPES.find((row) => row.id === workType)?.label ?? workType;
}

export function IoComposeView({
  globalSearch,
  operator,
  items,
  packages,
  productModels = [],
  setItems,
  preselectedItem,
  restoreDraft: draftToRestore,
  onStatusChange,
  onSubmitSuccess,
}: IoComposeViewProps) {
  const [employeeId, setEmployeeId] = useState(operator?.employee_id ?? "");
  const [search, setSearch] = useState(globalSearch);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  const preselectedHandledRef = useRef<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);

  const state = useIoWorkState(operator?.department);
  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft } = useIoDraft();
  const { submitting, submit } = useIoSubmit();

  useEffect(() => {
    if (operator?.employee_id && !employeeId) setEmployeeId(operator.employee_id);
  }, [operator?.employee_id, employeeId]);

  useEffect(() => {
    setSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    if (!draftToRestore) return;
    if (restoredDraftRef.current === draftToRestore.batch_id) return;
    restoredDraftRef.current = draftToRestore.batch_id;
    state.setWorkType(draftToRestore.work_type);
    state.setSubType(draftToRestore.sub_type);
    state.setFromDepartment(draftToRestore.from_department || state.fromDepartment);
    state.setToDepartment(draftToRestore.to_department || state.toDepartment);
    state.setReferenceNo(draftToRestore.reference_no || "");
    state.setNotes(draftToRestore.notes || "");
    state.setBundles(draftToRestore.bundles);
    state.goTo(4);
    onStatusChange("임시저장 작업을 불러왔습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id]);

  async function addItem(item: Item, sourceKind: IoSourceKind = "direct_item") {
    setError(null);
    try {
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        target: { source_kind: sourceKind, item_id: item.item_id, quantity: 1 },
      });
      state.setBundles((prev) => [...prev, ...response.bundles]);
      onStatusChange(`${item.item_name} 작업 묶음 생성`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전개에 실패했습니다.");
    }
  }

  async function addPackage(pkg: (typeof packages)[number]) {
    setError(null);
    try {
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: "ship",
        fromDepartment: null,
        toDepartment: null,
        target: { source_kind: "ship_package", package_id: pkg.package_id, quantity: 1 },
      });
      state.setBundles((prev) => [...prev, ...response.bundles]);
      onStatusChange(`${pkg.name} 패키지 전개`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "패키지 전개에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (!preselectedItem) return;
    if (preselectedHandledRef.current === preselectedItem.item_id) return;
    preselectedHandledRef.current = preselectedItem.item_id;
    void addItem(preselectedItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedItem?.item_id]);

  function getAvailable(line: IoLine) {
    const item = items.find((row) => row.item_id === line.item_id);
    if (!item || line.from_bucket === "none") return null;
    if (line.from_bucket === "warehouse") {
      return Math.max(0, (item.warehouse_qty || 0) - (item.pending_quantity || 0));
    }
    if (line.from_bucket === "production") {
      return locationQuantity(item, line.from_department, "PRODUCTION");
    }
    if (line.from_bucket === "defective") {
      return locationQuantity(item, line.from_department, "DEFECTIVE");
    }
    return null;
  }

  function changeFromDepartment(next: string) {
    state.setFromDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function changeToDepartment(next: string) {
    state.setToDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function handleSubTypeChange(next: IoSubType) {
    state.setSubType(next);
    state.setBundles([]);
    if (next === "ship") state.setWorkType("ship");
  }

  function handleWorkTypeChange(next: IoWorkType) {
    state.setWorkType(next);
    setError(null);
    state.goTo(2);
  }

  async function handleSaveDraft() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    try {
      await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles: state.bundles,
      });
      setResult({ kind: "success", title: "임시저장 완료", message: "현재 작업 묶음이 저장되었습니다." });
    } catch (err) {
      const message = err instanceof ApiError && err.isUnavailable
        ? "서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요."
        : err instanceof Error ? err.message : "임시저장 중 오류가 발생했습니다.";
      setResult({ kind: "error", title: "임시저장 실패", message });
    }
  }

  async function handleSubmit() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    try {
      const response = await submit({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles: state.bundles,
      });
      // 서버가 멱등 응답(409 → 기존 batch)이든 신규 처리든 동일한 IoSubmitResponse 모양 → 같은 흐름
      setResult({
        kind: "success",
        title: response.requires_approval ? "승인 요청 완료" : "입출고 반영 완료",
        message: response.message,
      });
      state.reset();
      onStatusChange(response.message);
      try {
        const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
        setItems(refreshed);
      } catch {
        /* ignore refresh failure */
      }
      onSubmitSuccess?.();
    } catch (err) {
      // 503 과부하 → 친화 메시지 + 같은 client_request_id 유지(useIoSubmit)로 재시도 안전
      const message = err instanceof ApiError && err.isUnavailable
        ? "서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요."
        : err instanceof Error ? err.message : "제출 중 오류가 발생했습니다.";
      setResult({ kind: "error", title: "제출 실패", message });
    }
  }

  const step = state.step;
  const subTypeText = subTypeLabel(state.subType);
  const dept = requiresDepartments(state.subType)
    ? `${state.fromDepartment} → ${state.toDepartment}`
    : "부서 무관";
  const includedCount = state.includedLines.length;
  const excludedCount = state.excludedLines.length;
  const lineCount = state.bundles.reduce((acc, b) => acc + b.lines.length, 0);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);
  const stepState = (n: IoStep): "active" | "complete" | "locked" =>
    step === n ? "active" : step > n ? "complete" : "locked";
  const accent = LEGACY_COLORS.blue;

  // step 변경 시 직전(step-1) 카드를 viewport top으로 스크롤 → 그 아래 active step 카드가 자연스럽게 노출
  const stepRefs = useRef<Partial<Record<IoStep, HTMLDivElement | null>>>({});
  // 마지막으로 스크롤 처리한 step — null 이면 아직 마운트만 됨 (첫 마운트는 무조건 skip)
  const lastScrolledStepRef = useRef<IoStep | null>(null);
  useEffect(() => {
    const el = stepRefs.current[step];
    if (!el) return;
    // 외부 overflow 컨테이너 찾기
    let container: HTMLElement | null = el.parentElement;
    while (container) {
      const s = window.getComputedStyle(container);
      if (s.overflowY === "auto" || s.overflowY === "scroll") break;
      container = container.parentElement;
    }
    // 스크롤 — 첫 마운트 또는 동일 step 재실행(strict mode 등) 시 skip
    const prev = lastScrolledStepRef.current;
    lastScrolledStepRef.current = step;
    if (prev === null || prev === step) return;
    const timer = setTimeout(() => {
      if (step === 1) {
        // step 1 로 돌아간 경우 페이지 최상단 (외부 "입출고 작업" 헤더 + 탭 다시 보이게)
        container?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        // step 2 이후 — 직전(step-1) 카드 위 여백 = gap-3 (12px) - active 테두리 추가 두께(2px) 보정
        const targetStep = (step - 1) as IoStep;
        const targetEl = stepRefs.current[targetStep];
        if (container && targetEl) {
          const offset = targetEl.offsetTop - container.offsetTop - 10;
          container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          className="rounded-[12px] border px-4 py-3 text-sm font-bold"
          style={{
            background: tint(LEGACY_COLORS.red, 10),
            borderColor: tint(LEGACY_COLORS.red, 30),
            color: LEGACY_COLORS.red,
          }}
        >
          {error}
        </div>
      )}

      <div
        ref={(el) => { stepRefs.current[1] = el; }}
        className={`flex flex-col${step === 1 ? " min-h-screen" : ""}`}
      >
        <WizardStepCard
          n={1}
          title="작업 유형을 선택하세요"
          state={stepState(1)}
          summary={workTypeLabel(state.workType)}
          onChange={() => state.goTo(1)}
          accent={accent}
        >
          <IoWorkTypeStep workType={state.workType} operator={operator} onWorkTypeChange={handleWorkTypeChange} />
        </WizardStepCard>
      </div>

      {step >= 2 && (
        <div
          ref={(el) => { stepRefs.current[2] = el; }}
          className={`flex flex-col${step === 2 ? " min-h-screen" : ""}`}
        >
          <WizardStepCard
            n={2}
            title="세부 작업과 부서를 정하세요"
            state={stepState(2)}
            summary={`${subTypeText} · ${dept}`}
            onChange={() => state.goTo(2)}
            accent={accent}
          >
            <IoSubTypeStep
              workType={state.workType}
              subType={state.subType}
              fromDepartment={state.fromDepartment}
              toDepartment={state.toDepartment}
              onSubTypeChange={handleSubTypeChange}
              onFromDepartmentChange={changeFromDepartment}
              onToDepartmentChange={changeToDepartment}
            />
            <NavFooter step={2} canAdvance={state.canAdvance[2]} onPrev={state.goPrev} onNext={state.goNext} />
          </WizardStepCard>
        </div>
      )}

      {step >= 3 && (
        <div
          ref={(el) => { stepRefs.current[3] = el; }}
          className={`flex flex-col${step === 3 ? " min-h-screen" : ""}`}
        >
          <WizardStepCard
            n={3}
            title="대상을 선택하세요"
            state={stepState(3)}
            summary={`${state.bundles.length}개 묶음 · 라인 ${lineCount}개`}
            onChange={() => state.goTo(3)}
            accent={accent}
          >
            <IoTargetPicker
              workType={state.workType}
              items={items}
              packages={packages}
              productModels={productModels}
              bundles={state.bundles}
              search={search}
              onSearchChange={setSearch}
              onAddItem={addItem}
              onAddPackage={addPackage}
              busy={previewing}
            />
            <NavFooter
              step={3}
              canAdvance={state.canAdvance[3]}
              onPrev={state.goPrev}
              onNext={state.goNext}
              onSaveDraft={handleSaveDraft}
              savingDraft={drafting}
            />
          </WizardStepCard>
        </div>
      )}

      {step >= 4 && (
        <div
          ref={(el) => { stepRefs.current[4] = el; }}
          className={`flex flex-col${step === 4 ? " min-h-screen" : ""}`}
        >
          <WizardStepCard
            n={4}
            title="실제 반영 품목을 확인하세요"
            state={stepState(4)}
            summary={`반영 ${includedCount}개 · 제외 ${excludedCount}개`}
            onChange={() => state.goTo(4)}
            accent={accent}
          >
            <IoBundleCart
              bundles={state.bundles}
              itemMap={itemMap}
              getAvailable={getAvailable}
              onToggleLine={(bundleId, lineId) =>
                state.updateLine(bundleId, lineId, (line) => ({
                  ...line,
                  included: !line.included,
                  shortage: line.included
                    ? 0
                    : Math.max(0, line.quantity - (getAvailable(line) ?? line.quantity)),
                  exclusion_note:
                    line.included && state.subType === "disassemble" && line.origin === "bom_auto"
                      ? "회수 안 됨"
                      : line.included
                      ? "이번 작업 제외"
                      : null,
                }))
              }
              onQuantityChange={(bundleId, lineId, quantity, shortage) =>
                state.updateLine(bundleId, lineId, (line) => ({
                  ...line,
                  quantity,
                  shortage,
                  edited:
                    line.bom_expected !== null
                      ? Math.abs(quantity - line.bom_expected) > 0.0001
                      : line.origin === "manual" || line.edited,
                }))
              }
              onRemoveLine={state.removeLine}
              onRemoveBundle={(bundleId) =>
                state.setBundles((prev) => prev.filter((bundle) => bundle.bundle_id !== bundleId))
              }
            />
            <NavFooter
              step={4}
              canAdvance={state.canAdvance[4]}
              onPrev={state.goPrev}
              onNext={state.goNext}
              onSaveDraft={handleSaveDraft}
              savingDraft={drafting}
            />
          </WizardStepCard>
        </div>
      )}

      {step >= 5 && (
        <div
          ref={(el) => { stepRefs.current[5] = el; }}
          className={`flex flex-col${step === 5 ? " min-h-screen" : ""}`}
        >
          <WizardStepCard
            n={5}
            title="제출 전 마지막 확인"
            state={stepState(5)}
            summary="제출 준비 완료"
            accent={accent}
          >
            <IoConfirmStep
              subType={state.subType}
              bundles={state.bundles}
              notes={state.notes}
              referenceNo={state.referenceNo}
              hasShortage={state.hasShortage}
              hasInvalidQuantity={state.hasInvalidQuantity}
              submitting={submitting || drafting}
              approval={requiresApproval(state.subType)}
              onNotesChange={state.setNotes}
              onReferenceChange={state.setReferenceNo}
              onSaveDraft={handleSaveDraft}
              onSubmit={handleSubmit}
              onPrev={state.goPrev}
            />
          </WizardStepCard>
        </div>
      )}

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
    </div>
  );
}

/* ---- 보조 (한 화면 전용 inline) ---- */

function NavFooter({
  step,
  canAdvance,
  onPrev,
  onNext,
  onSaveDraft,
  savingDraft = false,
}: {
  step: IoStep;
  canAdvance: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSaveDraft?: () => void | Promise<void>;
  savingDraft?: boolean;
}) {
  const nextLabel =
    step === 4 ? (
      <>
        <ClipboardCheck className="h-4 w-4" />
        제출 확인으로 →
      </>
    ) : step === 3 ? (
      <>
        <PackageCheck className="h-4 w-4" />
        실제 반영 보기 →
      </>
    ) : (
      <>
        다음 단계 →
      </>
    );
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4" style={{ borderColor: LEGACY_COLORS.border }}>
      <button
        type="button"
        onClick={onPrev}
        disabled={step === 1}
        className="flex items-center gap-1.5 rounded-[14px] border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        이전
      </button>
      <div className="flex items-center gap-2">
        {onSaveDraft && (
          <button
            type="button"
            onClick={() => void onSaveDraft()}
            disabled={savingDraft}
            className="flex items-center gap-1.5 rounded-[14px] border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            style={{
              background: LEGACY_COLORS.s2,
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.text,
            }}
          >
            <Save className="h-4 w-4" />
            임시저장
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="flex items-center gap-1.5 rounded-[14px] px-6 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-40"
          style={{ background: LEGACY_COLORS.blue }}
        >
          {nextLabel}
          {step !== 3 && step !== 4 && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
