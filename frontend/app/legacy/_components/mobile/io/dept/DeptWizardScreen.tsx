"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, type Item } from "@/lib/api";
import { LEGACY_COLORS, employeeColor } from "../../../legacyUi";
import type { ToastState } from "../../../Toast";
import { IconButton, WizardHeader, type SummaryChip } from "../../primitives";
import { useEmployees } from "../../hooks/useEmployees";
import { usePackages } from "../../hooks/usePackages";
import { DEPT_STEPS } from "./deptWizardConfig";
import { useDeptWizard } from "./context";
import {
  StepConfirm,
  StepDepartment,
  StepDirection,
  StepItems,
  StepPerson,
} from "./DeptWizardSteps";

export function DeptWizardScreen({ showToast }: { showToast: (toast: ToastState) => void }) {
  const { state, dispatch } = useDeptWizard();
  const { employees, loading: employeesLoading } = useEmployees({ activeOnly: true });
  const { packages, loading: packagesLoading } = usePackages();
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

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

  const employee = useMemo(
    () => employees.find((e) => e.employee_id === state.employeeId) ?? null,
    [employees, state.employeeId],
  );

  const summaryChips: SummaryChip[] = useMemo(() => {
    const out: SummaryChip[] = [];
    if (state.department) {
      out.push({
        key: "dept",
        label: state.department,
        tone: employeeColor(state.department),
        onClick: state.step > 0 ? () => dispatch({ type: "GO", step: 0 }) : undefined,
      });
    }
    if (employee) {
      out.push({
        key: "employee",
        label: employee.name,
        tone: LEGACY_COLORS.green,
        onClick: state.step > 1 ? () => dispatch({ type: "GO", step: 1 }) : undefined,
      });
    }
    if (state.direction) {
      out.push({
        key: "direction",
        label: state.direction === "in" ? "입고" : "출고",
        tone: state.direction === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
        onClick: state.step > 2 ? () => dispatch({ type: "GO", step: 2 }) : undefined,
      });
    }
    if (state.step > 3) {
      if (state.usePackage && state.packageId) {
        out.push({
          key: "items",
          label: "패키지",
          tone: LEGACY_COLORS.purple,
          onClick: () => dispatch({ type: "GO", step: 3 }),
        });
      } else if (state.items.size > 0) {
        out.push({
          key: "items",
          label: `${state.items.size}건`,
          tone: LEGACY_COLORS.cyan,
          onClick: () => dispatch({ type: "GO", step: 3 }),
        });
      }
    }
    return out;
  }, [state, employee, dispatch]);

  const submit = async () => {
    if (!employee) {
      dispatch({ type: "SET_ERROR", error: "담당 직원을 선택해 주세요." });
      return;
    }
    if (!state.direction) {
      dispatch({ type: "SET_ERROR", error: "입고/출고를 선택해 주세요." });
      return;
    }
    if (state.usePackage && !state.packageId) {
      dispatch({ type: "SET_ERROR", error: "패키지를 선택해 주세요." });
      return;
    }
    if (!state.usePackage && state.items.size === 0) {
      dispatch({ type: "SET_ERROR", error: "품목을 1개 이상 선택해 주세요." });
      return;
    }

    dispatch({ type: "SET_SUBMITTING", value: true });
    dispatch({ type: "SET_ERROR", error: null });

    const producedBy = `${employee.name} (${state.department ?? ""})`;

    try {
      if (state.usePackage && state.packageId) {
        const qty = state.items.get("__PACKAGE__") ?? 1;
        await api.shipPackage({
          package_id: state.packageId,
          quantity: qty,
          reference_no: state.referenceNo || undefined,
          produced_by: producedBy,
          notes: state.note || undefined,
        });
        showToast({ type: "success", message: "패키지 출하가 완료되었습니다." });
        dispatch({ type: "RESET" });
      } else {
        const failures: string[] = [];
        const entries = Array.from(state.items.entries()).filter(([id]) => id !== "__PACKAGE__");
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
            if (state.direction === "in") await api.receiveInventory(payload);
            else await api.shipInventory(payload);
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
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "처리하지 못했습니다.";
      dispatch({ type: "SET_ERROR", error: msg });
      showToast({ type: "error", message: msg });
    } finally {
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  };

  const atFirst = state.step === 0;
  const stepMeta = DEPT_STEPS[state.step];

  return (
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
          disabled={atFirst}
          color={atFirst ? LEGACY_COLORS.muted : LEGACY_COLORS.text}
        />
        <div className="min-w-0 flex-1">
          <WizardHeader
            steps={DEPT_STEPS.map((s) => ({ key: s.key, label: s.label }))}
            current={state.step}
            chips={summaryChips}
          />
        </div>
        <IconButton
          icon={X}
          label="취소"
          size="md"
          onClick={() => {
            if (
              typeof window !== "undefined" &&
              (state.department != null || state.items.size > 0) &&
              !window.confirm("작성 중인 내용을 모두 취소할까요?")
            ) {
              return;
            }
            dispatch({ type: "RESET" });
          }}
          color={LEGACY_COLORS.muted2}
        />
      </div>

      {stepMeta?.key === "department" && <StepDepartment />}
      {stepMeta?.key === "person" && (
        <StepPerson employees={employees} loading={employeesLoading} />
      )}
      {stepMeta?.key === "direction" && <StepDirection />}
      {stepMeta?.key === "items" && (
        <StepItems
          items={items}
          itemsLoading={itemsLoading}
          packages={packages}
          packagesLoading={packagesLoading}
          showToast={showToast}
          onNext={() => {
            if (state.usePackage && !state.packageId) {
              dispatch({ type: "SET_ERROR", error: "패키지를 선택해 주세요." });
              return;
            }
            if (!state.usePackage && state.items.size === 0) {
              dispatch({ type: "SET_ERROR", error: "품목을 1개 이상 선택해 주세요." });
              return;
            }
            dispatch({ type: "NEXT" });
          }}
        />
      )}
      {stepMeta?.key === "confirm" && (
        <StepConfirm
          items={items}
          employee={employee}
          packages={packages}
          onSubmit={() => void submit()}
          onBack={() => dispatch({ type: "PREV" })}
        />
      )}
    </div>
  );
}
