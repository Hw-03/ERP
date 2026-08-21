import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
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

function RestoreShortageHarness({
  available,
  inventorySnapshot,
}: {
  available: number | null;
  inventorySnapshot: unknown;
}) {
  const restoredDraftRef = useRef<string | null>(null);
  const restoredNonceRef = useRef<number | null>(null);
  const autosaveBatchIdRef = useRef<string | null>(null);
  const [bundles, setBundles] = useState<IoBatch["bundles"]>([]);
  const draft = {
    ...makeDraft("internal_use_out"),
    work_type: "internal_use" as const,
    bundles: [
      {
        bundle_id: "shortage-bundle",
        source_kind: "bom_parent" as const,
        title: "부족 재계산 BOM",
        source_item_id: "parent-1",
        source_mes_code: null,
        quantity: 1,
        expanded_level: 1,
        internal_use_bom_mode: "children_only" as const,
        source_location: "warehouse" as const,
        lines: [
          {
            line_id: "shortage-line",
            item_id: "child-1",
            item_name: "부족 하위",
            mes_code: null,
            unit: "EA",
            direction: "out" as const,
            from_bucket: "warehouse" as const,
            from_department: null,
            to_bucket: "none" as const,
            to_department: "연구",
            quantity: 9,
            bom_expected: 4,
            included: true,
            selected: true,
            origin: "bom_auto" as const,
            edited: true,
            has_children: false,
            shortage: 0,
            exclusion_note: null,
          },
        ],
      },
    ],
  };
  const state = {
    fromDepartment: "조립",
    toDepartment: "연구",
    setWorkType: vi.fn(),
    setSubType: vi.fn(),
    setDeptIoDirectionRaw: vi.fn(),
    setFromDepartment: vi.fn(),
    setToDepartment: vi.fn(),
    setReferenceNo: vi.fn(),
    setNotes: vi.fn(),
    setBundles,
    goTo: vi.fn(),
  };

  useIoDraftRestore({
    draftToRestore: draft,
    restoreNonce: 1,
    restoredDraftRef,
    restoredNonceRef,
    autosaveBatchIdRef,
    state: state as never,
    onStatusChange: vi.fn(),
    getAvailable: () => available,
    inventorySnapshot,
  });

  return <span data-testid="restored-shortage">{bundles[0]?.lines[0]?.shortage ?? "-"}</span>;
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

  it("하위만 차감 임시저장의 하위 수량을 기준수량 또는 0으로 정규화한다", () => {
    const draft = {
      ...makeDraft("internal_use_out"),
      work_type: "internal_use" as const,
      bundles: [
        {
          bundle_id: "bundle-1",
          source_kind: "bom_parent" as const,
          title: "연구 BOM",
          source_item_id: "parent-1",
          source_mes_code: null,
          quantity: 2,
          expanded_level: 1,
          internal_use_bom_mode: "children_only" as const,
          source_location: "warehouse" as const,
          lines: [
            {
              line_id: "selected-line",
              item_id: "selected-item",
              item_name: "선택 하위",
              mes_code: null,
              unit: "EA",
              direction: "out" as const,
              from_bucket: "warehouse" as const,
              from_department: null,
              to_bucket: "none" as const,
              to_department: "연구",
              quantity: 31,
              bom_expected: 4,
              included: true,
              selected: true,
              origin: "bom_auto" as const,
              edited: true,
              has_children: false,
              shortage: 29,
              exclusion_note: null,
            },
            {
              line_id: "unselected-line",
              item_id: "unselected-item",
              item_name: "미선택 하위",
              mes_code: null,
              unit: "EA",
              direction: "out" as const,
              from_bucket: "warehouse" as const,
              from_department: null,
              to_bucket: "none" as const,
              to_department: "연구",
              quantity: 31,
              bom_expected: 6,
              included: false,
              selected: false,
              origin: "bom_auto" as const,
              edited: true,
              has_children: false,
              shortage: 20,
              exclusion_note: "변동 없음",
            },
          ],
        },
      ],
    };

    const restored = restoreInternalUseBundles(
      draft,
      (line) => (line.item_id === "selected-item" ? 2 : 0),
    );

    expect(restored[0].lines[0]).toMatchObject({
      quantity: 4,
      included: true,
      selected: true,
      edited: false,
      shortage: 2,
    });
    expect(restored[0].lines[1]).toMatchObject({
      quantity: 0,
      included: false,
      selected: false,
      edited: false,
      shortage: 0,
    });
  });

  it("상하위 차감 재입고와 재고 미반영 행은 기준수량을 보존한다", () => {
    const draft = {
      ...makeDraft("internal_use_out"),
      work_type: "internal_use" as const,
      bundles: [
        {
          bundle_id: "bundle-2",
          source_kind: "bom_parent" as const,
          title: "재입고 BOM",
          source_item_id: "parent-2",
          source_mes_code: null,
          quantity: 1,
          expanded_level: 1,
          internal_use_bom_mode: "parent_and_children" as const,
          source_location: "warehouse" as const,
          lines: [
            {
              line_id: "return-line",
              item_id: "return-item",
              item_name: "재입고 하위",
              mes_code: null,
              unit: "EA",
              direction: "in" as const,
              from_bucket: "none" as const,
              from_department: null,
              to_bucket: "production" as const,
              to_department: "조립",
              quantity: 99,
              bom_expected: 3,
              included: true,
              selected: false,
              origin: "bom_auto" as const,
              edited: true,
              has_children: false,
              shortage: 8,
              exclusion_note: "소속 부서 재입고",
            },
            {
              line_id: "exempt-line",
              item_id: "exempt-item",
              item_name: "미반영 하위",
              mes_code: null,
              unit: "EA",
              direction: "out" as const,
              from_bucket: "warehouse" as const,
              from_department: null,
              to_bucket: "none" as const,
              to_department: "연구",
              quantity: 99,
              bom_expected: 5,
              bom_stock_exempt: true,
              included: false,
              selected: false,
              origin: "bom_auto" as const,
              edited: true,
              has_children: false,
              shortage: 8,
              exclusion_note: "BOM 재고 미반영",
            },
          ],
        },
      ],
    };

    const restored = restoreInternalUseBundles(draft, () => 0);

    expect(restored[0].lines[0]).toMatchObject({
      quantity: 3,
      included: true,
      selected: false,
      edited: false,
      shortage: 0,
    });
    expect(restored[0].lines[1]).toMatchObject({
      quantity: 5,
      included: false,
      selected: false,
      edited: false,
      shortage: 0,
    });
  });

  it("품목 목록이 복원보다 늦게 준비되면 현재 수량의 부족분만 다시 계산한다", async () => {
    const { rerender } = render(
      <RestoreShortageHarness available={null} inventorySnapshot={[]} />,
    );
    await waitFor(() => expect(screen.getByTestId("restored-shortage")).toHaveTextContent("0"));

    rerender(<RestoreShortageHarness available={2} inventorySnapshot={["loaded"]} />);

    await waitFor(() => expect(screen.getByTestId("restored-shortage")).toHaveTextContent("2"));
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
