"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { api, type Item } from "@/lib/api";
import { LEGACY_COLORS } from "../../../legacyUi";
import { useDeptColor } from "../../../DepartmentsContext";
import type { ToastState } from "@/lib/ui/Toast";
import { IconButton, WizardHeader, type SummaryChip } from "../../primitives";
import { useEmployees } from "../../hooks/useEmployees";
import { usePackages } from "../../hooks/usePackages";
import { DEPT_STEPS } from "./deptWizardConfig";
import { useDeptWizard } from "./context";
import { useDeptWizardSubmit } from "./useDeptWizardSubmit";
import {
  StepConfirm,
  StepDepartment,
  StepDirection,
  StepItems,
} from "./DeptWizardSteps";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { useCurrentOperator } from "../../../login/useCurrentOperator";

export function DeptWizardScreen({ showToast }: { showToast: (toast: ToastState) => void }) {
  const { state, dispatch } = useDeptWizard();
  const { employees } = useEmployees({ activeOnly: true });
  const { packages, loading: packagesLoading } = usePackages();
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const operator = useCurrentOperator();
  const deptColor = useDeptColor(state.department);

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
    if (state.department) {
      out.push({
        key: "dept",
        label: state.department,
        tone: deptColor,
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
    if (state.direction) {
      out.push({
        key: "direction",
        label: state.direction === "in" ? "입고" : "출고",
        tone: state.direction === "in" ? LEGACY_COLORS.green : LEGACY_COLORS.red,
        onClick: state.step > 1 ? () => dispatch({ type: "GO", step: 1 }) : undefined,
      });
    }
    if (state.step > 2) {
      if (state.usePackage && state.packageId) {
        out.push({
          key: "items",
          label: "패키지",
          tone: LEGACY_COLORS.purple,
          onClick: () => dispatch({ type: "GO", step: 2 }),
        });
      } else if (state.items.size > 0) {
        out.push({
          key: "items",
          label: `${state.items.size}건`,
          tone: LEGACY_COLORS.cyan,
          onClick: () => dispatch({ type: "GO", step: 2 }),
        });
      }
    }
    return out;
  }, [state, employee, dispatch, deptColor]);

  const submit = useDeptWizardSubmit({ employee, items, showToast });

  const atFirst = state.step === 0;
  const stepMeta = DEPT_STEPS[state.step];

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
              if (state.department != null || state.items.size > 0) {
                setCancelConfirmOpen(true);
                return;
              }
              dispatch({ type: "RESET" });
            }}
            color={LEGACY_COLORS.muted2}
          />
        </div>

        {stepMeta?.key === "department" && <StepDepartment />}
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
