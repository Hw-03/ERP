"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { Toast, type ToastState } from "@/lib/ui/Toast";
import { tint } from "@/lib/mes/colorUtils";
import { api, type BOMDetailEntry, type IoBundle, type IoInternalUseBomMode, type IoLine, type IoSourceKind, type IoSourceLocation, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { WizardStepCard } from "./_atoms";
import { IoWorkTypeStep, IoSubTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { IO_WORK_TYPES, approvalKind, deptVisibility, directionWord, ioDepartmentPayload, isExitWorkType, pickerDirectionLabel, requiresDepartments, subTypeLabel, targetDepartmentOf } from "./ioWorkType";
import { applyBundleQuantityChange, applyLineQuantityChange, applyToggleLine } from "./bomSync";
import { collectShortageItemIds, shortageLines } from "./pullFromWarehouse";
import { useIoDraftRestore } from "./useIoDraftRestore";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { IO_STEP_LABELS, useIoWorkState, type IoStep } from "./useIoWorkState";
import { useIoUrlSync } from "./useIoUrlSync";
import { useIoPreselect } from "./useIoPreselect";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import { setAuditScreen } from "@/lib/activity-audit-context";
import { sendClientEvent } from "@/lib/client-events";
import {
  INITIAL_IO_TARGET_PICKER_FILTERS,
  type IoComposeViewProps,
  type IoTargetPickerFilters,
} from "./types";
import { ItemConversionWorkView } from "./ItemConversionView";
import { StatusTargetNotice, type StatusTargetNotice as StatusTargetNoticeState } from "../common/StatusTargetNotice";
import { useRealtimeRevision } from "@/lib/queries/realtime";
import {
  runWarehousePull,
  runCompositionSubmit,
  refreshInternalUseBundle,
  saveCompositionDraft,
  useIoComposeOperationState,
} from "./ioComposeOperations";
import { ioLineAvailable } from "@/lib/mes/inventory";
import {
  buildInternalUseBomPreviewTarget,
  isInternalUseBomBundle,
} from "./internalUseBom";
import { useInternalUseBomPreviewLock } from "./useInternalUseBomPreviewLock";

function workTypeLabel(workType: IoWorkType) {
  return IO_WORK_TYPES.find((row) => row.id === workType)?.label ?? workType;
}

const AUTO_SCROLL_OFFSET = -2;
const STEP4_SCROLL_OFFSET = 0;

function findScrollContainer(startEl: HTMLElement): HTMLElement | null {
  let container: HTMLElement | null = startEl.parentElement;
  while (container) {
    const style = window.getComputedStyle(container);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return container;
    container = container.parentElement;
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type ItemConversionHistoryStep = 1 | 2 | 3;
type DraftSaveNotice = StatusTargetNoticeState & { status: string };

function isItemConversionHistoryStep(value: unknown): value is ItemConversionHistoryStep {
  return value === 1 || value === 2 || value === 3;
}

function pushItemConversionHistory(step: ItemConversionHistoryStep): void {
  window.history.pushState(
    { ...(window.history.state || {}), wic: step },
    "",
    window.location.href,
  );
}

function clearItemConversionHistoryState(): void {
  const next = { ...(window.history.state || {}) };
  delete next.wic;
  window.history.replaceState(next, "", window.location.href);
}

function scrollToElement(container: HTMLElement, target: HTMLElement, offset = AUTO_SCROLL_OFFSET) {
  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  const getTop = () => {
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return Math.max(0, container.scrollTop + (targetRect.top - containerRect.top) - offset);
  };

  const top = getTop();
  container.scrollTo({
    top,
    behavior,
  });

  if (behavior === "smooth") {
    window.setTimeout(() => {
      const nextTop = getTop();
      if (Math.abs(container.scrollTop - nextTop) > 2) {
        container.scrollTo({ top: nextTop, behavior });
      }
    }, 320);
  }
}

export function IoComposeView({
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
  onItemConversionFocusChange,
  itemPickerFullscreen = false,
  onItemPickerFullscreenChange,
  onDraftSaved,
}: IoComposeViewProps) {
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
  const [toast, setToast] = useState<ToastState | null>(null);
  const [draftSaveNotice, setDraftSaveNotice] = useState<DraftSaveNotice | null>(null);
  const draftSaveNoticeIdRef = useRef(0);
  // BOM 부모 item_id 집합 — process workType에서 "BOM 적용" 버튼 활성 판단용. 마운트 시 1회 fetch.
  const [bomParents, setBomParents] = useState<Set<string>>(() => new Set());
  // BOM 적재 완료 플래그 — useIoPreselect 의 race 가드 (S1: 빈 set 상태에서 BOM 부모를 일반 품목으로 오인하던 결함).
  const [bomParentsLoaded, setBomParentsLoaded] = useState(false);
  // BOM 부모 품목으로 진입한 경우 자동 추가하지 않고 Step 3 picker 에서 row 만 강조한다.
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);
  // 마지막으로 복원을 발동시킨 '이어서 하기' nonce — 같은 draft 재선택(batch_id 불변) 재발동 판정용.
  const restoredNonceRef = useRef<number | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);
  // '저장하시겠습니까?' 경고용 — 사용자가 작업 내용을 입력/수정했는지.
  // 복원 직후·명시적 저장 후엔 false 로 리셋.
  const [contentDirty, setContentDirty] = useState(false);
  const [hasDraftOnServer, setHasDraftOnServer] = useState(false);
  const dirtyEffectMountedRef = useRef(false);
  const absorbedRestoreRef = useRef<string | null>(null);
  const state = useIoWorkState(defaultWorkType, operator?.department, getAvailable);
  // 항목 7 — '창고에서 가져오기' 대상으로 선택한 부족 라인 line_id 집합. 0개면 부족 라인 전체 대상.
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
  const [itemConversionView, setItemConversionView] = useState<"compose" | "work">("compose");
  const [itemConversionHistoryStep, setItemConversionHistoryStep] = useState<ItemConversionHistoryStep>(1);
  const itemConversionViewRef = useRef(itemConversionView);
  const previousAuditScreenRef = useRef<string | null>(null);

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

  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft } = useIoDraft();
  const { submitting, run, submit } = useIoSubmit();

  // 브라우저 뒤로/앞으로 ↔ step 동기화. URL ?step=N 으로 history 엔트리를 쌓아 입출고 위저드 내부에서도
  // 뒤/앞 버튼이 작동하게 함. effect 는 useIoUrlSync 로 격리.
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { pendingFinalStepRef } = useIoUrlSync({
    step: state.step,
    goTo: state.goTo,
    canAdvance: state.canAdvance,
    router,
    searchParams,
    pathname,
    // step push 시 tab 을 항상 warehouse 로 고정 — 대시보드→창고 진입 순간 lagged searchParams 의
    // stale tab(=dashboard) 을 보존해 셸이 대시보드로 되돌리는 튕김을 차단한다.
    suppressInitialSync: draftToRestore != null,
    tabParam: "warehouse",
  });

  useEffect(() => {
    itemConversionViewRef.current = itemConversionView;
  }, [itemConversionView]);

  useEffect(() => {
    onItemConversionFocusChange?.(itemConversionView !== "compose");
  }, [itemConversionView, onItemConversionFocusChange]);

  useEffect(
    () => () => {
      onItemConversionFocusChange?.(false);
    },
    [onItemConversionFocusChange],
  );

  useEffect(() => {
    function handleItemConversionPop(event: PopStateEvent) {
      const next = (event.state as { wic?: unknown } | null)?.wic;
      if (isItemConversionHistoryStep(next)) {
        setItemConversionView("work");
        setItemConversionHistoryStep(next);
        return;
      }
      if (itemConversionViewRef.current !== "compose") {
        setItemConversionView("compose");
        setItemConversionHistoryStep(1);
        state.goTo(1);
        clearItemConversionHistoryState();
      }
    }

    window.addEventListener("popstate", handleItemConversionPop);
    return () => window.removeEventListener("popstate", handleItemConversionPop);
  }, [state]);

  // entryIntent 1회 적용 — 빠른작업으로 진입 시 작업유형/방향/세부작업을 프리셋하고 Step3 으로 점프.
  useEffect(() => {
    if (!entryIntent || intentAppliedRef.current) return;
    intentAppliedRef.current = true;
    state.setWorkType(entryIntent.workType);
    if (entryIntent.workType === "process" && entryIntent.direction) {
      state.setDeptIoDirection(entryIntent.direction);
    } else if (entryIntent.subType) {
      state.setSubType(entryIntent.subType);
    }
    if (entryIntent.toDepartment) {
      state.setToDepartment(entryIntent.toDepartment);
    }
    state.goTo(3);
  // entryIntent는 마운트 시 1회만 적용 — deps 배열에 state 함수 넣으면 재실행되므로 의도적으로 생략.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent]);

  useEffect(() => {
    setSearch(globalSearch);
  }, [globalSearch]);

  // 4단계 진입 시 재고 스냅샷 갱신 — 취소·승인 등으로 재고가 바뀐 뒤 재추가할 때 stale 표시 방지.
  useEffect(() => {
    if (state.step !== 4) return;
    api.getItems({ limit: 2000, search: globalSearch.trim() || undefined })
      .then(setItems)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, globalSearch]);

  useEffect(() => {
    let cancelled = false;
    api.getAllBOM()
      .then((rows: BOMDetailEntry[]) => {
        if (cancelled) return;
        setBomParents(new Set(rows.map((row) => row.parent_item_id)));
        // 빈 set 도 "로딩 끝" 으로 표시해야 preselect 가 일반 품목으로 진행. 실패는 catch 에서 동일 처리.
        setBomParentsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // BOM 조회 실패 시 빈 set 유지 → "BOM 적용" 버튼은 모든 품목에서 disabled.
        // 그래도 preselect 가 보류 상태로 잠기지 않도록 loaded=true 로 풀어준다.
        setBomParentsLoaded(true);
      });
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
    if (draftToRestore?.batch_id) setHasDraftOnServer(true);
  }, [draftToRestore?.batch_id]);

  useEffect(() => {
    if (draftToRestore?.batch_id) resetTargetPickerFilters();
  }, [draftToRestore?.batch_id, restoreNonce]);

  // 사용자가 작업 내용(번들/메모/참조/부서/유형)을 바꾸면 contentDirty=true.
  // - 마운트 첫 실행은 건너뛴다(초기 빈 상태).
  // - 복원으로 내용이 바뀐 첫 변경은 수정으로 치지 않는다(복원 직후 그대로 나가면 경고 없음).
  //   복원 effect 가 restoredDraftRef 를 새 batch_id 로 갱신하므로, 그 세대를 처음 만나면 흡수만 한다.
  useEffect(() => {
    if (!dirtyEffectMountedRef.current) {
      dirtyEffectMountedRef.current = true;
      return;
    }
    if (restoredDraftRef.current !== absorbedRestoreRef.current) {
      absorbedRestoreRef.current = restoredDraftRef.current;
      setContentDirty(false);
      return;
    }
    setContentDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.bundles,
    state.notes,
    state.referenceNo,
    state.fromDepartment,
    state.toDepartment,
    state.workType,
    state.subType,
  ]);

  async function addItem(
    item: Item,
    sourceKind: IoSourceKind = "direct_item",
    subTypeOverride?: IoSubType,
    sourceLocation?: IoSourceLocation,
  ) {
    setError(null);
    // setSubType은 다음 렌더로 미뤄지므로, previewTarget에는 effective 값을 즉시 전달.
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
      // 선택 단계에서는 수량을 늘리지 않고 같은 선택 경로의 미리보기만 교체한다.
      const existingIdx = state.bundles.findIndex((bundle) =>
        bundle.source_item_id === item.item_id &&
        (effectiveSubType === "internal_use_out" ||
          (sourceKind === "manual" ? bundle.source_kind === "manual" : bundle.source_kind !== "manual")),
      );
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: effectiveSubType,
        fromDepartment: departments.fromDepartment,
        toDepartment: departments.toDepartment,
        target: {
          source_kind: sourceKind,
          item_id: item.item_id,
          quantity: 1,
          source_location: effectiveSubType === "internal_use_out" ? sourceLocation : undefined,
        },
      });
      const newBundles = response.bundles;
      if (existingIdx !== -1) {
        state.setBundles((prev) => {
          if (effectiveSubType === "internal_use_out") {
            return [
              ...prev.filter((bundle) => bundle.source_item_id !== item.item_id),
              ...newBundles,
            ];
          }
          const next = [...prev];
          next.splice(existingIdx, 1, ...newBundles);
          return next;
        });
      } else {
        state.setBundles((prev) => [...prev, ...newBundles]);
      }
      onStatusChange(`${item.item_name} 작업 묶음 생성`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전개에 실패했습니다.");
    }
  }

  // preselect 자동 적용 — BOM 부모면 하이라이트만, 일반 품목이면 자동 카트 추가.
  // race 가드: bomParents 가 아직 로드 안 됐으면 보류 (S1 시연 결함 대응).
  useIoPreselect({
    preselectedItem,
    bomParents,
    bomParentsLoaded,
    workType: state.workType,
    subType: state.subType,
    fromDepartment: state.fromDepartment,
    toDepartment: state.toDepartment,
    deptIoDirection: state.deptIoDirection,
    forceManual: entryIntent?.forceManualItem,
    addItem,
    setHighlightItemId,
  });

  // 빠른작업 진입 시: BOM 없는(낱개) 품목은 자동 카트 추가가 끝나면 Step4(수량 확인)로 바로 보낸다.
  // BOM 부모는 Step3 에서 사용자가 BOM/낱개를 골라야 하므로 그대로 둔다. 진입당 1회.
  const entryLeafAdvancedRef = useRef(false);
  useEffect(() => {
    if (entryLeafAdvancedRef.current) return;
    if (!entryIntent || !preselectedItem || !bomParentsLoaded) return;
    if (bomParents.has(preselectedItem.item_id) && !entryIntent.forceManualItem) {
      // BOM 부모 — Step3 유지(BOM/낱개 선택). 더 이상 처리하지 않음.
      entryLeafAdvancedRef.current = true;
      return;
    }
    // 낱개 품목 — 자동 추가 완료(bundles>0) 후 Step4 로.
    if (state.bundles.length > 0) {
      entryLeafAdvancedRef.current = true;
      state.goTo(4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent, preselectedItem, bomParentsLoaded, bomParents, state.bundles.length]);

  // 입출고 작업 중 다른 화면으로 이동 시 '저장할까요?' 모달.
  // 경고 조건: 로그인 상태에서 마지막 저장/복원 이후 사용자가 수정했을 때,
  // AND (번들이 있거나 서버에 드래프트가 남아있을 때).
  // hasDraftOnServer: 이어서 작업으로 복원되면 true, 새 작업 슬롯 시작 시 false.
  const ioDirty = !!employeeId && contentDirty && (state.bundles.length > 0 || hasDraftOnServer);
  useRegisterDirty(
    "warehouse-io",
    ioDirty,
    async () => {
      if (!employeeId) return;
      await internalUsePreviewLock.waitForIdle();
      const currentBundles = latestBundlesRef.current;
      if (currentBundles.length === 0) {
        // 모든 품목 삭제 후 "저장하고 나가기" = 서버 드래프트 삭제
        if (autosaveBatchIdRef.current) {
          await api.deleteDraft(autosaveBatchIdRef.current, employeeId);
          autosaveBatchIdRef.current = null;
        }
        setHasDraftOnServer(false);
        return;
      }
      const saved = await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        ...ioDepartmentPayload(state.subType, state.fromDepartment, state.toDepartment),
        referenceNo: state.referenceNo,
        notes: state.notes,
        batchId: autosaveBatchIdRef.current,
        bundles: currentBundles,
      });
      autosaveBatchIdRef.current = saved.batch_id;
      onDraftSaved?.(saved.batch_id, state.step);
    },
    async () => {
      // '저장하지 않고 이동' — 수동 저장본은 서버에 유지(다음 진입 시 복원됨).
    },
  );

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

  // 새 작업 시작(작업유형/세부작업/부서 변경) — 진행 중 임시저장 슬롯과의 연결을 끊는다.
  // 그래야 다음 저장이 기존 슬롯을 덮지 않고 새 슬롯으로 쌓여 '작업 중' 탭에 누적된다.
  function beginNewCompositionSlot() {
    bumpOperationGeneration();
    autosaveBatchIdRef.current = null;
    setHasDraftOnServer(false);
    // 새 작업 슬롯 시작 — 복원 추적 해제. 이래야 같은 '이어서 작업'을 다시 골랐을 때
    // (1단계로 빠졌다가 재선택) 복원 effect 가 다시 발동한다.
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
    if (state.bundles.length > 0) {
      state.setBundles([]);
      beginNewCompositionSlot();
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
      return;
    }
    resetTargetPickerFilters();
  }

  function changeToDepartment(next: string) {
    state.setToDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      beginNewCompositionSlot();
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
      return;
    }
    resetTargetPickerFilters();
  }

  function handleSubTypeChange(next: IoSubType) {
    state.setSubType(next);
    state.setBundles([]);
    beginNewCompositionSlot();
  }

  function handleWorkTypeChange(next: IoWorkType) {
    state.setWorkType(next);
    setError(null);
    beginNewCompositionSlot();
    state.goTo(2);
  }

  function openItemConversion() {
    setError(null);
    pushItemConversionHistory(1);
    setItemConversionHistoryStep(1);
    setItemConversionView("work");
  }

  function closeItemConversion() {
    setItemConversionView("compose");
    setItemConversionHistoryStep(1);
    state.goTo(1);
    clearItemConversionHistoryState();
  }

  function backFromItemConversion() {
    if (isItemConversionHistoryStep(window.history.state?.wic)) {
      window.history.go(-itemConversionHistoryStep);
      closeItemConversion();
      return;
    }
    closeItemConversion();
  }

  function pushItemConversionHistoryStep(step: ItemConversionHistoryStep): void {
    pushItemConversionHistory(step);
    setItemConversionHistoryStep(step);
  }

  function backToItemConversionHistoryStep(step: ItemConversionHistoryStep): void {
    const offset = step - itemConversionHistoryStep;
    if (offset < 0 && isItemConversionHistoryStep(window.history.state?.wic)) {
      window.history.go(offset);
      return;
    }
    setItemConversionHistoryStep(step);
  }

  async function saveCurrentDraft(persistInUrl = true): Promise<string | null> {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return null;
    }
    try {
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
      if (!batchId) return null;
      if (persistInUrl) {
        onDraftSaved?.(batchId, state.step);
        setContentDirty(false); // 저장 버튼으로 명시적 저장 → 이후 수정 전까지 경고 없음
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        draftSaveNoticeIdRef.current += 1;
        setDraftSaveNotice({
          id: draftSaveNoticeIdRef.current,
          message: "저장되었습니다. 나중에 이어서 진행할 수 있습니다.",
          status: `저장됨 · ${hh}:${mm}`,
        });
      }
      return batchId;
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
      setToast({ message, type: "error" });
      return null;
    }
  }

  async function handleSaveDraft() {
    await saveCurrentDraft();
  }

  // 항목 7 — 부족 품목을 창고 반출(warehouse_to_dept) 새 작업으로 가져오기.
  // ① 현재 작업을 '작업 중'으로 저장 ② 선택(or 전체) 부족 라인의 item_id 수집
  // ③ 품목별 previewTarget(낱개·수량1) ④ 상태 전이(setWorkType→setSubType→
  //   setToDepartment→setBundles→goTo(4)) — setWorkType 이 bundles 를 리셋하므로
  //   setBundles 는 반드시 그 뒤. 새 슬롯은 beginNewCompositionSlot.
  async function pullFromWarehouse() {
    if (pullingRef.current) return;
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    const targetDept = operator?.department;
    if (!targetDept) {
      setError("작업자 부서를 확인할 수 없습니다.");
      return;
    }
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
          toDepartment: targetDept,
          target: { source_kind: "manual", item_id: itemId, quantity: 1 },
        })).bundles,
        (savedDraftId, newBundles) => {
          onDraftSaved?.(savedDraftId, state.step, false);
          state.setWorkType("warehouse_io");
          state.setSubType("warehouse_to_dept");
          state.setToDepartment(targetDept);
          beginNewCompositionSlot();
          state.setBundles(newBundles);
          setPullSelected(new Set());
          state.goTo(4);
          onStatusChange("부족 품목을 창고 반출 작업으로 가져왔습니다.");
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
        setHasDraftOnServer(false);
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
  const subTypeText = subTypeLabel(state.subType);
  const dept = requiresDepartments(state.subType)
    ? `${state.fromDepartment} → ${state.toDepartment}`
    : "부서 무관";
  const stepTwoSummary = (() => {
    if (state.workType === "process") {
      return `${directionWord(state.deptIoDirection)} · ${state.toDepartment}`;
    }
    if (state.workType === "warehouse_adjust") {
      return `수량보정 · ${directionWord(state.deptIoDirection)}`;
    }
    // 라벨에 이미 방향이 박힌 subType — 라벨의 "부서" 자리를 실제 부서명으로 치환
    if (state.subType === "warehouse_to_dept") return `창고 → ${state.toDepartment}`;
    if (state.subType === "dept_to_warehouse") return `${state.fromDepartment} → 창고`;
    if (!requiresDepartments(state.subType)) return `${subTypeText} · 부서 무관`;
    // 그 외 — deptVisibility 가 의미있는 부서만 한 번 표기
    const vis = deptVisibility(state.subType);
    if (vis.from && vis.to) return `${subTypeText} · ${state.fromDepartment} → ${state.toDepartment}`;
    if (vis.from) return `${subTypeText} · ${state.fromDepartment}`;
    if (vis.to) return `${subTypeText} · ${state.toDepartment}`;
    return subTypeText;
  })();
  const includedCount = state.includedLines.length;
  const excludedCount = state.excludedLines.length;
  // 항목 7 — 생산(produce)·출고(disassemble) 4단계에서 '창고에서 가져오기' 노출. (데스크톱 전용)
  const pullEnabled = state.subType === "produce" || state.subType === "disassemble";
  // 버튼 라벨 개수 — 선택이 있으면 선택 수, 없으면 부족 라인 전체 수.
  const pullCount = pullEnabled
    ? pullSelected.size > 0
      ? pullSelected.size
      : shortageLines(state.bundles).length
    : 0;
  const lineCount = state.bundles.reduce((acc, b) => acc + b.lines.length, 0);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);
  const accent = isExitWorkType(state.workType) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const stepWrapperClass = (n: IoStep) => `flex min-h-0 flex-1 flex-col${step > n ? " pt-[9px]" : ""}`;
  const workTypeInfo = IO_WORK_TYPES.find((row) => row.id === state.workType);
  const currentWorkTitle = workTypeInfo?.label ?? workTypeLabel(state.workType);

  useEffect(() => {
    const nextScreen = {
      key: `warehouse.io.${state.workType}.${state.subType}.step${step}`,
      label: `입출고 · ${currentWorkTitle} · ${subTypeText} · ${IO_STEP_LABELS[step]}`,
    };
    const previousScreen = previousAuditScreenRef.current ?? "desktop.warehouse";
    setAuditScreen(nextScreen, { priority: "workflow" });
    if (previousScreen !== nextScreen.key) {
      sendClientEvent({
        event: "ui_nav",
        from: previousScreen,
        to: nextScreen.key,
        path: "/mes",
        screen_key: nextScreen.key,
        screen_label: nextScreen.label,
        source: "desktop",
      });
      previousAuditScreenRef.current = nextScreen.key;
    }
  }, [currentWorkTitle, state.subType, state.workType, step, subTypeText]);

  useEffect(() => () => {
    setAuditScreen({ key: "desktop.warehouse", label: "입출고" }, { force: true });
  }, []);

  useEffect(() => {
    if (step !== 3) onItemPickerFullscreenChange?.(false);
  }, [step, onItemPickerFullscreenChange]);

  useEffect(() => () => onItemPickerFullscreenChange?.(false), [onItemPickerFullscreenChange]);

  function stepTitle(stepId: IoStep) {
    if (stepId === 3) return `${pickerDirectionLabel(state.subType)} 품목 선택`;
    return stepId === 1
      ? "작업 유형 선택"
      : stepId === 2
        ? state.workType === "warehouse_adjust"
          ? "입고·출고 방향 선택"
          : "세부 작업과 부서 선택"
        : stepId === 4
          ? "수량 조정"
          : "최종 확인";
  }

  function stepSummary(stepId: IoStep) {
    if (stepId === 2) return stepTwoSummary;
    if (stepId === 3) return `${state.bundles.length}개 묶음 · 라인 ${lineCount}개`;
    return `반영 ${includedCount}개 · 제외 ${excludedCount}개`;
  }

  function returnToWorkTypeStep() {
    restoredDraftRef.current = null;
    restoredNonceRef.current = null;
    state.goTo(1);
  }

  const workChrome = itemPickerFullscreen ? undefined : (
    <div className="iwc">
      <nav className="iwp" data-testid="io-step-nav">
        {([1, 2, 3, 4, 5] as IoStep[]).map((stepId) => {
          const active = stepId === step;
          const done = stepId < step;
          const summaryText =
            stepId === 1
              ? step > 1
                ? currentWorkTitle
                : ""
              : done && stepId > 1
                ? stepSummary(stepId)
                : "";
          if (stepId < step) {
            return (
              <button
                key={stepId}
                type="button"
                onClick={stepId === 1 ? returnToWorkTypeStep : () => state.goTo(stepId)}
                className="iwpb done"
                data-testid="io-step-nav-item"
              >
                <span className="iwpl">{stepTitle(stepId)}</span>
                {summaryText && <span className="iwps">{summaryText}</span>}
              </button>
            );
          }
          return (
            <button
              key={stepId}
              type="button"
              disabled
              className={active ? "iwpb a" : "iwpb locked"}
              data-testid="io-step-nav-item"
            >
              <span className="iwpl">{stepTitle(stepId)}</span>
              {summaryText && <span className="iwps">{summaryText}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );

  // step 변경 시 직전(step-1) 카드를 viewport top으로 스크롤 → 그 아래 active step 카드가 자연스럽게 노출
  const stepRefs = useRef<Partial<Record<IoStep, HTMLDivElement | null>>>({});
  // 마지막으로 스크롤 처리한 step — null 이면 아직 마운트만 됨 (첫 마운트는 무조건 skip)
  const lastScrolledStepRef = useRef<IoStep | null>(null);
  // 첫 품목 추가로 인한 자동 advance 시에는 viewport를 picker 위치에 고정 (사용자가 연속 선택 가능하도록)
  const programmaticAdvanceRef = useRef(false);

  // active wrapper height 동적 set — carbon bottom 이 컨테이너 bottom (= 사이드바 bottom) 과 정렬되도록.
  // Step 3+품목>0 시점에는 Step 4 wrapper 가 active.
  useLayoutEffect(() => {
    const allSteps: IoStep[] = [1, 2, 3, 4, 5];
    const stepElements = { ...stepRefs.current };

    // step=3+bundles>0 시 Step 3 과 Step 4 둘 다 filled 처리 (사이즈 일관성).
    const targetSteps: IoStep[] =
      step === 3 && state.bundles.length > 0 ? [3 as IoStep, 4 as IoStep] : [step];
    const targetSet = new Set<IoStep>(targetSteps);

    // target 외 wrapper 만 reset. target 은 곧 새 height 로 덮어쓰므로 reset 단계 생략 — reset→set
    // 사이 wrapper 가 자연 높이로 잠시 축소되면서 내부 표 컨테이너 scrollTop 이 clamp 되어
    // BOM/낱개 추가 시 스크롤이 맨 위로 튀는 문제를 막는다.
    for (const s of allSteps) {
      const w = stepElements[s];
      if (!w) continue;
      if (targetSet.has(s)) continue;
      if (w.style.height) w.style.height = "";
      if (w.style.minHeight) w.style.minHeight = "";
    }

    // 내부 표/카트의 scrollTop snapshot — height 변동으로 인한 clamp 방지 안전망.
    // marker: data-keep-scroll
    const scrollSnapshots: Array<[HTMLElement, number]> = [];
    for (const s of allSteps) {
      const w = stepElements[s];
      if (!w) continue;
      w.querySelectorAll<HTMLElement>("[data-keep-scroll]").forEach((el) => {
        if (el.scrollTop > 0) scrollSnapshots.push([el, el.scrollTop]);
      });
    }

    const firstWrapper = stepElements[targetSteps[0]];
    if (!firstWrapper) return;

    const scrollContainer = findScrollContainer(firstWrapper);
    if (!scrollContainer) return;

    // 모든 작업 카드는 같은 하단 기준을 사용한다. 높이는 wrapper가 고정하고
    // 내부 표/목록만 스크롤되게 해서 단계별로 박스가 출렁이지 않게 한다.
    const BOTTOM = 12;
    const GAP = 12;

    for (const s of targetSteps) {
      const wrapper = stepElements[s];
      if (!wrapper) continue;

      let wrapperTopInContainer: number;
      if (s === 1) {
        // Step 1: 자동 스크롤 안 됨. 현재 위치 (외부 헤더+탭 아래) 그대로
        const wRect = wrapper.getBoundingClientRect();
        const cRect = scrollContainer.getBoundingClientRect();
        wrapperTopInContainer = wRect.top - cRect.top + scrollContainer.scrollTop;
      } else if (s === 4 && step === 3) {
        // Step 4 in step=3+bundles>0: picker advance 후 Step 4 가 viewport 차지.
        wrapperTopInContainer = STEP4_SCROLL_OFFSET;
      } else {
        // Step 2/3/5: 접힌 이전 단계 카드 아래부터 active 카드가 차도록 계산.
        const prevStep: IoStep = (s - 1) as IoStep;
        const prevCollapsed = stepElements[prevStep];
        if (!prevCollapsed) continue;
        wrapperTopInContainer = AUTO_SCROLL_OFFSET + prevCollapsed.offsetHeight + GAP;
      }

      const newHeight = scrollContainer.clientHeight - wrapperTopInContainer - BOTTOM;
      if (newHeight > 0) {
        const next = `${newHeight}px`;
        if (wrapper.style.minHeight) wrapper.style.minHeight = "";
        if (wrapper.style.height !== next) wrapper.style.height = next;
      }
    }

    const alignTarget =
      step === 3 && state.bundles.length > 0
        ? stepElements[4]
        : step > 1
          ? stepElements[(step - 1) as IoStep]
          : null;
    const extendStep: IoStep = step === 3 && state.bundles.length > 0 ? 4 : step;
    const extendWrapper = stepElements[extendStep];
    const alignOffset = step === 3 && state.bundles.length > 0 ? STEP4_SCROLL_OFFSET : AUTO_SCROLL_OFFSET;

    if (alignTarget && extendWrapper) {
      const cRect = scrollContainer.getBoundingClientRect();
      const tRect = alignTarget.getBoundingClientRect();
      const desiredScrollTop = Math.max(
        0,
        scrollContainer.scrollTop + (tRect.top - cRect.top) - alignOffset,
      );
      const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
      const scrollDeficit = Math.ceil(desiredScrollTop - maxScrollTop);

      if (scrollDeficit > 0) {
        const currentSize =
          parseFloat(extendWrapper.style.minHeight || extendWrapper.style.height) || extendWrapper.offsetHeight;
        const nextSize = currentSize + scrollDeficit;
        const next = `${nextSize}px`;

        if (extendWrapper.style.minHeight) extendWrapper.style.minHeight = "";
        if (extendWrapper.style.height !== next) extendWrapper.style.height = next;
      }
    }

    // height 조정 후 표/카트 scrollTop 복원 — BOM/낱개 추가 시 스크롤 위치 유지.
    for (const [el, top] of scrollSnapshots) {
      if (el.scrollTop !== top) el.scrollTop = top;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state.bundles.length, itemPickerFullscreen]);

  useEffect(() => {
    const el = stepRefs.current[step];
    if (!el) return;
    // 외부 overflow 컨테이너 찾기
    const container = findScrollContainer(el);
    // 스크롤 — 첫 마운트 또는 동일 step 재실행(strict mode 등) 시 skip
    const prev = lastScrolledStepRef.current;
    lastScrolledStepRef.current = step;
    if (prev === null || prev === step) return;
    if (programmaticAdvanceRef.current) {
      programmaticAdvanceRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (!container) return;
      if (step === 1) {
        container.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      } else {
        // step 2 이후 — 직전(step-1) 카드를 container top 보다 살짝 위로 정렬.
        const targetEl = stepRefs.current[(step - 1) as IoStep];
        if (targetEl) scrollToElement(container, targetEl);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [step]);

  if (itemConversionView === "work") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <ItemConversionWorkView
          items={items}
          requesterEmployeeId={operator?.employee_id ?? ""}
          historyStep={itemConversionHistoryStep}
          onHistoryStepChange={pushItemConversionHistoryStep}
          onHistoryStepBack={backToItemConversionHistoryStep}
          onBack={backFromItemConversion}
          onComplete={() => {
            void api
              .getItems({ limit: 2000, search: globalSearch.trim() || undefined })
              .then(setItems)
              .catch(() => {});
            closeItemConversion();
            onSubmitSuccess?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
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

      {step === 1 && (
      <div
        ref={(el) => { stepRefs.current[1] = el; }}
        className={stepWrapperClass(1)}
      >
        <WizardStepCard
          n={1}
          title={stepTitle(1)}
          state="active"
          summary={step > 1 ? workTypeLabel(state.workType) : undefined}
          onChange={returnToWorkTypeStep}
          accent={accent}
          chrome={undefined}
          chromeOnly
          fill
        >
          <IoWorkTypeStep
            workType={state.workType}
            selectedWorkType={step > 1 ? state.workType : null}
            operator={operator}
            onWorkTypeChange={handleWorkTypeChange}
            onItemConversion={openItemConversion}
          />
        </WizardStepCard>
      </div>
      )}

      {step === 2 && (
        <div
          ref={(el) => { stepRefs.current[2] = el; }}
          className={stepWrapperClass(2)}
        >
          <WizardStepCard
              n={2}
              title={stepTitle(2)}
              state="active"
              summary={stepTwoSummary}
              onChange={() => state.goTo(2)}
              accent={accent}
              chrome={workChrome}
              chromeOnly
              fill
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <IoSubTypeStep
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
                </div>
                <div className="mt-auto pt-5">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={state.goNext}
                    disabled={!state.canAdvance[2]}
                    className="w-full rounded-[18px] px-7 py-5 text-lg font-black"
                    style={{ background: accent }}
                  >
                    {state.canAdvance[2]
                      ? "다음 단계로 →"
                      : state.workType === "warehouse_adjust"
                        ? "입고 또는 출고를 선택하세요"
                        : "세부 작업과 부서를 선택하세요"}
                  </Button>
                </div>
              </div>
            </WizardStepCard>
        </div>
      )}

      {step === 3 && (
        <div
          ref={(el) => { stepRefs.current[3] = el; }}
          className={stepWrapperClass(3)}
        >
          <WizardStepCard
            n={3}
            title={stepTitle(3)}
            state="active"
            summary={stepSummary(3)}
            onChange={() => state.goTo(3)}
            accent={accent}
            chrome={workChrome}
            chromeOnly
            fill
          >
            <IoTargetPicker
              workType={state.workType}
              subType={state.subType}
              deptIoDirection={state.deptIoDirection}
              bundleSubType={state.bundles.length > 0 ? state.subType : null}
              bomParents={bomParents}
              targetDepartment={targetDepartmentOf(state.subType, state.fromDepartment, state.toDepartment)}
              items={items}
              productModels={productModels}
              bundles={state.bundles}
              filters={pickerFilters}
              onFiltersChange={setPickerFilters}
              search={search}
              onSearchChange={setSearch}
              highlightItemId={highlightItemId}
              onAddItem={(item, sourceKind, subTypeOverride, sourceLocation) =>
                addItem(item, sourceKind ?? "direct_item", subTypeOverride, sourceLocation)}
              onRemoveBundles={(bundleIds) =>
                state.setBundles((prev) => prev.filter((bundle) => !bundleIds.includes(bundle.bundle_id)))}
              onAdvance={() => {
                if (state.bundles.length > 0) state.goTo(4);
              }}
              busy={previewing}
              fullscreen={itemPickerFullscreen}
              onFullscreenChange={onItemPickerFullscreenChange}
            />
          </WizardStepCard>
        </div>
      )}

      {step === 4 && (
        <div
          ref={(el) => { stepRefs.current[4] = el; }}
          className={stepWrapperClass(4)}
        >
          <WizardStepCard
            n={4}
            title={stepTitle(4)}
            state="active"
            summary={stepSummary(4)}
            onChange={() => state.goTo(4)}
            accent={accent}
            chrome={workChrome}
            chromeOnly
            fill
          >
            <IoBundleCart
              bundles={state.bundles}
              subType={state.subType}
              itemMap={itemMap}
              getAvailable={getAvailable}
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
                  applyLineQuantityChange(prev, bundleId, lineId, quantity, shortage, state.subType, getAvailable),
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
              internalUseBomBusy={internalUsePreviewLock.busy}
              onRemoveLine={state.removeLine}
              onRemoveBundle={(bundleId) =>
                state.setBundles((prev) => prev.filter((bundle) => bundle.bundle_id !== bundleId))
              }
              onAdvance={() => {
                if (internalUsePreviewLock.busy) return;
                // state.step=3 (bundles>0 로 Step 4 카드만 자동 노출된 상태) 에서 곧장 5 로 점프하면
                // URL history 에 step=4 가 안 쌓여 뒤로 가기가 step=3 으로 떨어진다.
                // pendingFinalStepRef 에 5 를 예약해두고 먼저 goTo(4) — URL 이 step=4 로 갱신된 뒤
                // urlStep effect 가 pending 을 보고 자동으로 goTo(5) 호출.
                if (state.step < 4) {
                  pendingFinalStepRef.current = 5;
                  state.goTo(4);
                  return;
                }
                if (state.step <= 4) state.goTo(5);
                // state.goTo(5) → step=5 → 자동 스크롤 useEffect 가 Step 4 collapsed top 으로.
              }}
              canAdvance={state.canAdvance[4]}
              hasShortage={state.hasShortage}
              pullEnabled={pullEnabled}
              pullSelected={pullSelected}
              onTogglePull={togglePull}
              onPullFromWarehouse={pullFromWarehouse}
              pullCount={pullCount}
              pulling={pulling}
              onSaveDraft={handleSaveDraft}
            />
          </WizardStepCard>
        </div>
      )}

      {step === 5 && (
        <div
          ref={(el) => { stepRefs.current[5] = el; }}
          className={stepWrapperClass(5)}
        >
          <WizardStepCard
            n={5}
            title={stepTitle(5)}
            state="active"
            summary="제출 준비 완료"
            accent={accent}
            chrome={workChrome}
            chromeOnly
            fill
          >
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
              onSubmit={handleSubmit}
              onSaveDraft={handleSaveDraft}
            />
          </WizardStepCard>
        </div>
      )}

      <IoSubmitModals
        result={result}
        onClose={() => setResult(null)}
        onGoToMap={() => router.push("?tab=warehouseMap", { scroll: false })}
      />
      {draftSaveNotice && (
        <StatusTargetNotice
          key={draftSaveNotice.id}
          notice={draftSaveNotice}
          icon={CheckCircle2}
          dataTestId="io-draft-save-notice"
          onArrive={(noticeId) => {
            if (draftSaveNoticeIdRef.current !== noticeId) return;
            onStatusChange(draftSaveNotice.status);
            setDraftSaveNotice((current) => current?.id === noticeId ? null : current);
          }}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
