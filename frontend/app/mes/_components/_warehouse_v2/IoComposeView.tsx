"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { Button } from "@/lib/ui/Button";
import { Toast, type ToastState } from "@/lib/ui/Toast";
import { tint } from "@/lib/mes/colorUtils";
import { api, type BOMDetailEntry, type IoBundle, type IoLine, type IoSourceKind, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { WizardStepCard } from "./_atoms";
import { IoWorkTypeStep, IoSubTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { IO_WORK_TYPES, approvalKind, deptVisibility, directionWord, isExitWorkType, pickerDirectionLabel, requiresDepartments, subTypeLabel, targetDepartmentOf } from "./ioWorkType";
import { applyBundleQuantityChange, applyLineQuantityChange, applyToggleLine } from "./bomSync";
import { useIoDraftRestore } from "./useIoDraftRestore";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { useIoWorkState, type IoStep } from "./useIoWorkState";
import { useIoUrlSync } from "./useIoUrlSync";
import { useIoPreselect } from "./useIoPreselect";
import { useRegisterDirty } from "@/lib/ui/dirty-guard";
import type { IoComposeViewProps } from "./types";

function locationQuantity(item: Item, department: string | null | undefined, status: "PRODUCTION" | "DEFECTIVE") {
  if (!department) return 0;
  return item.locations.find((loc) => loc.department === department && loc.status === status)?.quantity ?? 0;
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
  entryIntent,
  onStatusChange,
  onSubmitSuccess,
}: IoComposeViewProps) {
  const [employeeId, setEmployeeId] = useState(operator?.employee_id ?? "");
  const [search, setSearch] = useState(globalSearch);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // BOM 부모 item_id 집합 — process workType에서 "BOM 적용" 버튼 활성 판단용. 마운트 시 1회 fetch.
  const [bomParents, setBomParents] = useState<Set<string>>(() => new Set());
  // BOM 적재 완료 플래그 — useIoPreselect 의 race 가드 (S1: 빈 set 상태에서 BOM 부모를 일반 품목으로 오인하던 결함).
  const [bomParentsLoaded, setBomParentsLoaded] = useState(false);
  // BOM 부모 품목으로 진입한 경우 자동 추가하지 않고 Step 3 picker 에서 row 만 강조한다.
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const restoredDraftRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);
  // '저장하시겠습니까?' 경고용 — 사용자가 작업 내용을 입력/수정했는지.
  // 자동저장은 이 값을 끄지 않는다(경고를 막지 않음). 복원 직후·명시적 저장 후엔 false 로 리셋.
  const [contentDirty, setContentDirty] = useState(false);
  // 콘텐츠 변경 effect 의 마운트 첫 실행을 건너뛰기 위한 플래그(초기 빈 상태를 수정으로 오인 방지).
  const dirtyEffectMountedRef = useRef(false);
  // content-effect 가 이미 흡수한 복원 세대(restoredDraftRef.current) — 복원 직후 첫 변경은 수정으로 안 침.
  const absorbedRestoreRef = useRef<string | null>(null);

  const state = useIoWorkState(defaultWorkType, operator?.department);
  const intentAppliedRef = useRef(false);

  const { previewing, previewTarget } = useIoPreview();
  const { drafting, saveDraft } = useIoDraft();
  const { submitting, submit } = useIoSubmit();

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
    tabParam: "warehouse",
  });

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
    state.goTo(3);
  // entryIntent는 마운트 시 1회만 적용 — deps 배열에 state 함수 넣으면 재실행되므로 의도적으로 생략.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIntent]);

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
  }, []);

  useIoDraftRestore({
    draftToRestore,
    restoredDraftRef,
    autosaveBatchIdRef,
    state,
    onStatusChange,
  });

  // 사용자가 작업 내용(번들/메모/참조/부서/유형)을 바꾸면 contentDirty=true.
  // - 마운트 첫 실행은 건너뛴다(초기 빈 상태).
  // - 복원으로 내용이 바뀐 첫 변경은 수정으로 치지 않는다(복원 직후 그대로 나가면 경고 없음).
  //   복원 effect 가 restoredDraftRef 를 새 batch_id 로 갱신하므로, 그 세대를 처음 만나면 흡수만 한다.
  // - 자동저장은 내용을 바꾸지 않으므로 이 effect 를 트리거하지 않는다 → 경고를 막지 않음.
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
          batchId: autosaveBatchIdRef.current,
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
      // 이미 같은 품목이 카트에 있으면 수량 합산, 없으면 append.
      const existingIdx = state.bundles.findIndex((b) => b.source_item_id === item.item_id);
      const prevQty = existingIdx !== -1 ? state.bundles[existingIdx].quantity : 0;
      const response = await previewTarget({
        employeeId,
        workType: state.workType,
        subType: effectiveSubType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        target: { source_kind: sourceKind, item_id: item.item_id, quantity: prevQty + 1 },
      });
      const newBundles = response.bundles;
      if (existingIdx !== -1) {
        state.setBundles((prev) => {
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
    addItem,
    setHighlightItemId,
  });

  // 빠른작업 진입 시: BOM 없는(낱개) 품목은 자동 카트 추가가 끝나면 Step4(수량 확인)로 바로 보낸다.
  // BOM 부모는 Step3 에서 사용자가 BOM/낱개를 골라야 하므로 그대로 둔다. 진입당 1회.
  const entryLeafAdvancedRef = useRef(false);
  useEffect(() => {
    if (entryLeafAdvancedRef.current) return;
    if (!entryIntent || !preselectedItem || !bomParentsLoaded) return;
    if (bomParents.has(preselectedItem.item_id)) {
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

  // 입출고 작업 중(bundles 있음) 다른 화면으로 이동 시 '저장할까요?' 모달.
  // 자동 저장은 그대로 작동 — '저장하지 않고 이동' 선택 시에는 discard 콜백으로
  // 이미 백엔드에 저장된 임시본을 삭제해 사용자 의도와 일치시킨다.
  // 경고 조건: 작업 내용이 있고(번들>0) 로그인 상태에서, 마지막 저장/복원 이후 사용자가 수정했을 때.
  // 자동저장은 contentDirty 를 끄지 않으므로, 저장 버튼을 직접 누르거나 복원 직후가 아니면 경고가 뜬다.
  const ioDirty = state.bundles.length > 0 && !!employeeId && contentDirty;
  useRegisterDirty(
    "warehouse-io",
    ioDirty,
    async () => {
      if (!employeeId) return;
      if (state.bundles.length === 0) return;
      const saved = await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        batchId: autosaveBatchIdRef.current,
        bundles: state.bundles,
      });
      autosaveBatchIdRef.current = saved.batch_id;
    },
    async () => {
      // '저장하지 않고 이동' — 펜딩 autosave 취소 + 이미 저장된 batch 삭제.
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const batchId = autosaveBatchIdRef.current;
      if (batchId && employeeId) {
        try {
          await api.deleteDraft(batchId, employeeId);
        } catch {
          /* 폐기 실패도 진행 — 사용자가 이미 폐기 선택 */
        }
        autosaveBatchIdRef.current = null;
      }
    },
  );

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
    // 입고 (from_bucket="none"): to_bucket 의 목적지 현재 재고
    if (line.to_bucket === "warehouse") return warehouseAvail();
    if (line.to_bucket === "production") {
      return Number(locationQuantity(item, line.to_department, "PRODUCTION")) || 0;
    }
    return null;
  }

  // 새 작업 시작(작업유형/세부작업/부서 변경) — 진행 중 임시저장 슬롯과의 연결을 끊는다.
  // 그래야 다음 저장이 기존 슬롯을 덮지 않고 새 슬롯으로 쌓여 '작업 중' 탭에 누적된다.
  function beginNewCompositionSlot() {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveBatchIdRef.current = null;
  }

  function changeFromDepartment(next: string) {
    state.setFromDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      beginNewCompositionSlot();
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
  }

  function changeToDepartment(next: string) {
    state.setToDepartment(next);
    if (state.bundles.length > 0) {
      state.setBundles([]);
      beginNewCompositionSlot();
      onStatusChange("부서 변경으로 작업 묶음을 초기화했습니다.");
    }
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

  async function handleSaveDraft() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    if (state.bundles.length === 0) return;
    // 자동 저장과 동일 batch 를 갱신 — 대기 중 autosave 는 취소.
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    try {
      const response = await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        batchId: autosaveBatchIdRef.current,
        bundles: state.bundles,
      });
      autosaveBatchIdRef.current = response.batch_id;
      setContentDirty(false); // 저장 버튼으로 명시적 저장 → 이후 수정 전까지 경고 없음
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      onStatusChange(`저장됨 · ${hh}:${mm}`);
      setToast({ message: "저장되었습니다. 나중에 이어서 진행할 수 있습니다.", type: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.";
      setToast({ message, type: "error" });
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
      const kind = approvalKind(state.subType, state.bundles, state.fromDepartment);
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
  const stepTwoSummary = (() => {
    if (state.workType === "process") {
      return `${directionWord(state.deptIoDirection)} · ${state.toDepartment}`;
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
            title={`${pickerDirectionLabel(state.subType)} 품목 선택`}
            state={stepState(3)}
            summary={`${state.bundles.length}개 묶음 · 라인 ${lineCount}개`}
            onChange={() => state.goTo(3)}
            accent={accent}
            fill={step === 3}
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
              search={search}
              onSearchChange={setSearch}
              highlightItemId={highlightItemId}
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
              hasShortage={state.hasShortage}
            />
          </WizardStepCard>
        </div>
      )}

      {step >= 5 && (
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

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
