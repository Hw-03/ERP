"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, type Item } from "@/lib/api";
import { LEGACY_COLORS } from "../../../legacyUi";
import { normalizeDepartment } from "@/lib/mes/department";
import type { ToastState } from "@/features/mes/shared/Toast";
import { IconButton, WizardHeader, type SummaryChip } from "../../primitives";
import { useEmployees } from "../../hooks/useEmployees";
import { WAREHOUSE_MODE_META, WAREHOUSE_STEPS, type WarehouseMode } from "./warehouseWizardConfig";
import { useWarehouseWizard } from "./context";
import { StepConfirm, StepItems, StepType } from "./WarehouseWizardSteps";
import { ConfirmModal } from "@/features/mes/shared/ConfirmModal";
import { useCurrentOperator } from "../../../login/useCurrentOperator";

export function WarehouseWizardScreen({ showToast }: { showToast: (toast: ToastState) => void }) {
  const { state, dispatch } = useWarehouseWizard();
  const { employees } = useEmployees({ activeOnly: true });
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const operator = useCurrentOperator();

  useEffect(() => {
    let cancelled = false;
    setItemsLoading(true);
    api
      .getItems({ limit: 2000 })
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setItemsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 로그인 담당자를 작업 담당자로 자동 주입 (DRAFT 복원값은 덮어쓰지 않음)
  useEffect(() => {
    if (operator && !state.employeeId) {
      dispatch({ type: "SET_EMPLOYEE", employeeId: operator.employee_id });
    }
  }, [operator, state.employeeId, dispatch]);

  const employee = useMemo(
    () => employees.find((e) => e.employee_id === state.employeeId) ?? null,
    [employees, state.employeeId],
  );

  const summaryChips: SummaryChip[] = useMemo(() => {
    const out: SummaryChip[] = [];
    if (state.mode) {
      const meta = WAREHOUSE_MODE_META[state.mode as WarehouseMode];
      out.push({
        key: "mode",
        label: meta.label,
        tone: LEGACY_COLORS.blue,
        onClick: state.step > 0 ? () => dispatch({ type: "GO", step: 0 }) : undefined,
      });
    }
    if (employee) {
      out.push({
        key: "employee",
        label: employee.name,
        tone: LEGACY_COLORS.green,
      });
    }
    if (state.items.size > 0 && state.step > 1) {
      out.push({
        key: "items",
        label: `${state.items.size}건`,
        tone: LEGACY_COLORS.cyan,
        onClick: () => dispatch({ type: "GO", step: 1 }),
      });
    }
    return out;
  }, [state.mode, state.step, state.items.size, employee, dispatch]);

  const submit = async () => {
    if (!employee) {
      dispatch({ type: "SET_ERROR", error: "로그인 정보를 확인해 주세요." });
      return;
    }
    if (state.items.size === 0) {
      dispatch({ type: "SET_ERROR", error: "품목을 선택해 주세요." });
      return;
    }

    dispatch({ type: "SET_SUBMITTING", value: true });
    dispatch({ type: "SET_ERROR", error: null });

    const producedBy = `${employee.name} (${normalizeDepartment(employee.department)})`;
    const entries = Array.from(state.items.entries());
    const failures: string[] = [];

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
        if (state.mode === "wh2d") await api.shipInventory(payload);
        else await api.receiveInventory(payload);
      } catch {
        failures.push(item?.item_name ?? itemId);
      }
    }

    dispatch({ type: "SET_SUBMITTING", value: false });

    if (failures.length > 0) {
      const msg = `처리 실패: ${failures.join(", ")}`;
      dispatch({ type: "SET_ERROR", error: msg });
      showToast({ type: "error", message: msg });
      return;
    }

    showToast({
      type: "success",
      message: `창고 입출고 ${entries.length}건 처리 완료`,
    });
    dispatch({ type: "RESET" });
  };

  const atFirstStep = state.step === 0;
  const stepMeta = WAREHOUSE_STEPS[state.step];

  return (
    <>
      <div className="flex flex-col">
        <div
          className="sticky top-0 z-10 flex items-start gap-2 border-b px-3 py-3"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <IconButton
            icon={ChevronLeft}
            label="이전 단계"
            size="md"
            onClick={() => dispatch({ type: "PREV" })}
            disabled={atFirstStep}
            color={atFirstStep ? LEGACY_COLORS.muted : LEGACY_COLORS.text}
          />
          <div className="min-w-0 flex-1">
            <WizardHeader
              steps={WAREHOUSE_STEPS.map((s) => ({ key: s.key, label: s.label }))}
              current={state.step}
              chips={summaryChips}
            />
          </div>
          <IconButton
            icon={X}
            label="취소"
            size="md"
            onClick={() => {
              if (state.mode != null || state.items.size > 0) {
                setCancelConfirmOpen(true);
                return;
              }
              dispatch({ type: "RESET" });
            }}
            color={LEGACY_COLORS.muted2}
          />
        </div>

        {stepMeta?.key === "type" && <StepType />}
        {stepMeta?.key === "items" && (
          <StepItems
            items={items}
            loading={itemsLoading}
            showToast={showToast}
            onNext={() => {
              if (state.items.size === 0) {
                dispatch({ type: "SET_ERROR", error: "품목을 1개 이상 선택해 주세요." });
                return;
              }
              dispatch({ type: "NEXT" });
            }}
          />
        )}
        {stepMeta?.key === "confirm" && (
          <StepConfirm items={items} employee={employee} onSubmit={() => void submit()} onBack={() => dispatch({ type: "PREV" })} />
        )}
      </div>

      <ConfirmModal
        open={cancelConfirmOpen}
        title="작성 취소"
        tone="caution"
        confirmLabel="취소"
        cancelLabel="계속 작성"
        onClose={() => setCancelConfirmOpen(false)}
        onConfirm={() => {
          setCancelConfirmOpen(false);
          dispatch({ type: "RESET" });
        }}
      >
        작성 중인 내용을 모두 취소할까요?
      </ConfirmModal>
    </>
  );
}
