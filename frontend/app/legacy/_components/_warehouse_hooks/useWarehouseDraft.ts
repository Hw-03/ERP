"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  api,
  type Department,
  type Item,
  type ShipPackage,
  type StockRequestType,
} from "@/lib/api";
import {
  buildStockRequestPayload,
  draftToFormState,
} from "../_warehouse_helpers/requestMapping";
import type {
  DefectiveSource,
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

/**
 * 창고 입출고 wizard 의 장바구니 자동저장(autosave) + 복원(restore) 흐름.
 *
 * Round-10A (#4) 추출. 종전 DesktopWarehouseView.tsx (837줄) 안의
 * state 4 + effect 2 + 외부 호출처 의존성을 단일 hook 으로 묶었다.
 *
 * 본 hook 이 책임지는 것:
 *   - currentDraftId / autoSaveStatus 상태
 *   - restoringRef (복원 중 autosave 차단 플래그)
 *   - autoSaveTimerRef (debounce 타이머)
 *   - debounced autosave effect (api.upsertStockRequestDraft)
 *   - sectionTab/workType 변경 시 draft 복원 effect (api.getStockRequestDraft)
 *
 * 본 hook 이 책임지지 않는 것 (의도):
 *   - handleContinueDraft / changeWorkType / submit 같은 wizard 결합형 로직
 *     → 컴포넌트에 남겨두고, 본 hook 의 setter / ref 를 destructure 받아 사용
 */

const AUTO_SAVE_DEBOUNCE_MS = 600;

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export type SectionTab = "compose" | "cart" | "mine" | "queue";

export interface UseWarehouseDraftDeps {
  operator: { employee_id: string } | null;
  selectedEmployee: { employee_id: string } | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: Department;
  defectiveSource: DefectiveSource;
  selectedItems: Map<string, number>;
  selectedPackage: ShipPackage | null;
  notes: string;
  referenceNo: string;
  currentRequestType: StockRequestType;
  sectionTab: SectionTab;
  selectedEntries: { item: Item; quantity: number }[];
  setSelectedItems: Dispatch<SetStateAction<Map<string, number>>>;
  setSelectedPackage: Dispatch<SetStateAction<ShipPackage | null>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setReferenceNo: Dispatch<SetStateAction<string>>;
}

export interface UseWarehouseDraftHandle {
  currentDraftId: string | null;
  setCurrentDraftId: Dispatch<SetStateAction<string | null>>;
  autoSaveStatus: AutoSaveStatus;
  setAutoSaveStatus: Dispatch<SetStateAction<AutoSaveStatus>>;
  restoringRef: MutableRefObject<boolean>;
  autoSaveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

export function useWarehouseDraft(deps: UseWarehouseDraftDeps): UseWarehouseDraftHandle {
  const {
    operator,
    selectedEmployee,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
    selectedItems,
    selectedPackage,
    notes,
    referenceNo,
    currentRequestType,
    sectionTab,
    selectedEntries,
    setSelectedItems,
    setSelectedPackage,
    setNotes,
    setReferenceNo,
  } = deps;

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const restoringRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── 장바구니 자동저장 (debounce) ───────────────────────────────────────────
  // 패키지 출고는 selectedPackage 정보가 lines 만으로 복원 불가하므로 제외.
  useEffect(() => {
    if (restoringRef.current) return;
    if (!operator || !selectedEmployee) return;
    if (workType === "package-out") return;

    const draftLines = buildStockRequestPayload({
      workType,
      rawDirection,
      warehouseDirection,
      deptDirection,
      selectedDept,
      defectiveSource,
      entries: selectedEntries,
      selectedPackage,
      requesterEmployeeId: selectedEmployee.employee_id,
      referenceNo,
      notes,
    }).lines;

    // lines 가 없고 기존 draft 도 없으면 저장 스킵 (workType 전환 직후 ghost draft 방지).
    if (draftLines.length === 0 && !currentDraftId) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (restoringRef.current) return;
      try {
        setAutoSaveStatus("saving");
        const draft = await api.upsertStockRequestDraft({
          requester_employee_id: selectedEmployee.employee_id,
          request_type: currentRequestType,
          reference_no: referenceNo || null,
          notes: notes || null,
          lines: draftLines,
        });
        setCurrentDraftId(draft.request_id);
        setAutoSaveStatus("saved");
      } catch {
        setAutoSaveStatus("error");
      }
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // selectedEntries 는 selectedItems 에서 파생되므로 selectedItems 만 의존성으로.
    // currentDraftId 는 본 effect 안에서 set 되므로 의존성 제외 (재진입 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    operator?.employee_id,
    selectedEmployee?.employee_id,
    workType,
    rawDirection,
    warehouseDirection,
    deptDirection,
    selectedDept,
    defectiveSource,
    selectedItems,
    selectedPackage,
    notes,
    referenceNo,
    currentRequestType,
  ]);

  // ─── 작업유형 변경 시 해당 request_type 의 draft 복원 ─────────────────────────
  // 없으면 currentDraftId 를 반드시 null 로 초기화 (stale id 로 다른 유형 draft 가
  // submit 되는 사고 방지).
  useEffect(() => {
    if (sectionTab !== "compose") return;
    if (!operator || !selectedEmployee) return;
    if (workType === "package-out") {
      setCurrentDraftId(null);
      setAutoSaveStatus("idle");
      return;
    }

    let cancelled = false;
    api
      .getStockRequestDraft(selectedEmployee.employee_id, currentRequestType)
      .then((draft) => {
        if (cancelled) return;
        if (!draft) {
          setSelectedItems(new Map());
          setSelectedPackage(null);
          setNotes("");
          setReferenceNo("");
          setCurrentDraftId(null);
          setAutoSaveStatus("idle");
          restoringRef.current = false;
          return;
        }
        // 복원 동안 autosave 재발동 차단.
        restoringRef.current = true;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        const restored = draftToFormState(draft);
        if (restored) {
          setSelectedItems(new Map(restored.selectedItems));
          setNotes(restored.notes);
          setReferenceNo(restored.referenceNo);
        }
        setCurrentDraftId(draft.request_id);
        setAutoSaveStatus("saved");
        setTimeout(() => {
          restoringRef.current = false;
        }, 0);
      })
      .catch(() => {
        if (!cancelled) restoringRef.current = false;
      });

    return () => {
      cancelled = true;
    };
    // setter 들은 stable 하므로 의존성 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sectionTab,
    operator?.employee_id,
    selectedEmployee?.employee_id,
    currentRequestType,
    workType,
  ]);

  return {
    currentDraftId,
    setCurrentDraftId,
    autoSaveStatus,
    setAutoSaveStatus,
    restoringRef,
    autoSaveTimerRef,
  };
}
