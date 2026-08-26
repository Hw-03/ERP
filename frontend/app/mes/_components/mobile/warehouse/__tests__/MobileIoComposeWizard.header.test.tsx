import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { MobileIoComposeWizard } from "../MobileIoComposeWizard";

const wizardState = vi.hoisted(() => ({
  step: 5,
  workType: "warehouse_io",
  subType: "warehouse_to_dept",
  fromDepartment: null,
  toDepartment: "조립",
  bundles: [],
  notes: "",
  hasShortage: false,
  hasInvalidQuantity: false,
  canAdvance: { 4: false },
  setBundles: vi.fn(),
  setNotes: vi.fn(),
  goTo: vi.fn(),
  goPrev: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(() => new Promise(() => {})),
    getItems: vi.fn(() => Promise.resolve([])),
    submitDraft: vi.fn(),
  },
}));

vi.mock("../../../_warehouse_v2/useIoWorkState", () => ({
  useIoWorkState: () => wizardState,
}));

vi.mock("../../../_warehouse_v2/useIoDraftRestore", () => ({
  useIoDraftRestore: ({ draftToRestore, autosaveBatchIdRef }: {
    draftToRestore?: { batch_id: string } | null;
    autosaveBatchIdRef: { current: string | null };
  }) => {
    autosaveBatchIdRef.current = draftToRestore?.batch_id ?? null;
  },
}));

vi.mock("../../../_warehouse_v2/useIoDraft", () => ({
  useIoDraft: () => ({ drafting: false, saveDraft: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/useIoPreview", () => ({
  useIoPreview: () => ({ previewing: false, previewTarget: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/useIoSubmit", () => ({
  useIoSubmit: () => ({ submitting: false, submit: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/IoConfirmStep", () => ({
  IoConfirmStep: ({ onSubmit }: { onSubmit: () => void }) => (
    <button type="button" onClick={onSubmit}>모바일 제출</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.submitDraft).mockResolvedValue({
    requires_approval: true,
    message: "부서 결재 요청이 생성되었습니다.",
  });
});

describe("MobileIoComposeWizard Step 5 헤더", () => {
  it("4단계를 수량 조정으로 안내한다", () => {
    const originalStep = wizardState.step;
    wizardState.step = 4;
    try {
      render(
        <MobileIoComposeWizard
          globalSearch=""
          operator={null}
          items={[]}
          setItems={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );

      expect(screen.getByText("수량 조정")).toBeInTheDocument();
      expect(screen.queryByText("품목 확인")).not.toBeInTheDocument();
    } finally {
      wizardState.step = originalStep;
    }
  });

  it("keeps 24px of content padding on the work-type step for the common tab-bar gap", () => {
    const originalStep = wizardState.step;
    wizardState.step = 1;
    try {
      render(
        <MobileIoComposeWizard
          globalSearch=""
          operator={null}
          items={[]}
          setItems={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );

      const workTypeButton = screen.getByRole("button", { name: /부서 입출고/ });
      expect(workTypeButton.parentElement?.parentElement).toHaveClass("pb-6");
    } finally {
      wizardState.step = originalStep;
    }
  });

  it("최종 확인에서는 본문 카드와 겹치는 하단 구분선을 렌더하지 않는다", () => {
    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={null}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const title = screen.getByText("최종 확인");
    const header = title.parentElement?.parentElement;
    expect(header).not.toBeNull();
    expect(header).not.toHaveClass("border-b");
  });

  it("작성 중으로 복귀한 작업의 반려 사유를 작성 화면 상단에 표시하지 않는다", () => {
    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={null}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
        restoreDraft={{
          batch_id: "rejected-draft", work_type: "process", sub_type: "adjust_out", status: "draft",
          requester_employee_id: "employee-1", requester_name: "요청자", requester_department: "조립",
          approver_employee_id: null, approver_name: null, from_department: "조립", to_department: null,
          requires_approval: true, stock_request_id: null, reference_no: null, notes: "수정 메모",
          created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
          submitted_at: null, completed_at: null, bundles: [],
          stock_requests: [
            {
              stock_request_id: "old", request_code: "SR-old", status: "rejected", from_bucket: "production",
              from_department: "조립", approval_kind: "department", requires_warehouse_approval: false,
              requires_department_approval: true, approver_employee_id: null, approver_name: null,
              rejected_by_name: "이전 결재자", rejected_at: "2026-08-04T00:05:00Z", rejected_reason: "이전 사유",
            },
            {
              stock_request_id: "new", request_code: "SR-new", status: "rejected", from_bucket: "production",
              from_department: "조립", approval_kind: "department", requires_warehouse_approval: false,
              requires_department_approval: true, approver_employee_id: null, approver_name: null,
              rejected_by_name: "최신 결재자", rejected_at: "2026-08-04T01:05:00Z", rejected_reason: "최신 사유",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("반려 사유: 최신 사유")).not.toBeInTheDocument();
    expect(screen.queryByText(/최신 결재자.*2026년 08월 04일 10시 05분/)).not.toBeInTheDocument();
    expect(screen.queryByText("반려 사유: 이전 사유")).not.toBeInTheDocument();
  });

  it("작업자 전환 뒤에는 현재 작업자 ID로 기존 초안을 제출한다", async () => {
    const previousOperator = {
      employee_id: "dept-approver",
      name: "이전 결재자",
      department: "조립",
      warehouse_role: "none" as const,
    };
    const currentOperator = {
      employee_id: "assembly-staff",
      name: "현재 작업자",
      department: "조립",
      warehouse_role: "none" as const,
    };
    const restoreDraft = {
      batch_id: "mobile-operator-switch-draft", work_type: "process", sub_type: "produce", status: "draft",
      requester_employee_id: previousOperator.employee_id, requester_name: previousOperator.name, requester_department: "조립",
      approver_employee_id: null, approver_name: null, from_department: "조립", to_department: "조립",
      requires_approval: true, stock_request_id: null, reference_no: null, notes: null,
      created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-04T00:00:00Z",
      submitted_at: null, completed_at: null, bundles: [],
    } as never;
    const view = render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={previousOperator}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
        restoreDraft={restoreDraft}
      />,
    );

    view.rerender(
      <MobileIoComposeWizard
        globalSearch=""
        operator={currentOperator}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
        restoreDraft={restoreDraft}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "모바일 제출" }));

    await waitFor(() => {
      expect(api.submitDraft).toHaveBeenCalledWith(
        "mobile-operator-switch-draft",
        currentOperator.employee_id,
      );
    });
  });
});
