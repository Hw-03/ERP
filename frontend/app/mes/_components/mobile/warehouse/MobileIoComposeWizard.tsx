"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ArrowLeft, ScanLine } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  api,
  type BOMDetailEntry,
  type IoBundle,
  type IoLine,
  type IoSourceKind,
  type IoSubType,
  type IoWorkType,
  type Item,
} from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { IconButton, PrimaryActionButton, StickyFooter, WizardProgress } from "../primitives";
import { BarcodeScannerModal } from "../../BarcodeScannerModal";
import { MobileWorkTypeStep, MobileSubTypeStep } from "./MobileWorkTypeStep";
import { MobileSingleAdjustForm } from "./MobileSingleAdjustForm";
import { IoTargetPicker } from "../../_warehouse_v2/IoTargetPicker";
import { IoBundleCart } from "../../_warehouse_v2/IoBundleCart";
import { IoConfirmStep } from "../../_warehouse_v2/IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "../../_warehouse_v2/IoSubmitModals";
import { Toast, type ToastState } from "@/lib/ui/Toast";
import {
  approvalKind,
  isExitWorkType,
  isSingleInlineSubType,
  pickerDirectionLabel,
  targetDepartmentOf,
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
import type { IoComposeViewProps } from "../../_warehouse_v2/types";
import {
  collectShortageItemIds,
  shortageLines,
} from "../../_warehouse_v2/pullFromWarehouse";

/** IoComposeView 의 로컬 헬퍼 — 모바일에서도 동일 동작이 필요해 복제. */
function locationQuantity(
  item: Item,
  department: string | null | undefined,
  status: "PRODUCTION" | "DEFECTIVE",
) {
  if (!department) return 0;
  return (
    item.locations.find((loc) => loc.department === department && loc.status === status)
      ?.quantity ?? 0
  );
}

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
  defaultWorkType,
  entryIntent,
  onStatusChange,
  onSubmitSuccess,
  onDirtyChange,
  flushDraftRef,
}: IoComposeViewProps & {
  // 모바일 전용 — 섹션 탭 이탈 가드(D2)용. 데스크톱 IoComposeView 는 미사용.
  onDirtyChange?: (dirty: boolean) => void;
  flushDraftRef?: MutableRefObject<(() => void) | null>;
}) {
  const [employeeId, setEmployeeId] = useState(operator?.employee_id ?? "");
  const [search, setSearch] = useState(globalSearch);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IoSubmitResultState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [bomParents, setBomParents] = useState<Set<string>>(() => new Set());
  const [pullSelected, setPullSelected] = useState<Set<string>>(() => new Set());
  // 가드 key 는 `${item_id}__${workType}` — workType 변경 시 bundles reset 되므로
  // 같은 preselectedItem 이라도 재적용되어야 한다.
  const preselectedHandledRef = useRef<string | null>(null);
  // BOM 부모 품목으로 진입한 경우 자동 추가하지 않고 picker 에서 row 만 강조.
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const restoredDraftRef = useRef<string | null>(null);
  // 마지막으로 복원을 발동시킨 '이어서 하기' nonce — 같은 draft 재선택 재발동 판정용.
  const restoredNonceRef = useRef<number | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);

  const state = useIoWorkState(defaultWorkType, operator?.department);
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
  const { submitting, submit } = useIoSubmit();

  useEffect(() => {
    if (operator?.employee_id && !employeeId) setEmployeeId(operator.employee_id);
  }, [operator?.employee_id, employeeId]);

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
  }, []);

  useIoDraftRestore({
    draftToRestore,
    restoreNonce,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state,
    onStatusChange,
  });

  // 작성 중(담은 묶음 있음) 여부를 상위(MobileWarehouseScreen)에 보고 — 섹션 이탈 가드용.
  useEffect(() => {
    onDirtyChange?.(state.bundles.length > 0);
  }, [state.bundles.length, onDirtyChange]);

  // 이탈 직전 상위가 draft autosave 를 즉시 flush 할 수 있게 핸들을 노출(700ms 디바운스
  // 창에서 마지막 변경이 유실되지 않도록). 매 렌더 최신 클로저로 갱신, 언마운트 시 해제.
  useEffect(() => {
    if (!flushDraftRef) return;
    flushDraftRef.current = () => {
      void handleSaveDraft();
    };
    return () => {
      flushDraftRef.current = null;
    };
  });

  async function addItem(
    item: Item,
    sourceKind: IoSourceKind = "direct_item",
    subTypeOverride?: IoSubType,
  ) {
    setError(null);
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
    if (line.to_bucket === "warehouse") return warehouseAvail();
    if (line.to_bucket === "production") {
      return Number(locationQuantity(item, line.to_department, "PRODUCTION")) || 0;
    }
    if (line.to_bucket === "defective") {
      return Number(locationQuantity(item, line.to_department, "DEFECTIVE")) || 0;
    }
    return null;
  }

  // 부서/세부작업 변경 시 임시저장 슬롯을 끊어 새 슬롯으로 시작한다.
  // (안 하면 다음 저장이 이전 draft 를 덮어써 손실.)
  function beginNewCompositionSlot() {
    autosaveBatchIdRef.current = null;
    // 새 작업 슬롯 — 복원 추적 해제. 같은 '이어서 작업' 재선택 시 재복원 보장.
    restoredDraftRef.current = null;
    restoredNonceRef.current = null;
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

  async function handleSaveDraft() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
    }
    if (state.bundles.length === 0) return;
    try {
      const response = await saveDraft({
        employeeId,
        workType: state.workType,
        subType: state.subType,
        fromDepartment: state.fromDepartment,
        toDepartment: state.toDepartment,
        referenceNo: state.referenceNo,
        notes: state.notes,
        bundles: state.bundles,
      });
      autosaveBatchIdRef.current = response.batch_id;
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

  function togglePull(lineId: string) {
    setPullSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  async function pullFromWarehouse() {
    if (!employeeId || !operator?.department) return;
    const itemIds = collectShortageItemIds(state.bundles, pullSelected);
    if (itemIds.length === 0) return;
    await handleSaveDraft();
    const newBundles: IoBundle[] = [];
    for (const itemId of itemIds) {
      try {
        const res = await previewTarget({
          employeeId,
          workType: "warehouse_io",
          subType: "warehouse_to_dept",
          toDepartment: operator.department,
          target: { source_kind: "manual", item_id: itemId, quantity: 1 },
        });
        newBundles.push(...res.bundles);
      } catch {}
    }
    if (newBundles.length === 0) return;
    state.setWorkType("warehouse_io");
    state.setSubType("warehouse_to_dept");
    state.setToDepartment(operator.department);
    autosaveBatchIdRef.current = null; // 새 슬롯 — 기존 임시저장과 연결 끊기
    restoredDraftRef.current = null;
    restoredNonceRef.current = null;
    state.setBundles(newBundles);
    setPullSelected(new Set());
    state.goTo(4);
  }

  async function handleSubmit() {
    if (!employeeId) {
      setError("작업자를 선택하세요.");
      return;
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
      const successTitle = response.requires_approval
        ? kind === "department"
          ? "부서 결재 요청 완료"
          : "창고 결재 요청 완료"
        : "입출고 반영 완료";
      setResult({ kind: "success", title: successTitle, message: response.message });
      state.reset();
      onStatusChange(response.message);
      try {
        const refreshed = await api.getItems({
          limit: 2000,
          search: globalSearch.trim() || undefined,
        });
        setItems(refreshed);
      } catch {
        /* ignore refresh failure */
      }
      onSubmitSuccess?.();
    } catch (err) {
      const message =
        err instanceof ApiError && err.isUnavailable
          ? "서버가 다른 작업을 처리 중입니다. 잠시 후 다시 시도하세요."
          : err instanceof Error
          ? err.message
          : "제출 중 오류가 발생했습니다.";
      setResult({ kind: "error", title: "제출 실패", message });
    }
  }

  const step = state.step;
  const itemMap = useMemo(() => new Map(items.map((item) => [item.item_id, item])), [items]);

  const stepTitle =
    step === 1
      ? "작업 유형 선택"
      : step === 2
      ? "세부 작업과 부서"
      : step === 3
      ? `${pickerDirectionLabel(state.subType)} 품목 선택`
      : step === 4
      ? "품목 확인"
      : "최종 확인";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col" style={{ background: LEGACY_COLORS.bg }}>
      {/* 헤더: 뒤로 + 진행바. in-flow(non-scroll 첫 자식)라 셸 헤더 아래에 머물며 본문만
          스크롤된다. (이전 fixed top-0 는 셸 헤더 DEXCOWIN MES 를 덮는 버그였음)
          항목 6 — 페이지 배경과 같은 톤으로 두어 위 섹션 탭과 자연스럽게 이어지게(카드감 제거). */}
      <div
        className="z-10 flex shrink-0 items-center gap-2 border-b px-3 py-2"
        style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}
      >
        {step > 1 ? (
          <IconButton icon={ArrowLeft} label="이전 단계" size="md" onClick={state.goPrev} />
        ) : (
          <div className="h-11 w-11 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <WizardProgress steps={STEP_META} current={step - 1} />
        </div>
      </div>

      {/* 항목 2-3 — 단계 제목을 스크롤 컨테이너 밖(고정)으로. H2 36px가 컨테이너 안에 있으면
          Step1·2 의 min-h-full 자식과 합쳐져 오버플로우→스크롤이 생긴다. 밖으로 빼면 본문이
          컨테이너 높이를 그대로 채워 스크롤이 사라진다. Step3~5 는 그대로 스크롤 허용. */}
      <h2
        className="shrink-0 px-3 pt-3 pb-2 text-base font-black"
        style={{ color: LEGACY_COLORS.text }}
      >
        {stepTitle}
      </h2>

      {/* 본문: 현재 스텝만 스크롤. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
              if (had) onStatusChange("방향 변경으로 작업 묶음을 초기화했습니다.");
            }}
          />
        )}

        {step === 3 &&
          (isSingleInlineSubType(state.subType) ? (
            <MobileSingleAdjustForm
              subType={state.subType}
              items={items}
              bundles={state.bundles}
              search={search}
              onSearchChange={setSearch}
              onAddItem={(item) => {
                void addItem(item, "manual");
              }}
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
              onSubmit={() => {
                void handleSubmit();
              }}
              submitting={submitting}
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
                search={search}
                onSearchChange={setSearch}
                highlightItemId={highlightItemId}
                onAddItem={(item, sourceKind, subTypeOverride) =>
                  addItem(item, sourceKind ?? "direct_item", subTypeOverride)
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
            pullEnabled={state.subType === "produce"}
            pullSelected={pullSelected}
            onTogglePull={togglePull}
            onPullFromWarehouse={pullFromWarehouse}
            pullCount={
              pullSelected.size > 0
                ? pullSelected.size
                : shortageLines(state.bundles).length
            }
            onToggleLine={(bundleId, lineId) =>
              state.setBundles((prev) =>
                applyToggleLine(prev, bundleId, lineId, state.subType, getAvailable),
              )
            }
            onQuantityChange={(bundleId, lineId, quantity, shortage) =>
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
              )
            }
            onBundleQuantityChange={(bundleId, newQty) =>
              state.setBundles((prev) =>
                applyBundleQuantityChange(prev, bundleId, newQty, state.subType, getAvailable),
              )
            }
            onRemoveLine={state.removeLine}
            onRemoveBundle={(bundleId) =>
              state.setBundles((prev) =>
                prev.filter((bundle) => bundle.bundle_id !== bundleId),
              )
            }
            onAdvance={() => {
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
            onSubmit={handleSubmit}
            onSaveDraft={handleSaveDraft}
          />
        )}
      </div>

      {/* 썸존 하단 액션 — Step 2 만 (1=자동advance, 3=picker 내부 advance,
          4=cart 내부버튼, 5=confirm 내부버튼). Step3 는 이중 하단바 방지로 제외. */}
      {step === 2 && (
        <StickyFooter>
          <PrimaryActionButton
            label={state.canAdvance[2] ? "다음 단계로 →" : "세부 작업과 부서를 선택하세요"}
            intent={isExitWorkType(state.workType) ? "danger" : "primary"}
            disabled={!state.canAdvance[2]}
            onClick={() => {
              if (state.canAdvance[2]) state.goNext();
            }}
          />
        </StickyFooter>
      )}

      <IoSubmitModals result={result} onClose={() => setResult(null)} />
      <Toast toast={toast} onClose={() => setToast(null)} />

      {scanOpen && (
        <BarcodeScannerModal
          onDetected={handleScanDetected}
          onClose={() => setScanOpen(false)}
        />
      )}
    </div>
  );
}
