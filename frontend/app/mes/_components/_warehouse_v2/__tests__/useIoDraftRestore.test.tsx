import { useRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch, IoSubType } from "@/lib/api";
import { useIoDraftRestore } from "../useIoDraftRestore";

function makeDraft(subType: IoSubType): IoBatch {
  return {
    batch_id: `draft-${subType}`,
    work_type: subType === "adjust_in" || subType === "adjust_out" ? "process" : "warehouse_io",
    sub_type: subType,
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "김현우",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: "조립",
    to_department: "조립",
    requires_approval: false,
    stock_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [],
  };
}

function Harness({ subType, goTo }: { subType: IoSubType; goTo: (step: number) => void }) {
  const restoredDraftRef = useRef<string | null>(null);
  const restoredNonceRef = useRef<number | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);
  const state = {
    fromDepartment: "조립",
    toDepartment: "조립",
    setWorkType: vi.fn(),
    setSubType: vi.fn(),
    setDeptIoDirectionRaw: vi.fn(),
    setFromDepartment: vi.fn(),
    setToDepartment: vi.fn(),
    setReferenceNo: vi.fn(),
    setNotes: vi.fn(),
    setBundles: vi.fn(),
    goTo,
  };

  useIoDraftRestore({
    draftToRestore: makeDraft(subType),
    restoreNonce: 1,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state: state as never,
    onStatusChange: vi.fn(),
  });

  return null;
}

describe("useIoDraftRestore", () => {
  it("restores single adjust drafts to the inline item form step", async () => {
    const goTo = vi.fn();
    render(<Harness subType="adjust_out" goTo={goTo} />);

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(3));
  });

  it("keeps normal drafts on the cart confirmation step", async () => {
    const goTo = vi.fn();
    render(<Harness subType="warehouse_to_dept" goTo={goTo} />);

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(4));
  });
});
