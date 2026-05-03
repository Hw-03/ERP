"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { api, type Employee, type Item, type ShipPackage } from "@/lib/api";
import type { WorkType, Direction, TransferDirection, DefectiveSource } from "../_warehouse_steps";
import { buildStockRequestPayload } from "./requestMapping";

/**
 * Round-15 (#1) 추출 — DesktopWarehouseView 의 submit 핸들러 hook.
 *
 * 단일 통합 제출(/api/stock-requests) + 후속 setter 배선만 담당.
 * 검증/UI 흐름 (showConfirm, error message 톤 등) 은 본 hook 외부에서 처리.
 */
export interface UseWarehouseSubmitInput {
  selectedEmployee: Employee | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
  selectedDept: import("@/lib/api").Department;
  defectiveSource: DefectiveSource;
  selectedEntries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  referenceNo: string;
  notes: string;
  currentDraftId: string | null;
  effectiveLabel: string;
  requiresApproval: boolean;
  globalSearch: string;
  setItems: (items: Item[]) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  setLastResult: Dispatch<SetStateAction<{ count: number; label: string } | null>>;
  setResultModal: Dispatch<
    SetStateAction<
      | {
          kind: "fail" | "partial";
          successCount: number;
          failures: { name: string; reason: string }[];
        }
      | null
    >
  >;
  setCurrentDraftId: (v: string | null) => void;
  setAutoSaveStatus: (v: "idle" | "saving" | "saved" | "error") => void;
  setReferenceNo: Dispatch<SetStateAction<string>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setSelectedItems: Dispatch<SetStateAction<Map<string, number>>>;
  setStep2Confirmed: (v: boolean) => void;
  setForcedStep: (v: 1 | 2 | null) => void;
  setPanelRefreshNonce: Dispatch<SetStateAction<number>>;
  autoSaveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onStatusChange: (status: string) => void;
  onSubmitSuccess?: () => void;
}

export function useWarehouseSubmit(input: UseWarehouseSubmitInput) {
  return useCallback(async () => {
    const {
      selectedEmployee, workType, rawDirection, warehouseDirection, deptDirection,
      selectedDept, defectiveSource, selectedEntries, selectedPackage,
      referenceNo, notes, currentDraftId, effectiveLabel, requiresApproval,
      globalSearch,
      setItems, setError, setSubmitting, setLastResult, setResultModal,
      setCurrentDraftId, setAutoSaveStatus, setReferenceNo, setNotes,
      setSelectedItems, setStep2Confirmed, setForcedStep, setPanelRefreshNonce,
      autoSaveTimerRef, onStatusChange, onSubmitSuccess,
    } = input;

    if (!selectedEmployee) return setError("담당 직원을 먼저 선택해 주세요.");
    if (workType === "package-out" && !selectedPackage)
      return setError("출고할 패키지를 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.length === 0)
      return setError("품목을 먼저 선택해 주세요.");
    if (workType !== "package-out" && selectedEntries.some((e) => e.quantity <= 0))
      return setError("모든 선택 품목의 수량은 1 이상이어야 합니다.");

    try {
      setSubmitting(true);
      setError(null);

      const payload = buildStockRequestPayload({
        workType, rawDirection, warehouseDirection, deptDirection,
        selectedDept, defectiveSource,
        entries: selectedEntries, selectedPackage,
        requesterEmployeeId: selectedEmployee.employee_id,
        referenceNo, notes,
      });

      // 진행 중인 autosave 가 submit 직후의 빈 form 으로 덮어쓰는 일 방지.
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      try {
        if (currentDraftId) {
          // 기존 draft 가 있으면 submit 으로 전환.
          await api.submitStockRequestDraft(
            currentDraftId,
            selectedEmployee.employee_id,
          );
        } else {
          // draft 가 없는 경우(예: package-out 또는 막 진입) 안전망으로 직접 생성.
          await api.createStockRequest(payload);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "요청 처리를 완료하지 못했습니다.";
        setResultModal({ kind: "fail", successCount: 0, failures: [{ name: "요청 제출", reason }] });
        return;
      }

      // 승인 필요/불필요 모두 items 갱신.
      try {
        const refreshed = await api.getItems({ limit: 2000, search: globalSearch.trim() || undefined });
        setItems(refreshed);
      } catch {
        /* 후속 작업 우선 */
      }

      const doneCount = workType !== "package-out" ? selectedEntries.length : 1;
      setCurrentDraftId(null);
      setAutoSaveStatus("idle");
      setReferenceNo("");
      setNotes("");
      setSelectedItems(new Map());
      setStep2Confirmed(false);
      setForcedStep(null);
      setLastResult({ count: doneCount, label: effectiveLabel });
      const finishedMessage = requiresApproval
        ? `${effectiveLabel} — 창고 승인 요청을 제출했습니다.`
        : `${effectiveLabel} ${workType !== "package-out" ? selectedEntries.length + "건 " : ""}처리를 완료했습니다.`;
      onStatusChange(finishedMessage);
      setPanelRefreshNonce((n) => n + 1);
      onSubmitSuccess?.();
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "처리를 완료하지 못했습니다.";
      setResultModal({ kind: "fail", successCount: 0, failures: [{ name: "실행", reason: message }] });
      onStatusChange(message);
    } finally {
      setSubmitting(false);
    }
  }, [input]);
}
