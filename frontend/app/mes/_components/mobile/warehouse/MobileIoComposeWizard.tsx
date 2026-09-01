"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, ScanLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  api,
  type BOMDetailEntry,
  type IoBundle,
  type IoInternalUseBomMode,
  type IoLine,
  type IoSourceKind,
  type IoSourceLocation,
  type IoSubType,
  type IoWorkType,
  type Item,
} from "@/lib/api";
import { IconButton, PrimaryActionButton, StickyFooter, WizardProgress } from "../primitives";
import { BarcodeScannerModal } from "../../BarcodeScannerModal";
import { MobileWorkTypeStep, MobileSubTypeStep } from "./MobileWorkTypeStep";
import { MobileSingleAdjustForm } from "./MobileSingleAdjustForm";
import { IoTargetPicker } from "../../_warehouse_v2/IoTargetPicker";
import { IoBundleCart } from "../../_warehouse_v2/IoBundleCart";
import { IoConfirmStep } from "../../_warehouse_v2/IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "../../_warehouse_v2/IoSubmitModals";
import { StatusTargetNotice, useStatusTargetNotice } from "../../common/StatusTargetNotice";
import {
  IO_WORK_TYPES,
  approvalKind,
  ioDepartmentPayload,
  isExitWorkType,
  isSingleInlineSubType,
  mergePreviewBundles,
  pickerDirectionLabel,
  singleItemSourceKind,
  subTypeLabel,
  targetDepartmentOf,
  usesMobileSingleAdjustForm,
} from "../../_warehouse_v2/ioWorkType";
import {
  applyBundleQuantityChange,
  applyLineQuantityChange,
  applyToggleLine,
} from "../../_warehouse_v2/bomSync";
import { useIoDraftRestore } from "../../_warehouse_v2/useIoDraftRestore";
import { useIoDraft } from "../../_warehouse_v2/useIoDraft";
import { useIoPreview } from "../../_warehouse_v2/useIoPreview";
import { useIoSubmit } from "../../_warehouse_v2/useIoSubmit";
import { useIoWorkState, type IoStep } from "../../_warehouse_v2/useIoWorkState";
import {
  runWarehousePull,
  runCompositionSubmit,
  refreshInternalUseBundle,
  saveCompositionDraft,
  useIoComposeOperationState,
} from "../../_warehouse_v2/ioComposeOperations";
import {
  INITIAL_IO_TARGET_PICKER_FILTERS,
  type IoComposeViewProps,
  type IoTargetPickerFilters,
} from "../../_warehouse_v2/types";
import {
  collectShortageItemIds,
  shortageLines,
} from "../../_warehouse_v2/pullFromWarehouse";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import { ioLineAvailable } from "@/lib/mes/inventory";
import { setAuditScreen } from "@/lib/activity-audit-context";
import { sendClientEvent } from "@/lib/client-events";
import {
  buildInternalUseBomPreviewTarget,
  isInternalUseBomBundle,
} from "../../_warehouse_v2/internalUseBom";
import { useInternalUseBomPreviewLock } from "../../_warehouse_v2/useInternalUseBomPreviewLock";

const STEP_META: { key: string; label: string }[] = [
  { key: "1", label: "작업 유형" },
  { key: "2", label: "세부 작업" },
  { key: "3", label: "대상 선택" },
  { key: "4", label: "실제 반영" },
  { key: "5", label: "제출 확인" },
];

/**
 * 입출고 작성 — 모바일 풀스크린 단일 스텝 위저드.
 *
 * IoComposeView 의 데스크탑 레이아웃(WizardStepCard 스택 + useLayoutEffect
 * 강제 height + 사이드 스크롤)을 버리고, 한 번에 한 스텝만 풀스크린으로
 * 보여 393px 에서 잘림 없이 품목 선택까지 완료할 수 있게 한다.
 * 상태/제출/초안/BOM 로직은 IoComposeView 와 동일한 훅·순수함수를 그대로 호출
 * 한다(useIoWorkState 등은 warehouseFlow.golden 으로 고정 — 호출만).
 */
