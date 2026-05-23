"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { tint } from "@/lib/mes/colorUtils";
import { api, type BOMDetailEntry, type IoBundle, type IoLine, type IoSourceKind, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { WizardStepCard } from "./_atoms";
import { IoWorkTypeStep, IoSubTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { IO_WORK_TYPES, approvalKind, directionWord, isDefectInventorySubType, isExitWorkType, pickerDirectionLabel, requiresDepartments, subTypeLabel, targetDepartmentOf } from "./ioWorkType";
import { applyBundleQuantityChange, applyLineQuantityChange, applyToggleLine } from "./bomSync";
import { useIoDraftRestore } from "./useIoDraftRestore";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { useIoWorkState, type IoStep } from "./useIoWorkState";
import type { IoComposeViewProps } from "./types";
import { DefectInventoryPicker } from "./DefectInventoryPicker";
import { DefectActionStep } from "./DefectActionStep";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";

function locationQuantity(item: Item, department: string | null | undefined, status: "PRODUCTION" | "DEFECTIVE") {
  if (!department) return 0;
  return item.locations.find((loc) => loc.department === department && loc.status === status)?.quantity ?? 0;
}

// Pydantic Decimal은 JSON에서 문자열("1.0000")로 직렬화된다 — 프론트는 number 로 타이핑되어 있으나 실값은 string.
// stepper 산술/합계가 string concat 으로 깨지므로 bundle 수신 즉시 number 로 정규화한다.
function normalizeBundles(bundles: IoBundle[]): IoBundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    quantity: Number(bundle.quantity),
    lines: bundle.lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      shortage: Number(line.shortage),
      bom_expected: line.bom_expected == null ? null : Number(line.bom_expected),
    })),
  }));
}

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
  defaultWorkType,
  onStatusChange,
  onSubmitSuccess,
  defectDeptFilter,
  currentEmployee,
}: IoComposeViewProps) {
  const [employeeId, setEmployeeId] = useState(operator?.employee_id ?? "");
  const [search, setSearch] = useState(globalSearch);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  // BOM 부모 item_id 집합 — process workType에서 "BOM 적용" 버튼 활성 판단용. 마운트 시 1회 fetch.
  const [bomParents, setBomParents] = useState<Set<string>>(() => new Set());
  const preselectedHandledRef = useRef<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);

  const state = useIoWorkState(defaultWorkType, operator?.department);
  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft } = useIoDraft();
  const { submitting, submit } = useIoSubmit();
  const [defectSubmitting, setDefectSubmitting] = useState(false);

  // 브라우저 뒤로/앞으로 ↔ step 동기화. URL ?step=N 으로 history 엔트리를 쌓아 입출고 위저드 내부에서도
  // 뒤/앞 버튼이 작동하게 함.
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlStep = useMemo<IoStep>(() => {
    const raw = Number(searchParams.get("step"));
    return raw >= 1 && raw <= 5 ? (raw as IoStep) : 1;
  }, [searchParams]);
  // URL→state 동기화 직후 state→URL effect 가 다시 push 하는 것을 1회 차단.
  const skipNextPushRef = useRef(false);
  // step 을 2 단계 이상 점프할 때(예: 3 → 5) 중간 단계도 history 에 쌓기 위한 deferred target.
  // URL 이 중간 step 으로 갱신되는 것을 기다린 뒤 최종 step 으로 advance.
  const pendingFinalStepRef = useRef<IoStep | null>(null);

  // state.step 변경 → URL push
  useEffect(() => {
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }
    if (urlStep === state.step) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("step", String(state.step));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // URL step 변경 (뒤로/앞으로) → state.goTo (도달 불가 step 은 clamp)
  useEffect(() => {
    if (urlStep === state.step) {
      // URL 이 state 를 따라잡았을 때 — 보류된 다음 단계가 있으면 advance.
      if (pendingFinalStepRef.current != null && pendingFinalStepRef.current !== state.step) {
        const target = pendingFinalStepRef.current;
        pendingFinalStepRef.current = null;
        state.goTo(target);
      }
      return;
    }
    let target: IoStep = urlStep;
    for (let s = 1; s < target; s += 1) {
      if (!state.canAdvance[s as IoStep]) {
        target = s as IoStep;
        break;
      }
    }
    // URL 으로 들어온 변경은 pending 을 취소 (사용자가 뒤로/앞으로 누른 경우 자동 advance 중단).
    pendingFinalStepRef.current = null;
    skipNextPushRef.current = true;
    state.goTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStep]);

  useEffect(() => {
    if (operator?.employee_id && !employeeId) setEmployeeId(operator.employee_id);
  }, [operator?.employee_id, employeeId]);

  useEffect(() => {
    setSearch(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    let cancelled = false;
    api.getAllBOM()
      .then((rows: BOMDetailEntry[]) => {
        if (cancelled) return;
        setBomParents(new Set(rows.map((row) => row.parent_item_id)));
      })
      .catch(() => {
        // BOM 조회 실패 시 빈 set 유지 → "BOM 적용" 버튼은 모든 품목에서 disabled
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useIoDraftRestore({
    draftToRestore,
    restoredDraftRef,
    autosaveBatchIdRef,
    state,
    normalizeBundles,
    onStatusChange,
  });

  // 자동 저장: bundles 가 1개 이상이면 변경 700ms 후 백그라운드 저장.
  // - workType/subType/dept 변경 → bundles reset → 빈 상태에서는 저장 안 함
  // - 디바운스로 빠른 연속 입력(수량 +1 +1)은 마지막 한 번만 저장
  // - 실패해도 다음 변경 사이클에서 자동 재시도
  useEffect(() => {
    if (!employeeId) return;
    if (state.bundles.length === 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const result = await saveDraft({
          employeeId,
          workType: state.workType,
          subType: state.subType,
          fromDepartment: state.fromDepartment,
          toDepartment: state.toDepartment,
          referenceNo: state.referenceNo,
          notes: state.notes,
          bundles: state.bundles,
        });
        autosaveBatchIdRef.current = result.batch_id;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        onStatusChange(`자동 저장됨 · ${hh}:${mm}`);
      } catch {
        onStatusChange("자동 저장 실패 — 잠시 후 재시도");
      }
    }, 700);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.bundles,
    state.notes,
    state.referenceNo,
    state.fromDepartment,
    state.toDepartment,
    state.workType,
    state.subType,
    employeeId,
  ]);

  async function addItem(item: Item, sourceKind: IoSourceKind = "direct_item", subTypeOverride?: IoSubType) {
    setError(null);
    // setSubType은 다음 렌더로 미뤄지므로, previewTarget에는 effective 값을 즉시 전달.
    const effectiveSubType = subTypeOverride ?? state.subType;
    if (subTypeOverride && subTypeOverride !== state.subType) {
      state.setSubType(subTypeOverride);
    }
    try {
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: effectiveSubType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        target: { source_kind: sourceKind, item_id: item.item_id, quantity: 1 },
      });
      state.setBundles((prev) => [...prev, ...normalizeBundles(response.bundles)]);
      onStatusChange(`${item.item_name} 작업 묶음 생성`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "품목 전개에 실패했습니다.");
    }
  }

  useEffect(() => {
    if (!preselectedItem) return;
    if (preselectedHandledRef.current === preselectedItem.item_id) return;
    // process workType + 방향 미선택이면 자동 추가 보류 (Step 2에서 방향 선택 후 다시 진입해야 함)
    if (state.workType === "process" && state.deptIoDirection == null) return;
    preselectedHandledRef.current = preselectedItem.item_id;
    void addItem(preselectedItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedItem?.item_id, state.workType, state.deptIoDirection]);

  function getAvailable(line: IoLine): number | null {
    const item = items.find((row) => row.item_id === line.item_id);
    if (!item) return null;
    // 백엔드 Decimal 직렬화가 문자열로 내려와 산술이 string concat 으로 깨지는 것 방지 — Number 강제 변환.
    const warehouseAvail = () => {
      const wh = Number(item.warehouse_qty) || 0;
      const pending = Number(item.pending_quantity) || 0;
      return Math.max(0, wh - pending);
    };
    if (line.from_bucket === "warehouse") return warehouseAvail();
    if (line.from_bucket === "production") {
      return Number(locationQuantity(item, line.from_department, "PRODUCTION")) || 0;
    }
    if (line.from_bucket === "defective") {
      return Number(locationQuantity(item, line.from_department, "DEFECTIVE")) || 0;
    }
    // 입고 (from_bucket="none"): to_bucket 의 목적지 현재 재고
    if (line.to_bucket === "warehouse") return warehouseAvail();
    if (line.to_bucket === "production") {
      return Number(locationQuantity(item, line.to_department, "PRODUCTION")) || 0;
    }
    if (line.to_bucket === "defective") {
      return Number(locationQuantity(item, line.to_department, "DEFECTIVE")) || 0;
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
  }

  function handleWorkTypeChange(next: IoWorkType) {
    state.setWorkType(next);
    setError(null);
    state.goTo(2);
  }

  // 대시보드 빨간 [불량 N] 클릭으로 진입한 경우 (?defect_dept=X) 마운트 시 자동으로
  // 워크타입 "defect" 선택 + Step 2 로 진입. 1회만 실행.
  const defectAutoAppliedRef = useRef(false);
  useEffect(() => {
    if (
      defectDeptFilter
      && !defectAutoAppliedRef.current
      && state.workType !== "defect"
    ) {
      defectAutoAppliedRef.current = true;
      handleWorkTypeChange("defect");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defectDeptFilter]);

  async function handleDefectInventorySubmit() {
    const loc = state.defectSelectedLocation;
    if (!employeeId || !loc) return;
    setDefectSubmitting(true);
    try {
      const subType = state.subType;
      const action = state.defectAction;
      const lines = [{
        item_id: loc.item_id,
        quantity: loc.quantity,
        from_bucket: "defective" as const,
        from_department: loc.department as Department,
        to_bucket: "none" as const,
      }];
      if (subType === "defect_restore" || action === "restore") {
        await defectsApi.unquarantine({
          item_id: loc.item_id,
          qty: loc.quantity,
          dept: loc.department,
          reason_category: state.defectReasonCategory,
          reason_memo: state.defectReasonMemo,
          actor_employee_id: employeeId,
        });
        setResult({ kind: "success", title: "정상 복귀 완료", message: "격리 재고가 정상 복귀되었습니다." });
      } else if (subType === "supplier_return") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: employeeId,
          request_type: "defect_return",
          reason_category: state.defectReasonCategory,
          reason_memo: state.defectReasonMemo || null,
          notes: state.defectReasonMemo || null,
          lines,
        });
        setResult({ kind: "success", title: "결재 요청 완료", message: "창고 결재 요청이 제출되었습니다." });
      } else if (action === "scrap") {
        await stockRequestsApi.createStockRequest({
          requester_employee_id: employeeId,
          request_type: "defect_scrap",
          reason_category: state.defectReasonCategory,
          reason_memo: state.defectReasonMemo || null,
          notes: state.defectReasonMemo || null,
          lines,
        });
        setResult({ kind: "success", title: "결재 요청 완료", message: "창고 결재 요청이 제출되었습니다." });
      } else if (action === "disassemble") {
        const childDecisions = state.defectBomDecisions.map((d) => ({
          item_id: d.item_id,
          action: d.action,
          qty: d.qty,
        }));
        await stockRequestsApi.createStockRequest({
          requester_employee_id: employeeId,
          request_type: "defect_disassemble",
          reason_category: state.defectReasonCategory,
          reason_memo: state.defectReasonMemo || null,
          notes: JSON.stringify({ child_decisions: childDecisions }),
          lines,
        });
        setResult({ kind: "success", title: "결재 요청 완료", message: "창고 결재 요청이 제출되었습니다." });
      }
      state.reset();
      onStatusChange("불량 처리 완료");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setDefectSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    // 자동 저장 draft 가 동일 line_id 를 점유한 상태에서 submit 하면 IoLine PK 충돌(IntegrityError).
    // submit 호출 전에 대기 중 autosave 취소 + 기존 draft 삭제로 충돌을 피한다.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (autosaveBatchIdRef.current) {
      const staleId = autosaveBatchIdRef.current;
      autosaveBatchIdRef.current = null;
      try {
        await api.deleteDraft(staleId, employeeId);
      } catch {
        /* 이미 없거나 권한 변동 — submit 으로 진행 */
      }
    }
    try {
      const kind = approvalKind(state.subType, state.bundles);
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
      // 서버가 멱등 응답(409 → 기존 batch)이든 신규 처리든 동일한 IoSubmitResponse 모양 → 같은 흐름.
      // 결재 종류별로 토스트 문구 분기 (백엔드 response.message 는 fallback).
      const successTitle = response.requires_approval
        ? kind === "department"
          ? "부서 결재 요청 완료"
          : "창고 결재 요청 완료"
        : "입출고 반영 완료";
      setResult({
        kind: "success",
        title: successTitle,
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
  const stepTwoSummary = state.workType === "process"
    ? `${directionWord(state.deptIoDirection)} · ${state.toDepartment}`
    : `${subTypeText} · ${dept}`;
  const includedCount = state.includedLines.length;
  const excludedCount = state.excludedLines.length;
  const lineCount = state.bundles.reduce((acc, b) => acc + b.lines.length, 0);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);
  const stepState = (n: IoStep): "active" | "complete" | "locked" =>
    step === n ? "active" : step > n ? "complete" : "locked";
  const accent = isExitWorkType(state.workType) ? LEGACY_COLORS.red : LEGACY_COLORS.blue;
  const stepWrapperClass = (n: IoStep) => `flex flex-col${step > n ? " pt-[9px]" : ""}`;

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

    // top margin = gap-3 (12px). carbon 을 사이드바 bottom 까지 확장 — BOTTOM 음수 (clientH 측정이 실제 사이드바보다 작은 보정).
    const BOTTOM = 12;
    const STEP2_BOTTOM = -21;
    const STEP3_EMPTY_BOTTOM = -21;
    const STEP4_BOTTOM = 36;
    const STEP5_BOTTOM = -21;
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

      const bottom =
        s === 2
          ? STEP2_BOTTOM
          : s === 3 && state.bundles.length === 0
            ? STEP3_EMPTY_BOTTOM
            : s === 4
              ? STEP4_BOTTOM
              : s === 5
                ? STEP5_BOTTOM
                : BOTTOM;
      const newHeight = scrollContainer.clientHeight - wrapperTopInContainer - bottom;
      if (newHeight > 0) {
        const next = `${newHeight}px`;
        if (s === 4 || s === 5) {
          if (wrapper.style.height) wrapper.style.height = "";
          if (wrapper.style.minHeight !== next) wrapper.style.minHeight = next;
        } else {
          if (wrapper.style.minHeight) wrapper.style.minHeight = "";
          if (wrapper.style.height !== next) wrapper.style.height = next;
        }
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

        if (extendStep === 4) {
          if (extendWrapper.style.minHeight !== next) extendWrapper.style.minHeight = next;
        } else {
          if (extendWrapper.style.height !== next) extendWrapper.style.height = next;
        }
      }
    }

    // height 조정 후 표/카트 scrollTop 복원 — BOM/낱개 추가 시 스크롤 위치 유지.
    for (const [el, top] of scrollSnapshots) {
      if (el.scrollTop !== top) el.scrollTop = top;
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, state.bundles.length]);

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
        className={stepWrapperClass(1)}
      >
        <WizardStepCard
          n={1}
          title="작업 유형 선택"
          state={stepState(1)}
          summary={workTypeLabel(state.workType)}
          onChange={() => state.goTo(1)}
          accent={accent}
          fill={step === 1}
        >
          <IoWorkTypeStep workType={state.workType} operator={operator} onWorkTypeChange={handleWorkTypeChange} />
        </WizardStepCard>
      </div>

      {step >= 2 && (
        <div
          ref={(el) => { stepRefs.current[2] = el; }}
          className={stepWrapperClass(2)}
        >
          <WizardStepCard
              n={2}
              title="세부 작업과 부서 선택"
              state={stepState(2)}
              summary={stepTwoSummary}
              onChange={() => state.goTo(2)}
              accent={accent}
              fill={step === 2}
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
                    {state.canAdvance[2] ? "다음 단계로 →" : "세부 작업과 부서를 선택하세요"}
                  </Button>
                </div>
              </div>
            </WizardStepCard>
        </div>
      )}

      {step >= 3 && (
        <div
          ref={(el) => { stepRefs.current[3] = el; }}
          className={stepWrapperClass(3)}
        >
          <WizardStepCard
            n={3}
            title={
              state.workType === "defect" && isDefectInventorySubType(state.subType)
                ? "처리 대상 선택"
                : `${pickerDirectionLabel(state.subType)} 품목 선택`
            }
            state={stepState(3)}
            summary={`${state.bundles.length}개 묶음 · 라인 ${lineCount}개`}
            onChange={() => state.goTo(3)}
            accent={accent}
            fill={step === 3}
          >
            {state.workType === "defect" && isDefectInventorySubType(state.subType) ? (
              <DefectInventoryPicker
                department={state.fromDepartment}
                selected={state.defectSelectedLocation}
                onSelect={state.setDefectSelectedLocation}
                onAdvance={state.goNext}
              />
            ) : (
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
                search={search}
                onSearchChange={setSearch}
                onAddItem={(item, sourceKind, subTypeOverride) =>
                  addItem(item, sourceKind ?? "direct_item", subTypeOverride)}
                onAdvance={() => {
                  const step4El = stepRefs.current[4];
                  if (!step4El) return;
                  const scrollContainer = findScrollContainer(step4El);
                  if (!scrollContainer) return;
                  requestAnimationFrame(() => {
                    scrollToElement(scrollContainer, step4El, STEP4_SCROLL_OFFSET);
                  });
                }}
                busy={previewing}
              />
            )}
          </WizardStepCard>
        </div>
      )}

      {(step >= 4 || (step === 3 && state.bundles.length > 0)) && (
        <div
          ref={(el) => { stepRefs.current[4] = el; }}
          className={stepWrapperClass(4)}
        >
          <WizardStepCard
            n={4}
            title="품목 확인"
            state={(step === 3 && state.bundles.length > 0) || step === 4 ? "active" : stepState(4)}
            summary={`반영 ${includedCount}개 · 제외 ${excludedCount}개`}
            onChange={() => state.goTo(4)}
            accent={accent}
            fill={step === 4 || (step === 3 && state.bundles.length > 0)}
          >
            {state.workType === "defect" && isDefectInventorySubType(state.subType) && state.defectSelectedLocation ? (
              <DefectActionStep
                subType={state.subType}
                selectedLocation={state.defectSelectedLocation}
                action={state.defectAction}
                reasonCategory={state.defectReasonCategory}
                reasonMemo={state.defectReasonMemo}
                bomDecisions={state.defectBomDecisions}
                onActionChange={state.setDefectAction}
                onReasonChange={(cat, memo) => {
                  state.setDefectReasonCategory(cat);
                  state.setDefectReasonMemo(memo);
                }}
                onBomDecisionsChange={state.setDefectBomDecisions}
                canAdvance={state.canAdvance[4]}
                onAdvance={handleDefectInventorySubmit}
              />
            ) : (
            <IoBundleCart
              bundles={state.bundles}
              subType={state.subType}
              itemMap={itemMap}
              getAvailable={getAvailable}
              onToggleLine={(bundleId, lineId) =>
                state.setBundles((prev) =>
                  applyToggleLine(prev, bundleId, lineId, state.subType, getAvailable),
                )
              }
              onQuantityChange={(bundleId, lineId, quantity, shortage) =>
                state.setBundles((prev) =>
                  applyLineQuantityChange(prev, bundleId, lineId, quantity, shortage, state.subType, getAvailable),
                )
              }
              onBundleQuantityChange={(bundleId, newQty) =>
                state.setBundles((prev) =>
                  applyBundleQuantityChange(prev, bundleId, newQty, state.subType, getAvailable),
                )
              }
              onRemoveLine={state.removeLine}
              onRemoveBundle={(bundleId) =>
                state.setBundles((prev) => prev.filter((bundle) => bundle.bundle_id !== bundleId))
              }
              onAdvance={() => {
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
            />
            )}
          </WizardStepCard>
        </div>
      )}

      {step >= 5 && !(state.workType === "defect" && isDefectInventorySubType(state.subType)) && (
        <div
          ref={(el) => { stepRefs.current[5] = el; }}
          className={stepWrapperClass(5)}
        >
          <WizardStepCard
            n={5}
            title="최종 확인"
            state={stepState(5)}
            summary="제출 준비 완료"
            accent={accent}
            fill={step === 5}
          >
            <IoConfirmStep
              workType={state.workType}
              subType={state.subType}
              bundles={state.bundles}
              notes={state.notes}
              hasShortage={state.hasShortage}
              hasInvalidQuantity={state.hasInvalidQuantity}
              submitting={submitting || drafting}
              approvalKind={approvalKind(state.subType, state.bundles)}
              onNotesChange={state.setNotes}
              onSubmit={handleSubmit}
            />
          </WizardStepCard>
        </div>
      )}

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
    </div>
  );
}
