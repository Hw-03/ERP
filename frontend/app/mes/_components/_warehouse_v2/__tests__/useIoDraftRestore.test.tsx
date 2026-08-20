import { useRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { IoBatch, IoSubType } from "@/lib/api";
import { restoreInternalUseBundles, useIoDraftRestore } from "../useIoDraftRestore";

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

function Harness({
  subType,
  goTo,
  restoreStep,
}: {
  subType: IoSubType;
  goTo: (step: number) => void;
  restoreStep?: 1 | 2 | 3 | 4 | 5;
}) {
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
    restoreStep,
  });

  return null;
}

describe("useIoDraftRestore", () => {
  it("legacy internal-use BOM draft를 기존 하위만 차감 방식으로 복원한다", () => {
    const draft = {
      ...makeDraft("internal_use_out"),
      work_type: "internal_use" as const,
      bundles: [
        {
          bundle_id: "legacy-bundle",
          source_kind: "bom_parent" as const,
          title: "기존 BOM",
          source_item_id: "parent-1",
          source_mes_code: null,
          quantity: 1,
          expanded_level: 1,
          lines: [
            {
              line_id: "legacy-line",
              item_id: "child-1",
              item_name: "기존 하위",
              mes_code: null,
              unit: "EA",
              direction: "out" as const,
              from_bucket: "production" as const,
              from_department: "고압",
              to_bucket: "none" as const,
              to_department: "연구",
              quantity: 1,
              bom_expected: 1,
              included: true,
              origin: "bom_auto" as const,
              edited: false,
              has_children: false,
              shortage: 0,
              exclusion_note: null,
            },
          ],
        },
      ],
    };

    const restored = restoreInternalUseBundles(draft);

    expect(restored[0].internal_use_bom_mode).toBe("children_only");
    expect(restored[0].source_location).toBe("department");
    expect(restored[0].lines[0].selected).toBe(true);
  });

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

  it("restores the requested URL step after a responsive shell change", async () => {
    const goTo = vi.fn();
    render(<Harness subType="warehouse_to_dept" goTo={goTo} restoreStep={5} />);

    await waitFor(() => expect(goTo).toHaveBeenCalledWith(5));
  });

  it("does not reapply an already restored draft when only the URL step changes", async () => {
    const goTo = vi.fn();
    const { rerender } = render(
      <Harness subType="warehouse_to_dept" goTo={goTo} restoreStep={4} />,
    );
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(4));

    rerender(<Harness subType="warehouse_to_dept" goTo={goTo} restoreStep={5} />);

    expect(goTo).toHaveBeenCalledTimes(1);
  });
});
