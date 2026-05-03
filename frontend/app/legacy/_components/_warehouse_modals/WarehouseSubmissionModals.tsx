"use client";

import type { Department, Employee, Item, ShipPackage } from "@/lib/api";
import { ResultModal } from "../common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { WarehouseConfirmContent } from "./WarehouseConfirmContent";
import type { WorkType } from "../_warehouse_steps";

/**
 * Round-13 (#1) 추출 — DesktopWarehouseView 의 3 modal (Result + 2 Confirm) 묶음.
 *
 * 분해 전 부모 파일에서 ~75줄 차지. 모달 표시/닫힘/confirm 콜백은 부모 state 로 받는다.
 */
export interface WarehouseSubmissionModalsProps {
  resultModal:
    | { kind: "fail" | "partial"; successCount: number; failures: { name: string; reason: string }[] }
    | null;
  onCloseResult: () => void;
  onRetry: () => void;

  showConfirm: boolean;
  onCloseConfirm: () => void;
  onConfirmSubmit: () => Promise<void>;
  submitting: boolean;
  requiresApproval: boolean;
  isCaution: boolean;
  accent: string;

  selectedEmployee: Employee | null;
  effectiveLabel: string;
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  selectedPackage: ShipPackage | null;
  totalQty: number;
  notes: string;

  pendingDeptChange: Department | null;
  onClosePendingDept: () => void;
  onConfirmDeptChange: () => void;
}

export function WarehouseSubmissionModals(props: WarehouseSubmissionModalsProps) {
  const {
    resultModal, onCloseResult, onRetry,
    showConfirm, onCloseConfirm, onConfirmSubmit, submitting,
    requiresApproval, isCaution, accent,
    selectedEmployee, effectiveLabel, workType, selectedEntries, selectedPackage, totalQty, notes,
    pendingDeptChange, onClosePendingDept, onConfirmDeptChange,
  } = props;

  return (
    <>
      <ResultModal
        open={!!resultModal}
        kind={resultModal?.kind ?? "fail"}
        successCount={resultModal?.successCount ?? 0}
        failures={resultModal?.failures ?? []}
        onClose={onCloseResult}
        primaryAction={
          resultModal?.kind === "partial"
            ? { label: "실패 항목만 재시도", tone: "warning", onClick: onRetry }
            : resultModal?.kind === "fail"
              ? { label: "재시도", tone: "danger", onClick: onRetry }
              : undefined
        }
      />

      <ConfirmModal
        open={showConfirm}
        title={requiresApproval ? "창고 승인 요청 — 최종 확인" : "즉시 처리 — 최종 확인"}
        tone={isCaution ? "danger" : "normal"}
        cautionMessage={
          isCaution
            ? "되돌릴 수 없는 작업입니다. 내용을 다시 한 번 확인하세요."
            : requiresApproval
              ? "제출 후 창고 담당자(정/부)의 승인 전까지 실제 재고는 변경되지 않습니다."
              : undefined
        }
        onClose={onCloseConfirm}
        onConfirm={onConfirmSubmit}
        busy={submitting}
        busyLabel="처리 중..."
        confirmLabel={requiresApproval ? "요청 제출" : "즉시 처리"}
        confirmAccent={accent}
      >
        <WarehouseConfirmContent
          selectedEmployee={selectedEmployee}
          effectiveLabel={effectiveLabel}
          workType={workType}
          selectedEntries={selectedEntries}
          selectedPackage={selectedPackage}
          totalQty={totalQty}
          notes={notes}
        />
      </ConfirmModal>

      <ConfirmModal
        open={pendingDeptChange !== null}
        title="대상 부서 변경"
        tone="caution"
        confirmLabel="변경"
        onClose={onClosePendingDept}
        onConfirm={onConfirmDeptChange}
      >
        대상 부서를 변경하시겠습니까?
      </ConfirmModal>
    </>
  );
}
