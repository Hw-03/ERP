"use client";

import { useCallback } from "react";
import { api, type Department, type Employee, type Item } from "@/lib/api";
import type { ToastState } from "@/lib/ui/Toast";
import { useDeptWizard } from "./context";

/**
 * Round-13 (#19) 추출 — DeptWizardScreen 의 submit 핸들러 hook.
 *
 * dispatch + state 는 useDeptWizard context 에서 직접 읽고, 외부 의존 (employee/items/showToast) 만 인자로.
 */
export function useDeptWizardSubmit({
  employee,
  items,
  showToast,
}: {
  employee: Employee | null;
  items: Item[];
  showToast: (toast: ToastState) => void;
}) {
  const { state, dispatch } = useDeptWizard();

  return useCallback(async () => {
    if (!employee) {
      dispatch({ type: "SET_ERROR", error: "로그인 정보를 확인해 주세요." });
      return;
    }
    if (!state.direction) {
      dispatch({ type: "SET_ERROR", error: "입고/출고를 선택해 주세요." });
      return;
    }
    if (state.items.size === 0) {
      dispatch({ type: "SET_ERROR", error: "품목을 1개 이상 선택해 주세요." });
      return;
    }
    if (state.direction === "out" && !state.department) {
      dispatch({ type: "SET_ERROR", error: "부서를 선택해 주세요." });
      return;
    }

    dispatch({ type: "SET_SUBMITTING", value: true });
    dispatch({ type: "SET_ERROR", error: null });

    const producedBy = `${employee.name} (${state.department ?? ""})`;

    try {
      const failures: string[] = [];
      const entries = Array.from(state.items.entries());
      for (const [itemId, qty] of entries) {
        const item = items.find((i) => i.item_id === itemId);
        const payload = {
          item_id: itemId,
          quantity: qty,
          reference_no: state.referenceNo || undefined,
          produced_by: producedBy,
          notes: state.note || undefined,
        };
        try {
          if (state.direction === "in") {
            await api.receiveInventory(payload);
          } else {
            await api.transferToWarehouse({
              ...payload,
              department: state.department as Department,
            });
          }
        } catch {
          failures.push(item?.item_name ?? itemId);
        }
      }
      if (failures.length > 0) {
        const msg = `처리 실패: ${failures.join(", ")}`;
        dispatch({ type: "SET_ERROR", error: msg });
        showToast({ type: "error", message: msg });
      } else {
        showToast({
          type: "success",
          message: `부서 ${state.direction === "in" ? "입고" : "출고"} ${entries.length}건 처리 완료`,
        });
        dispatch({ type: "RESET" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "처리하지 못했습니다.";
      dispatch({ type: "SET_ERROR", error: msg });
      showToast({ type: "error", message: msg });
    } finally {
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  }, [employee, items, showToast, state, dispatch]);
}