export function MobileIoComposeWizard({
  globalSearch,
  operator,
  items,
  productModels = [],
  setItems,
  preselectedItem,
  restoreDraft: draftToRestore,
  restoreNonce,
  restoreStep,
  defaultWorkType,
  entryIntent,
  onStatusChange,
  onSubmitSuccess,
  onDirtyChange,
  flushDraftRef,
  onStepChange,
  onDraftSaved,
}: IoComposeViewProps & {
  // 모바일 전용 — 섹션 탭 이탈 가드(D2)용. 데스크톱 IoComposeView 는 미사용.
  onDirtyChange?: (dirty: boolean) => void;
  flushDraftRef?: MutableRefObject<(() => Promise<void>) | null>;
  onStepChange?: (step: IoStep) => void;
}) {
  const revision = useRealtimeRevision();
  // 제출·임시저장·미리보기는 현재 로그인 작업자의 ID로만 수행한다.
  // 로컬 state로 보관하면 작업자 전환 뒤 이전 결재권자 ID가 남을 수 있다.
  const employeeId = operator?.employee_id ?? "";
  const [search, setSearch] = useState(globalSearch);
  const [pickerFilters, setPickerFilters] = useState<IoTargetPickerFilters>(
    INITIAL_IO_TARGET_PICKER_FILTERS,
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  const {
    notice: feedbackNotice,
    showNotice: showFeedbackNotice,
    dismissNotice: dismissFeedbackNotice,
  } = useStatusTargetNotice();
  const [bomParents, setBomParents] = useState<Set<string>>(() => new Set());
  const state = useIoWorkState(defaultWorkType, operator?.department, getAvailable);
  const [
    pullSelected,
    setPullSelected,
    togglePull,
    pulling,
    setPulling,
    pullingRef,
    operationRefs,
    bumpOperationGeneration,
  ] = useIoComposeOperationState([
    employeeId,
    operator?.department,
    state.bundles,
    state.deptIoDirection,
    state.fromDepartment,
    state.notes,
    state.referenceNo,
    state.step,
    state.subType,
    state.toDepartment,
    state.workType,
  ], draftToRestore?.batch_id, restoreNonce);
  // 가드 key 는 `${item_id}__${workType}` — workType 변경 시 bundles reset 되므로
  // 같은 preselectedItem 이라도 재적용되어야 한다.
  const preselectedHandledRef = useRef<string | null>(null);
  // BOM 부모 품목으로 진입한 경우 자동 추가하지 않고 picker 에서 row 만 강조.
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [processPickerMode, setProcessPickerMode] = useState(false);
  const previousAuditScreenRef = useRef<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);
  // 마지막으로 복원을 발동시킨 '이어서 하기' nonce — 같은 draft 재선택 재발동 판정용.
  const restoredNonceRef = useRef<number | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);

  const latestBundlesRef = useRef<IoBundle[]>(state.bundles);
  latestBundlesRef.current = state.bundles;
  const latestDraftFieldsRef = useRef({
    employeeId,
    workType: state.workType,
    subType: state.subType,
    fromDepartment: state.fromDepartment,
    toDepartment: state.toDepartment,
    referenceNo: state.referenceNo,
    notes: state.notes,
  });
  latestDraftFieldsRef.current = {
    employeeId,
    workType: state.workType,
    subType: state.subType,
    fromDepartment: state.fromDepartment,
    toDepartment: state.toDepartment,
    referenceNo: state.referenceNo,
    notes: state.notes,
  };
  const internalUsePreviewLock = useInternalUseBomPreviewLock();
  const intentAppliedRef = useRef(false);
  useEffect(() => {
    if (!entryIntent || intentAppliedRef.current) return;
    intentAppliedRef.current = true;
    state.setWorkType(entryIntent.workType);
    if (entryIntent.workType === "process" && entryIntent.direction) {
      state.setDeptIoDirection(entryIntent.direction);
    } else if (entryIntent.subType) {
      state.setSubType(entryIntent.subType);
    }
    state.goTo(3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent]);

  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft } = useIoDraft();
  const { submitting, run, submit } = useIoSubmit();

  useEffect(() => {
    setSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    let cancelled = false;
    api
      .getAllBOM()
      .then((rows: BOMDetailEntry[]) => {
        if (cancelled) return;
        setBomParents(new Set(rows.map((row) => row.parent_item_id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [revision]);

  useIoDraftRestore({
    draftToRestore,
    restoreNonce,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state,
    onStatusChange,
    restoreStep,
    getAvailable,
    inventorySnapshot: items,
  });

  useEffect(() => {
    if (draftToRestore?.batch_id) resetTargetPickerFilters();
  }, [draftToRestore?.batch_id, restoreNonce]);

  // 4단계 진입 시 재고 스냅샷 갱신 — 취소·승인 등으로 재고가 바뀐 뒤 재추가할 때 stale 표시 방지.
  useEffect(() => {
    if (state.step !== 4) return;
    api.getItems({ limit: 2000, search: globalSearch.trim() || undefined })
      .then(setItems)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, globalSearch]);

  // 작성 중(담은 묶음 있음) 여부를 상위(MobileWarehouseScreen)에 보고 — 섹션 이탈 가드용.
  useEffect(() => {
    onDirtyChange?.(state.bundles.length > 0);
  }, [state.bundles.length, onDirtyChange]);

  // 이탈 직전 상위가 draft autosave 를 즉시 flush 할 수 있게 핸들을 노출(700ms 디바운스
  // 창에서 마지막 변경이 유실되지 않도록). 매 렌더 최신 클로저로 갱신, 언마운트 시 해제.
  useEffect(() => {
    if (!flushDraftRef) return;
    flushDraftRef.current = async () => {
      try {
        await saveCurrentDraft();
      } catch (err) {
        const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
        showFeedbackNotice(message, "error");
        throw err;
      }
    };
    return () => {
      flushDraftRef.current = null;
    };
  });

  async function addItem(
    item: Item,
    sourceKind: IoSourceKind = "direct_item",
    subTypeOverride?: IoSubType,
    sourceLocation?: IoSourceLocation,
  ) {
    setError(null);
    const effectiveSubType = subTypeOverride ?? state.subType;
    if (subTypeOverride && subTypeOverride !== state.subType) {
      state.setSubType(subTypeOverride);
    }
    try {
      const departments = ioDepartmentPayload(
        effectiveSubType,
        state.fromDepartment,
        state.toDepartment,
      );
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: effectiveSubType,
        fromDepartment: departments.fromDepartment,
        toDepartment: departments.toDepartment,
        target: {
          source_kind: sourceKind,
          source_location: effectiveSubType === "internal_use_out" ? sourceLocation : undefined,
          item_id: item.item_id,
          quantity: 1,
        },
      });
      const newBundles = response.bundles;
      state.setBundles((prev) =>
        mergePreviewBundles(prev, item.item_id, sourceKind, effectiveSubType, newBundles),
      );
      if (isSingleInlineSubType(effectiveSubType)) {
        setSearch("");
      }
      onStatusChange(`${item.item_name} 작업 묶음 생성`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전개에 실패했습니다.");
    }
  }

  // 스캔값(mes_code) → 품목 매칭. 충돌 B: 인라인 폼과 공유하는 단일 핸들러.
  function handleScanDetected(raw: string) {
    const norm = raw.trim().toLowerCase();
    if (!norm) return;
    const matched = items.find((it) => (it.mes_code ?? "").trim().toLowerCase() === norm);
    if (!matched) {
      setSearch(raw.trim());
      setError("코드와 일치하는 품목이 없어 검색어로 채웠습니다.");
      return;
    }
    if (bomParents.has(matched.item_id)) {
      // BOM 부모: 자동 추가 대신 picker 에서 강조(BOM/낱개 분기를 사용자에게 남김).
      setHighlightItemId(matched.item_id);
      setSearch(matched.mes_code ?? raw);
    } else {
      setHighlightItemId(null);
      void addItem(matched);
    }
  }

  useEffect(() => {
    if (!preselectedItem) return;
    // workType 변경 시 bundles 가 reset 되므로 key 에 workType 포함.
    const handledKey = `${preselectedItem.item_id}__${state.workType}`;
    if (preselectedHandledRef.current === handledKey) return;
    if (state.workType === "process" && state.deptIoDirection == null) return;
    preselectedHandledRef.current = handledKey;
    if (bomParents.has(preselectedItem.item_id)) {
      // BOM 부모: 자동 카트 추가하지 않고 picker 에서 row 만 강조.
      setHighlightItemId(preselectedItem.item_id);
    } else {
      setHighlightItemId(null);
      void addItem(preselectedItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedItem?.item_id, state.workType, state.deptIoDirection, bomParents]);

  function getAvailable(line: IoLine): number | null {
    const item = items.find((row) => row.item_id === line.item_id);
    if (!item) return null;
    return ioLineAvailable(item, line);
  }

  async function refreshInternalUseBom(
    bundleId: string,
    options: Parameters<typeof buildInternalUseBomPreviewTarget>[1],
  ) {
    await refreshInternalUseBundle(
      bundleId,
      options,
      employeeId,
      state.workType,
      state.subType,
      state.fromDepartment,
      state.toDepartment,
      () => latestBundlesRef.current,
      internalUsePreviewLock.run,
      previewTarget,
      (nextBundles) => {
        latestBundlesRef.current = nextBundles;
        state.setBundles(nextBundles);
      },
      setError,
    );
  }

  // 부서/세부작업 변경 시 임시저장 슬롯을 끊어 새 슬롯으로 시작한다.
  // (안 하면 다음 저장이 이전 draft 를 덮어써 손실.)
  function beginNewCompositionSlot() {
    bumpOperationGeneration();
    setProcessPickerMode(false);
    autosaveBatchIdRef.current = null;
    // 새 작업 슬롯 — 복원 추적 해제. 같은 '이어서 작업' 재선택 시 재복원 보장.
    restoredDraftRef.current = null;
    restoredNonceRef.current = null;
    resetTargetPickerFilters();
  }

  function resetTargetPickerFilters() {
    setPickerFilters(INITIAL_IO_TARGET_PICKER_FILTERS);
    setSearch("");
  }

  function changeFromDepartment(next: string) {
    state.setFromDepartment(next);
    beginNewCompositionSlot();
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function changeToDepartment(next: string) {
    state.setToDepartment(next);
    beginNewCompositionSlot();
    if (state.bundles.length > 0) {
      state.setBundles([]);
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function handleSubTypeChange(next: IoSubType) {
    state.setSubType(next);
    beginNewCompositionSlot();
    state.setBundles([]);
  }

  function handleWorkTypeChange(next: IoWorkType) {
    state.setWorkType(next);
    setError(null);
    beginNewCompositionSlot();
    state.goTo(2);
  }

  async function saveCurrentDraft(persistInUrl = true): Promise<string | null> {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      throw new Error("작업자를 선택하세요.");
    }
    const batchId = await saveCompositionDraft(
      operationRefs,
      internalUsePreviewLock.waitForIdle,
      () => latestBundlesRef.current,
      (bundles) => saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        ...ioDepartmentPayload(state.subType, state.fromDepartment, state.toDepartment),
        referenceNo: state.referenceNo,
        notes: state.notes,
        batchId: autosaveBatchIdRef.current,
        bundles,
      }),
      (nextBatchId) => { autosaveBatchIdRef.current = nextBatchId; },
    );
    if (batchId && persistInUrl) {
      onDraftSaved?.(batchId, state.step);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      onStatusChange(`저장됨 · ${hh}:${mm}`);
    }
    return batchId;
  }

  async function handleSaveDraft() {
    try {
      const batchId = await saveCurrentDraft();
      if (!batchId) return;
      showFeedbackNotice("저장되었습니다. 나중에 이어서 진행할 수 있습니다.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
      showFeedbackNotice(message, "error");
    }
  }

  async function pullFromWarehouse() {
    if (pullingRef.current) return;
    if (!employeeId || !operator?.department) return;
    const itemIds = collectShortageItemIds(state.bundles, pullSelected);
    if (itemIds.length === 0) return;
    try {
      await runWarehousePull(
        operationRefs,
        pullingRef,
        setPulling,
        itemIds,
        () => saveCurrentDraft(false),
        async (itemId) => (await previewTarget({
          employeeId,
          workType: "warehouse_io",
          subType: "warehouse_to_dept",
          toDepartment: operator.department,
          target: { source_kind: "manual", item_id: itemId, quantity: 1 },
        })).bundles,
        (savedDraftId, newBundles) => {
          onDraftSaved?.(savedDraftId, state.step, false);
          state.setWorkType("warehouse_io");
          state.setSubType("warehouse_to_dept");
          state.setToDepartment(operator.department);
          beginNewCompositionSlot();
          state.setBundles(newBundles);
          setPullSelected(new Set());
          state.goTo(4);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "창고에서 가져오기에 실패했습니다.");
    }
  }

  async function handleSubmit() {
    await run(() => runCompositionSubmit(
      employeeId,
      state.subType,
      state.fromDepartment,
      internalUsePreviewLock.waitForIdle,
      () => latestBundlesRef.current,
      autosaveBatchIdRef,
      (bundles) => submit({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        ...ioDepartmentPayload(state.subType, state.fromDepartment, state.toDepartment),
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles,
      }),
      setError,
      state.goTo,
      setResult,
      state.reset,
      resetTargetPickerFilters,
      onStatusChange,
      () => api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
      setItems,
      onSubmitSuccess,
      (draftId) => api.submitDraft(draftId, employeeId),
      (draftId) => {
        restoredDraftRef.current = null;
        restoredNonceRef.current = null;
        onDraftSaved?.(draftId, state.step, false);
      },
      operationRefs,
      (bundles) => {
        const fields = latestDraftFieldsRef.current;
        return saveDraft({
          employeeId: fields.employeeId,
          workType: fields.workType,
          subType: fields.subType,
          ...ioDepartmentPayload(fields.subType, fields.fromDepartment, fields.toDepartment),
          referenceNo: fields.referenceNo,
          notes: fields.notes,
          batchId: autosaveBatchIdRef.current,
          bundles,
        });
      },
    ));
  }

  const step = state.step;
  const itemMap = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);

  useEffect(() => {
    const workTypeLabel = IO_WORK_TYPES.find((row) => row.id === state.workType)?.label ?? state.workType;
    const nextScreen = {
      key: `warehouse.io.${state.workType}.${state.subType}.step${step}`,
      label: `입출고 · ${workTypeLabel} · ${subTypeLabel(state.subType)} · ${STEP_META[step - 1]?.label ?? step}`,
    };
    const previousScreen = previousAuditScreenRef.current ?? "mobile.warehouse";
    setAuditScreen(nextScreen, { priority: "workflow" });
    if (previousScreen !== nextScreen.key) {
      sendClientEvent({
        event: "ui_nav",
        from: previousScreen,
        to: nextScreen.key,
        path: "/mes",
        screen_key: nextScreen.key,
        screen_label: nextScreen.label,
        source: "mobile",
      });
      previousAuditScreenRef.current = nextScreen.key;
    }
  }, [state.subType, state.workType, step]);

  useEffect(() => () => {
    setAuditScreen({ key: "mobile.warehouse", label: "입출고" }, { force: true });
  }, []);

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  const stepTitle =
    step === 1
      ? "작업 유형 선택"
      : step === 2
      ? state.workType === "warehouse_adjust"
        ? "입고·출고 방향 선택"
        : "세부 작업과 부서"
      : step === 3
      ? `${pickerDirectionLabel(state.subType)} 품목 선택`
      : step === 4
      ? "수량 조정"
      : "최종 확인";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      {/* 헤더: 뒤로 + 진행바. in-flow(non-scroll 첫 자식)라 셸 헤더 아래에 머물며 본문만
          스크롤된다. (이전 fixed top-0 는 셸 헤더 DEXCOWIN MES 를 덮는 버그였음)
          항목 6 — 페이지 배경과 같은 톤으로 두어 위 섹션 탭과 자연스럽게 이어지게(카드감 제거). */}
      <div
        className={`z-10 flex shrink-0 items-center gap-2 px-3 py-2 ${step === 5 ? "" : "border-b"}`}
        style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}
      >
        {step > 1 ? (
          <IconButton icon={ArrowLeft} label="이전 단계" size="md" onClick={state.goPrev} />
        ) : (
          <div className="h-11 w-11 shrink-0" aria-hidden />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2
            className="min-w-0 max-w-[132px] truncate text-sm font-black"
            style={{ color: LEGACY_COLORS.text }}
          >
            {stepTitle}
          </h2>
          <WizardProgress
            steps={STEP_META}
            current={step - 1}
            variant="inline"
            className="flex-1"
          />
        </div>
      </div>

      {/* 본문: 현재 스텝만 스크롤. 항목 5-4·5-5 — 하단 pb 축소해 sticky 푸터를 네비바에 근접. */}
      <div className="sg min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {error && (
          <div
            className="mb-3 rounded-[12px] border px-4 py-3 text-sm font-bold"
            style={{
              background: tint(LEGACY_COLORS.red, 10),
              borderColor: tint(LEGACY_COLORS.red, 30),
              color: LEGACY_COLORS.red,
            }}
          >
            {error}
          </div>
        )}

        {step === 1 && (
          <MobileWorkTypeStep
            workType={state.workType}
            operator={operator}
            onWorkTypeChange={handleWorkTypeChange}
          />
        )}

        {step === 2 && (
          <MobileSubTypeStep
            workType={state.workType}
            subType={state.subType}
            fromDepartment={state.fromDepartment}
            toDepartment={state.toDepartment}
            deptIoDirection={state.deptIoDirection}
            onSubTypeChange={handleSubTypeChange}
            onFromDepartmentChange={changeFromDepartment}
            onToDepartmentChange={changeToDepartment}
            onDeptIoDirectionChange={(dir) => {
              const had = state.bundles.length > 0;
              state.setDeptIoDirection(dir);
              beginNewCompositionSlot();
              if (had) onStatusChange("방향 변경으로 작업 묶음을 초기화했습니다.");
            }}
          />
        )}

        {step === 3 &&
          (usesMobileSingleAdjustForm(state.workType, state.subType, processPickerMode) ? (
            <MobileSingleAdjustForm
              subType={state.subType}
              items={items}
              bundles={state.bundles}
              search={search}
              onSearchChange={setSearch}
              onAddItem={(item) => addItem(item, singleItemSourceKind(state.subType))}
              onBundleQuantityChange={(bundleId, qty) =>
                state.setBundles((prev) =>
                  applyBundleQuantityChange(prev, bundleId, qty, state.subType, getAvailable),
                )
              }
              onRemoveBundle={(bundleId) =>
                state.setBundles((prev) => prev.filter((b) => b.bundle_id !== bundleId))
              }
              getAvailable={getAvailable}
              onScan={() => setScanOpen(true)}
              onSaveDraft={() => {
                void handleSaveDraft();
              }}
              saving={drafting}
              onReview={() => state.goTo(5)}
              onOpenPicker={state.workType === "process" ? () => setProcessPickerMode(true) : undefined}
              busy={previewing}
              error={error}
            />
          ) : (
            <>
              {/* 항목 8 — 스캔 시작 버튼은 당분간 UI에서 숨김(코드·핸들러 유지, hidden). */}
              <div className="mb-3 hidden">
                <PrimaryActionButton
                  label="스캔으로 시작"
                  icon={ScanLine}
                  onClick={() => setScanOpen(true)}
                />
              </div>
              <IoTargetPicker
                workType={state.workType}
                subType={state.subType}
                deptIoDirection={state.deptIoDirection}
                bundleSubType={state.bundles.length > 0 ? state.subType : null}
                bomParents={bomParents}
                targetDepartment={targetDepartmentOf(
                  state.subType,
                  state.fromDepartment,
                  state.toDepartment,
                )}
                items={items}
                productModels={productModels}
                bundles={state.bundles}
                filters={pickerFilters}
                onFiltersChange={setPickerFilters}
                search={search}
                onSearchChange={setSearch}
                highlightItemId={highlightItemId}
                onAddItem={(item, sourceKind, subTypeOverride, sourceLocation) =>
                  addItem(item, sourceKind ?? "direct_item", subTypeOverride, sourceLocation)
                }
                onRemoveBundles={(bundleIds) =>
                  state.setBundles((prev) => prev.filter((bundle) => !bundleIds.includes(bundle.bundle_id)))
                }
                onAdvance={() => {
                  if (state.bundles.length > 0) state.goTo(4);
                }}
                busy={previewing}
              />
            </>
          ))}

        {step === 4 && (
          <IoBundleCart
            bundles={state.bundles}
            subType={state.subType}
            itemMap={itemMap}
            getAvailable={getAvailable}
            pullEnabled={state.subType === "produce" || state.subType === "disassemble"}
            pullSelected={pullSelected}
            onTogglePull={togglePull}
            onPullFromWarehouse={pullFromWarehouse}
            pullCount={
              pullSelected.size > 0
                ? pullSelected.size
                : shortageLines(state.bundles).length
            }
            onToggleLine={(bundleId, lineId) => {
              const bundle = state.bundles.find((row) => row.bundle_id === bundleId);
              if (state.subType === "internal_use_out" && bundle && isInternalUseBomBundle(bundle)) {
                void refreshInternalUseBom(bundleId, { toggleLineId: lineId });
                return;
              }
              state.setBundles((prev) =>
                applyToggleLine(prev, bundleId, lineId, state.subType, getAvailable),
              );
            }}
            onQuantityChange={(bundleId, lineId, quantity, shortage) => {
              const bundle = state.bundles.find((row) => row.bundle_id === bundleId);
              const line = bundle?.lines.find((row) => row.line_id === lineId);
              if (state.subType === "internal_use_out" && bundle && isInternalUseBomBundle(bundle)) {
                if (line?.origin === "direct") {
                  void refreshInternalUseBom(bundleId, { bundleQuantity: quantity });
                }
                return;
              }
              state.setBundles((prev) =>
                applyLineQuantityChange(
                  prev,
                  bundleId,
                  lineId,
                  quantity,
                  shortage,
                  state.subType,
                  getAvailable,
                ),
              );
            }}
            onBundleQuantityChange={(bundleId, newQty) => {
              const bundle = state.bundles.find((row) => row.bundle_id === bundleId);
              if (state.subType === "internal_use_out" && bundle && isInternalUseBomBundle(bundle)) {
                void refreshInternalUseBom(bundleId, { bundleQuantity: newQty });
                return;
              }
              state.setBundles((prev) =>
                applyBundleQuantityChange(prev, bundleId, newQty, state.subType, getAvailable),
              );
            }}
            onInternalUseBomModeChange={(bundleId, mode: IoInternalUseBomMode) =>
              void refreshInternalUseBom(bundleId, { mode })
            }
            pulling={pulling}
            internalUseBomBusy={internalUsePreviewLock.busy}
            onRemoveLine={state.removeLine}
            onRemoveBundle={(bundleId) =>
              state.setBundles((prev) =>
                prev.filter((bundle) => bundle.bundle_id !== bundleId),
              )
            }
            onAdvance={() => {
              if (internalUsePreviewLock.busy) return;
              if (state.canAdvance[4]) state.goTo(5);
            }}
            canAdvance={state.canAdvance[4]}
            onSaveDraft={handleSaveDraft}
          />
        )}

        {step === 5 && (
          <IoConfirmStep
            workType={state.workType}
            subType={state.subType}
            bundles={state.bundles}
            notes={state.notes}
            hasShortage={state.hasShortage}
            hasInvalidQuantity={state.hasInvalidQuantity}
            submitting={submitting}
            saving={drafting}
            approvalKind={approvalKind(state.subType, state.bundles, state.fromDepartment)}
            onNotesChange={state.setNotes}
            onValidationError={(message) => showFeedbackNotice(message, "error")}
            onSubmit={handleSubmit}
            onSaveDraft={handleSaveDraft}
          />
        )}
      </div>

      {/* 썸존 하단 액션 — Step 2 만 (1=자동advance, 3=picker 내부 advance,
          4=cart 내부버튼, 5=confirm 내부버튼). Step3 는 이중 하단바 방지로 제외. */}
      {step === 2 && (
        <StickyFooter flat>
          <PrimaryActionButton
            label={state.canAdvance[2]
              ? "다음 단계로 →"
              : state.workType === "warehouse_adjust"
                ? "입고 또는 출고를 선택하세요"
                : "세부 작업과 부서를 선택하세요"}
            intent={isExitWorkType(state.workType) ? "danger" : "primary"}
            disabled={!state.canAdvance[2]}
            onClick={() => {
              if (state.canAdvance[2]) state.goNext();
            }}
          />
        </StickyFooter>
      )}

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
      {feedbackNotice && (
        <StatusTargetNotice
          key={feedbackNotice.id}
          notice={feedbackNotice}
          onArrive={dismissFeedbackNotice}
        />
      )}

      {scanOpen && (
        <BarcodeScannerModal
          onDetected={handleScanDetected}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
