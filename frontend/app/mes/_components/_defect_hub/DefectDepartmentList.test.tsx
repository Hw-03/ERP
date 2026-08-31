import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefectDepartmentList } from "./DefectDepartmentList";
import type { DefectLocation } from "@/lib/api/types/defects";

const apiMocks = vi.hoisted(() => ({
  updateMemo: vi.fn(),
  getMemoHistory: vi.fn(),
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: apiMocks,
}));

const currentEmployee = {
  employee_id: "employee-editor",
  name: "메모 수정자",
  department: "Assembly",
};

function makeLocation(overrides: Partial<DefectLocation> = {}): DefectLocation {
  return {
    record_id: "record-1",
    item_id: "item-1",
    item_name: "AX-100",
    mes_code: "AX-001",
    department: "Assembly",
    quantity: 2,
    original_quantity: 2,
    pending_quantity: 0,
    available_quantity: 2,
    defective_at: "2026-07-01T00:00:00Z",
    reason_category: "dimension",
    reason_memo: "left bracket scratched",
    quarantined_by: "김길호",
    quarantined_by_employee_id: "employee-1",
    is_legacy: false,
    legacy_origin: null,
    has_bom: false,
    ...overrides,
  };
}

describe("DefectDepartmentList", () => {
  beforeEach(() => {
    apiMocks.updateMemo.mockReset();
    apiMocks.getMemoHistory.mockReset();
  });

  it("distinguishes an empty search result from an empty defect list", () => {
    const { rerender } = render(<DefectDepartmentList locations={[]} onProcess={vi.fn()} searchActive />);
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();

    rerender(<DefectDepartmentList locations={[]} onProcess={vi.fn()} />);
    expect(screen.getByText("격리된 불량 재고가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
  });

  it("renders only the defect reason in the row summary", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        onProcess={vi.fn()}
      />,
    );

    const reasonSummary = screen.getByTestId("defect-reason-summary");
    expect(reasonSummary).toHaveTextContent("격리 사유dimension");
    expect(reasonSummary).not.toHaveTextContent("left bracket scratched");
    expect(screen.getByText("left bracket scratched")).toBeInTheDocument();
  });

  it("renders a muted missing value with a wrapping reason value area", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation({ reason_category: null, reason_memo: "메모는 여기에만 표시" })]}
        onProcess={vi.fn()}
      />,
    );

    const reasonSummary = screen.getByTestId("defect-reason-summary");
    const missingReason = within(reasonSummary).getByText("미입력");
    expect(reasonSummary).toHaveTextContent("격리 사유미입력");
    expect(missingReason).toHaveClass("min-w-0", "flex-1", "break-words", "text-sm", "font-black");
    expect(reasonSummary).not.toHaveTextContent("메모는 여기에만 표시");
  });

  it("renders the quarantine date and actor together", () => {
    render(<DefectDepartmentList locations={[makeLocation()]} onProcess={vi.fn()} />);

    expect(screen.getByText("2026-07-01 09:00")).toBeInTheDocument();
    expect(screen.getByText("김길호")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
  });

  it("centers the summary columns and places the item code below the item name", () => {
    render(<DefectDepartmentList locations={[makeLocation()]} onProcess={vi.fn()} />);

    const item = screen.getByTestId("defect-item-summary");
    const quantity = screen.getByTestId("defect-remaining-quantity");
    const quarantine = screen.getByTestId("defect-quarantine-summary");

    expect(item).toHaveClass("lg:flex", "lg:flex-col", "lg:justify-center");
    expect(item).toHaveTextContent("AX-100AX-001");
    expect(quantity).toHaveClass("items-center", "justify-center", "text-center");
    expect(quarantine).toHaveClass("flex", "flex-col", "justify-center");
    expect(within(quarantine).getByText("2026-07-01 09:00")).toHaveClass("text-sm");
    expect(within(quarantine).getByText("김길호")).toHaveClass("text-base");
  });

  it("shows a single record's quarantine quantity without a redundant record count", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation({ quantity: 4, pending_quantity: 1, available_quantity: 3 })]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getByTestId("defect-remaining-quantity")).toHaveTextContent("격리 수량4개");
    expect(screen.getByTestId("defect-remaining-quantity")).not.toHaveTextContent("격리 1건");
    expect(screen.getByTestId("defect-record-grid")).toHaveClass(
      "lg:grid-cols-[minmax(0,1.15fr)_minmax(110px,0.38fr)_minmax(110px,0.38fr)_minmax(0,2fr)]",
    );
    expect(screen.queryByText("처리 가능 3개")).not.toBeInTheDocument();
    expect(screen.getByText("승인 대기 1개")).toBeInTheDocument();
  });

  it("flags only unresolved legacy aggregates, not reconstructed records", () => {
    render(
      <DefectDepartmentList
        locations={[
          makeLocation({
            record_id: "legacy-aggregate",
            item_id: "aggregate-item",
            item_name: "기존 합산 품목",
            is_legacy: true,
            legacy_origin: "aggregate",
          } as Partial<DefectLocation> & { legacy_origin: "aggregate" }),
          makeLocation({
            record_id: "legacy-reconstructed",
            item_id: "reconstructed-item",
            item_name: "기존 복원 품목",
            is_legacy: true,
            legacy_origin: "reconstructed",
          } as Partial<DefectLocation> & { legacy_origin: "reconstructed" }),
          makeLocation({
            record_id: "normal-record",
            item_id: "normal-item",
            item_name: "일반 격리 품목",
            is_legacy: false,
          }),
        ]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getByText("기존 합산")).toBeInTheDocument();
    expect(screen.queryByText("기존 복원")).not.toBeInTheDocument();
    expect(screen.getAllByText(/기존 (합산|복원)/, { selector: "span" })).toHaveLength(1);
  });

  it("groups same-item records into an initially collapsed item summary", () => {
    render(
      <DefectDepartmentList
        locations={[
          makeLocation({ record_id: "record-earlier", quantity: 4, reason_memo: "첫 기록", defective_at: "2026-07-01T00:00:00Z" }),
          makeLocation({ record_id: "record-latest", quantity: 6, reason_memo: "최근 기록", defective_at: "2026-07-02T01:30:00Z", quarantined_by: "최근 담당자" }),
        ]}
        onProcess={vi.fn()}
      />,
    );

    const summary = screen.getByTestId("defect-item-group-summary");
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(summary).toHaveClass("lg:min-h-[156px]");
    expect(summary).toHaveAttribute("style", expect.stringContaining("background: color-mix(in srgb,"));
    expect(summary).toHaveAttribute("style", expect.stringContaining("4%, transparent"));
    expect(summary).toHaveTextContent("격리 수량");
    expect(summary).toHaveTextContent("10개");
    expect(summary).toHaveTextContent("격리 2건");
    expect(summary).toHaveTextContent("최근 격리");
    expect(summary).toHaveTextContent("최근 담당자");
    expect(screen.queryByText("첫 기록")).not.toBeInTheDocument();
    expect(screen.queryByText("최근 기록")).not.toBeInTheDocument();

    fireEvent.click(summary);
    expect(summary).toHaveAttribute("style", expect.stringContaining("8%, transparent"));
  });

  it("expands only the selected item summary and keeps child records actionable", () => {
    const onProcess = vi.fn();
    render(
      <DefectDepartmentList
        locations={[
          makeLocation({ record_id: "record-first", reason_memo: "첫 기록" }),
          makeLocation({ record_id: "record-second", reason_memo: "둘째 기록" }),
          makeLocation({ record_id: "other-item", item_id: "item-2", item_name: "BX-200", mes_code: "BX-002", reason_memo: "다른 품목" }),
        ]}
        onProcess={onProcess}
      />,
    );

    const summary = screen.getByTestId("defect-item-group-summary");
    fireEvent.click(summary);

    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByTestId("defect-record-grid")).toHaveLength(3);
    expect(screen.getAllByTestId("defect-child-item-placeholder")).toHaveLength(2);
    expect(screen.getAllByTestId("defect-child-item-placeholder")[0]).toHaveTextContent("-");
    expect(screen.getAllByTestId("defect-child-item-placeholder")[0]).toHaveClass("items-center", "justify-center", "text-3xl");
    fireEvent.click(screen.getAllByRole("button", { name: "처리" })[1]);
    expect(onProcess).toHaveBeenCalledWith(expect.objectContaining({ record_id: "record-second" }));
  });

  it("does not merge matching item ids from different departments", () => {
    render(
      <DefectDepartmentList
        locations={[
          makeLocation({ record_id: "assembly-record-a", quantity: 2 }),
          makeLocation({ record_id: "assembly-record-b", quantity: 3 }),
          makeLocation({ record_id: "warehouse-record-a", department: "Warehouse", quantity: 7 }),
          makeLocation({ record_id: "warehouse-record-b", department: "Warehouse", quantity: 11 }),
        ]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("defect-item-group-summary")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Assembly.*격리 2건/ })).toHaveTextContent("5개");
    expect(screen.getByRole("button", { name: /Warehouse.*격리 2건/ })).toHaveTextContent("18개");
  });

  it.each([null, "", "   "])("renders an unknown actor for %j", (quarantinedBy) => {
    render(
      <DefectDepartmentList
        locations={[makeLocation({ quarantined_by: quarantinedBy })]}
        onProcess={vi.fn()}
      />,
    );

    expect(screen.getByText("처리자 미상")).toBeInTheDocument();
  });

  it("keeps expanded repeated item records independent and passes the selected record id", () => {
    const onProcess = vi.fn();
    render(
      <DefectDepartmentList
        locations={[
          makeLocation({ record_id: "record-first", reason_memo: "첫 기록" }),
          makeLocation({ record_id: "record-second", reason_memo: "둘째 기록" }),
        ]}
        onProcess={onProcess}
      />,
    );

    fireEvent.click(screen.getByTestId("defect-item-group-summary"));
    fireEvent.click(screen.getAllByRole("button", { name: "처리" })[1]);

    expect(onProcess).toHaveBeenCalledWith(
      expect.objectContaining({ record_id: "record-second" }),
    );
    expect(screen.getAllByTestId("defect-record-grid")[0]).toHaveClass(
      "lg:grid-cols-[minmax(0,1.15fr)_minmax(110px,0.38fr)_minmax(110px,0.38fr)_minmax(0,2fr)]",
    );
  });

  it("saves, cancels, reports failures, and expands memo history", async () => {
    const onMemoUpdated = vi.fn();
    apiMocks.updateMemo
      .mockResolvedValueOnce({ memo: "수정 메모", changed: true })
      .mockRejectedValueOnce(new Error("저장 실패"));
    apiMocks.getMemoHistory.mockResolvedValue([
      {
        revision_id: "revision-1",
        previous_memo: null,
        next_memo: "left bracket scratched",
        edited_by_employee_id: "employee-1",
        edited_by_name: "김길호",
        edited_at: "2026-07-01T00:00:00Z",
        is_initial: true,
      },
      {
        revision_id: "revision-2",
        previous_memo: "left bracket scratched",
        next_memo: "수정 메모",
        edited_by_employee_id: currentEmployee.employee_id,
        edited_by_name: currentEmployee.name,
        edited_at: "2026-07-02T01:30:00Z",
        is_initial: false,
      },
    ]);

    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        currentEmployee={currentEmployee}
        onMemoUpdated={onMemoUpdated}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    expect(screen.getByLabelText("직원 PIN")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "격리 메모" }), {
      target: { value: "취소할 값" },
    });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByDisplayValue("취소할 값")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "격리 메모" }), {
      target: { value: "수정 메모" },
    });
    fireEvent.change(screen.getByLabelText("직원 PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(apiMocks.updateMemo).toHaveBeenCalledWith("record-1", {
        memo: "수정 메모",
        actor_employee_id: currentEmployee.employee_id,
        pin: "0000",
      });
    });
    expect(onMemoUpdated).toHaveBeenCalledWith("record-1", "수정 메모");
    expect(screen.getByTestId("defect-reason-summary")).toHaveTextContent("격리 사유dimension");
    expect(screen.getByTestId("defect-reason-summary")).not.toHaveTextContent("수정 메모");

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "격리 메모" }), {
      target: { value: "실패 메모" },
    });
    fireEvent.change(screen.getByLabelText("직원 PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장 실패")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "메모 이력 보기" }));
    expect(await screen.findByText("최초 등록")).toBeInTheDocument();
    const memoHistory = screen.getByTestId("defect-memo-history");
    expect(within(memoHistory).getByText("변경 전: left bracket scratched")).toBeInTheDocument();
    expect(within(memoHistory).getByText("변경 후: 수정 메모")).toBeInTheDocument();
    expect(apiMocks.getMemoHistory).toHaveBeenCalledWith("record-1");
  });

  it("allows an employee from another department to open memo editing", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation({ department: "고압" })]}
        currentEmployee={{ ...currentEmployee, department: "기타" }}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));

    expect(screen.getByRole("textbox", { name: "격리 메모" })).toBeInTheDocument();
    expect(screen.getByLabelText("직원 PIN")).toBeInTheDocument();
  });

  it("keeps the PIN and memo actions on one desktop row", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        currentEmployee={currentEmployee}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));

    const actions = screen.getByTestId("defect-memo-actions");
    expect(actions).toHaveClass("lg:flex-nowrap");
    expect(within(actions).getByLabelText("직원 PIN")).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "저장" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "메모 이력 보기" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "처리" })).toBeInTheDocument();
  });

  it("auto-grows the memo field without a user resize handle", () => {
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        currentEmployee={currentEmployee}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    const memoField = screen.getByRole("textbox", { name: "격리 메모" });
    Object.defineProperty(memoField, "scrollHeight", { configurable: true, value: 96 });
    fireEvent.change(memoField, { target: { value: "첫 줄\n둘째 줄\n셋째 줄" } });

    expect(memoField).toHaveClass("resize-none", "overflow-hidden");
    expect(memoField).toHaveStyle({ height: "96px" });
  });

  it("saves the memo when Enter is pressed in the PIN field", async () => {
    apiMocks.updateMemo.mockResolvedValue({ memo: "Enter 저장", changed: true });
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        currentEmployee={currentEmployee}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "격리 메모" }), {
      target: { value: "Enter 저장" },
    });
    const pinField = screen.getByLabelText("직원 PIN");
    fireEvent.change(pinField, { target: { value: "0000" } });
    fireEvent.keyDown(pinField, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(apiMocks.updateMemo).toHaveBeenCalledWith("record-1", {
        memo: "Enter 저장",
        actor_employee_id: currentEmployee.employee_id,
        pin: "0000",
      });
    });
  });

  it("reloads an open memo history after a successful edit", async () => {
    apiMocks.getMemoHistory
      .mockResolvedValueOnce([
        {
          revision_id: "revision-initial",
          previous_memo: null,
          next_memo: "기존 메모",
          edited_by_employee_id: "employee-1",
          edited_by_name: "김길호",
          edited_at: "2026-07-01T00:00:00Z",
          is_initial: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          revision_id: "revision-new",
          previous_memo: "기존 메모",
          next_memo: "새 메모",
          edited_by_employee_id: currentEmployee.employee_id,
          edited_by_name: currentEmployee.name,
          edited_at: "2026-07-02T00:00:00Z",
          is_initial: false,
        },
      ]);
    apiMocks.updateMemo.mockResolvedValue({ memo: "새 메모", changed: true });
    render(
      <DefectDepartmentList
        locations={[makeLocation({ reason_memo: "기존 메모" })]}
        currentEmployee={currentEmployee}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 이력 보기" }));
    expect(await screen.findByText("최초 등록")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "메모 수정" }));
    fireEvent.change(screen.getByRole("textbox", { name: "격리 메모" }), {
      target: { value: "새 메모" },
    });
    fireEvent.change(screen.getByLabelText("직원 PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(apiMocks.getMemoHistory).toHaveBeenCalledTimes(2));
  });

  it("shows memo revisions newest first with before, after, date, and editor fields", async () => {
    apiMocks.getMemoHistory.mockResolvedValue([
      {
        revision_id: "revision-initial",
        previous_memo: null,
        next_memo: "(빈 메모)",
        edited_by_employee_id: "employee-1",
        edited_by_name: "김길호",
        edited_at: "2026-07-01T00:00:00Z",
        is_initial: true,
      },
      {
        revision_id: "revision-newest",
        previous_memo: "TEST 2",
        next_memo: "TEST 3",
        edited_by_employee_id: currentEmployee.employee_id,
        edited_by_name: currentEmployee.name,
        edited_at: "2026-07-03T01:30:00Z",
        is_initial: false,
      },
      {
        revision_id: "revision-older",
        previous_memo: "TEST",
        next_memo: "TEST 2",
        edited_by_employee_id: currentEmployee.employee_id,
        edited_by_name: currentEmployee.name,
        edited_at: "2026-07-02T01:30:00Z",
        is_initial: false,
      },
    ]);
    render(
      <DefectDepartmentList
        locations={[makeLocation()]}
        currentEmployee={currentEmployee}
        onProcess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "메모 이력 보기" }));
    const history = await screen.findByTestId("defect-memo-history");
    const revisions = within(history).getAllByRole("listitem");

    expect(within(revisions[0]).getByText("변경 전: TEST 2")).toBeInTheDocument();
    expect(within(revisions[0]).getByText("변경 후: TEST 3")).toBeInTheDocument();
    expect(within(revisions[0]).getByText("2026-07-03 10:30 · 메모 수정자")).toBeInTheDocument();
    expect(within(revisions[2]).getByText("최초 등록")).toBeInTheDocument();
  });
});
