import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequestBucket, StockRequest, StockRequestLine } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { MyRequestRow } from "../MyRequestRow";

function makeLine(
  index: number,
  fromBucket: RequestBucket = "none",
  toBucket: RequestBucket = "warehouse",
): StockRequestLine {
  return {
    line_id: `line-${index}`,
    request_id: "req-1",
    item_id: `item-${index}`,
    item_name_snapshot: `테스트 품목 ${index}`,
    mes_code_snapshot: `3-TR-${String(index).padStart(4, "0")}`,
    quantity: index,
    from_bucket: fromBucket,
    from_department: null,
    to_bucket: toBucket,
    to_department: null,
    status: "submitted",
    created_at: "2026-08-27T00:00:00Z",
  };
}

function makeRequest(overrides: Partial<StockRequest> = {}): StockRequest {
  return {
    request_id: "req-1",
    request_type: "warehouse_to_dept",
    status: "completed",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    submitted_at: "2026-08-04T00:05:00Z",
    created_at: "2026-07-02T00:00:00Z",
    notes: null,
    operation_batch_id: null,
    rejected_reason: null,
    lines: [],
    ...overrides,
  } as StockRequest;
}

describe("MyRequestRow request timestamp", () => {
  it("groups request type, status, full KST timestamp, and flow summary in the header", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          lines: [
            {
              line_id: "line-1",
              mes_code_snapshot: "46-AR-0093",
              item_name_snapshot: "ADX4000W LVDS Cable",
              quantity: 2,
              from_department: "창고",
              to_department: "조립",
            },
          ],
        })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("my-request-heading").textContent?.replace(/\s/g, "")).toBe(
      "창고→부서창고→조립·1건완료",
    );
    expect(screen.getByText("창고 → 부서")).toHaveClass("text-xl");
    expect(screen.getByTestId("my-request-summary")).toHaveTextContent("창고 → 조립 · 1건");
    expect(screen.getByText("2026년 08월 04일 09시 05분")).toHaveClass(
      "self-center",
      "text-base",
      "font-bold",
    );
  });

  it("자동 부서 혼합 요청은 첫 라인 대신 여러 부서로 요약한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          lines: [
            { ...makeLine(1, "warehouse", "production"), to_department: "조립" },
            { ...makeLine(2, "warehouse", "production"), to_department: "고압" },
          ],
        })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("my-request-summary")).toHaveTextContent("여러 부서 · 2건");
  });

  it("부서간 이동은 여러 부서로 축약하지 않고 실제 출발·도착 부서를 표시한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          request_type: "dept_internal",
          lines: [
            { ...makeLine(1, "production", "production"), from_department: "튜브", to_department: "고압" },
            { ...makeLine(2, "production", "production"), from_department: "튜브", to_department: "고압" },
          ],
        })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("my-request-summary")).toHaveTextContent("튜브 → 고압 · 2건");
  });

  it("상대시간 대신 실제 제출 일시를 표시", () => {
    render(
      <MyRequestRow
        req={makeRequest()}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 08월 04일 09시 05분")).toBeInTheDocument();
    expect(screen.queryByText(/(?:방금 전|분 전|시간 전|일 전)/)).not.toBeInTheDocument();
  });

  it("제출 일시가 없으면 생성 일시를 표시", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          submitted_at: null,
          created_at: "2026-08-03T15:05:00Z",
        })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("2026년 08월 04일 00시 05분")).toBeInTheDocument();
  });
});

describe("MyRequestRow presentation", () => {
  it.each(["submitted", "reserved"] as const)(
    "%s 상태를 승인 대기로 표시",
    (status) => {
      render(
        <MyRequestRow
          req={makeRequest({ status })}
          onCancelRequest={vi.fn()}
        />,
      );

      expect(screen.getByText("승인 대기")).toHaveStyle({ color: LEGACY_COLORS.yellow });
    },
  );

  it("품목을 3열로 표시하고 5건 이후는 기존 더보기로 펼침", () => {
    render(
      <MyRequestRow
        req={makeRequest({ lines: Array.from({ length: 6 }, (_, index) => makeLine(index + 1)) })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("품목명")).toBeInTheDocument();
    expect(screen.getByText("품목 코드")).toBeInTheDocument();
    expect(screen.getByText("요청 수량")).toBeInTheDocument();
    expect(screen.getByText("+1개")).toBeInTheDocument();
    expect(screen.queryByText("테스트 품목 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "외 1건 더보기" }));

    expect(screen.getByText("테스트 품목 6")).toBeInTheDocument();
  });

  it("비고를 16px 보조 본문으로 표시", () => {
    render(
      <MyRequestRow
        req={makeRequest({ notes: "출고 테스트" })}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("출고 테스트").closest("div")).toHaveClass("text-base");
  });

  it("반려 사유를 16px 경고 박스로 표시", () => {
    const { container } = render(
      <MyRequestRow
        req={makeRequest({ status: "rejected", rejected_reason: "테스트 확인" })}
        onCancelRequest={vi.fn()}
      />,
    );

    const rejection = screen.getByTestId("my-request-rejection");
    const header = container.querySelector("[data-stock-request-id] > div");
    const headerMeta = screen.getByTestId("my-request-heading").parentElement;
    expect(header).not.toBeNull();
    expect(headerMeta).toHaveClass("self-center");
    expect(within(header as HTMLElement).getByTestId("my-request-rejection")).toBe(rejection);
    expect(rejection).toHaveClass("rounded-[12px]", "border", "px-3", "py-2", "text-base");
    expect(rejection).toHaveClass("order-last", "basis-full", "lg:order-none", "lg:flex-1");
    expect(rejection).toHaveStyle({
      background: LEGACY_COLORS.errorBg,
      color: LEGACY_COLORS.red,
    });
    expect(screen.getByText("반려 사유:")).toHaveClass("font-bold");
    expect(screen.getByText("테스트 확인")).toBeInTheDocument();
  });

  it("비고와 수정·요청 취소 버튼을 같은 줄에 두고 버튼을 오른쪽 정렬", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          status: "submitted",
          notes: "출고 테스트",
          operation_batch_id: "batch-1",
        })}
        onCancelRequest={vi.fn()}
        onRevertToDraft={vi.fn()}
      />,
    );

    const footer = screen.getByTestId("my-request-footer");
    const actions = screen.getByTestId("my-request-actions");
    expect(within(footer).getByText("출고 테스트")).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "수정" })).toBeInTheDocument();
    expect(within(footer).getByRole("button", { name: "요청 취소" })).toBeInTheDocument();
    expect(actions).toHaveClass("ml-auto");
  });

  it("연결 batch가 없는 열린 요청은 수정만 숨기고 취소는 유지한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "reserved", operation_batch_id: null })}
        onCancelRequest={vi.fn()}
        onRevertToDraft={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요청 취소" })).toBeInTheDocument();
  });

  it("연결된 한 작업 묶음의 창고·AS 연구·부서 승인 상태와 처리자를 세 줄로 표시한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          status: "reserved",
          requires_warehouse_approval: true,
          approved_by_name: "창고 승인자",
        })}
        linkedRequests={[
          makeRequest({
            request_id: "as-research", status: "reserved", requires_as_research_approval: true,
            as_research_approved_by_name: "연구 승인자",
          }),
          makeRequest({
            request_id: "department", status: "submitted", requires_department_approval: true,
            department_approved_by_name: null,
          }),
        ]}
        onCancelRequest={vi.fn()}
      />,
    );

    const approvals = screen.getByTestId("my-request-approvals");
    expect(approvals).toHaveTextContent("창고 승인·승인·창고 승인자");
    expect(approvals).toHaveTextContent("AS·연구 승인·승인·연구 승인자");
    expect(approvals).toHaveTextContent("부서 승인·대기");
  });

  it("서로 다른 승인 요청을 한 batch 카드로 합쳐 품목·부분 완료·반려 처리자를 표시하고 열린 형제로 취소한다", () => {
    const onCancelRequest = vi.fn();
    const rejectedWarehouse = makeRequest({
      request_id: "warehouse-rejected",
      operation_batch_id: "batch-approval",
      status: "rejected",
      requires_warehouse_approval: true,
      rejected_by_name: "창고 반려자",
      rejected_reason: "창고 재고 부족",
      lines: [{ ...makeLine(1), item_name_snapshot: "창고 품목" }],
    });
    const approvedAsResearch = makeRequest({
      request_id: "as-approved",
      operation_batch_id: "batch-approval",
      status: "completed",
      requires_as_research_approval: true,
      as_research_approved_by_name: "연구 승인자",
      lines: [{ ...makeLine(2), item_name_snapshot: "AS 연구 품목" }],
    });
    const openDepartment = makeRequest({
      request_id: "department-open",
      operation_batch_id: "batch-approval",
      status: "submitted",
      requires_department_approval: true,
      lines: [{ ...makeLine(3), item_name_snapshot: "부서 품목" }],
    });

    render(
      <MyRequestRow
        req={rejectedWarehouse}
        linkedRequests={[approvedAsResearch, openDepartment]}
        onCancelRequest={onCancelRequest}
        onRevertToDraft={vi.fn()}
      />,
    );

    expect(screen.getByTestId("my-request-summary")).toHaveTextContent("3건");
    expect(screen.getByText("창고 품목")).toBeInTheDocument();
    expect(screen.getByText("AS 연구 품목")).toBeInTheDocument();
    expect(screen.getByText("부서 품목")).toBeInTheDocument();
    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByTestId("my-request-approvals")).toHaveTextContent("창고 승인·반려·창고 반려자·창고 재고 부족");
    expect(screen.getByTestId("my-request-approvals")).toHaveTextContent("AS·연구 승인·승인·연구 승인자");
    expect(screen.getByTestId("my-request-approvals")).toHaveTextContent("부서 승인·대기");
    expect(screen.getByRole("button", { name: "요청 취소" })).toBeInTheDocument();
  });

  it("승인과 반려만 섞인 완료 batch를 부분 완료로 집계한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "rejected", requires_warehouse_approval: true })}
        linkedRequests={[makeRequest({ request_id: "completed", status: "completed", requires_department_approval: true })]}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("부분 완료")).toBeInTheDocument();
  });

  it("완료와 취소가 섞인 결정 완료 batch를 부분 완료로 집계한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "completed", requires_warehouse_approval: true })}
        linkedRequests={[makeRequest({ request_id: "cancelled", status: "cancelled", requires_department_approval: true })]}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("부분 완료")).toBeInTheDocument();
  });

  it("완료와 승인 실패가 섞인 결정 완료 batch를 부분 완료로 집계한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "completed", requires_warehouse_approval: true })}
        linkedRequests={[makeRequest({ request_id: "failed", status: "failed_approval", requires_department_approval: true })]}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("부분 완료")).toBeInTheDocument();
  });

  it("승인 실패 형제가 있어도 미결 요청이 남으면 전체를 승인 대기로 집계한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "failed_approval", requires_warehouse_approval: true })}
        linkedRequests={[makeRequest({ request_id: "open", status: "submitted", requires_department_approval: true })]}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByText("승인 대기")).toBeInTheDocument();
  });

  it("모두 취소된 batch와 취소된 승인 종류를 취소로 표시한다", () => {
    render(
      <MyRequestRow
        req={makeRequest({ status: "cancelled", requires_warehouse_approval: true })}
        linkedRequests={[makeRequest({ request_id: "department-cancelled", status: "cancelled", requires_department_approval: true })]}
        onCancelRequest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("my-request-heading")).toHaveTextContent("취소");
    expect(screen.getByTestId("my-request-approvals")).toHaveTextContent("창고 승인·취소");
    expect(screen.getByTestId("my-request-approvals")).toHaveTextContent("부서 승인·취소");
  });

  it("완료·반려 terminal 혼합은 대표 요청 순서와 무관하게 부분 완료로 집계한다", () => {
    const completed = makeRequest({ request_id: "completed", status: "completed", requires_warehouse_approval: true });
    const rejected = makeRequest({ request_id: "rejected", status: "rejected", requires_department_approval: true });
    const { rerender } = render(<MyRequestRow req={completed} linkedRequests={[rejected]} onCancelRequest={vi.fn()} />);

    expect(screen.getByText("부분 완료")).toBeInTheDocument();
    rerender(<MyRequestRow req={rejected} linkedRequests={[completed]} onCancelRequest={vi.fn()} />);
    expect(screen.getByText("부분 완료")).toBeInTheDocument();
  });

  it("AS·연구 사용출고 작업 묶음은 모든 승인이 열려 있어도 취소만 허용하고 수정은 숨긴다", () => {
    render(
      <MyRequestRow
        req={makeRequest({
          operation_batch_id: "internal-use-batch",
          status: "submitted",
          requires_warehouse_approval: true,
          approved_at: null,
          department_approved_at: null,
          as_research_approved_at: null,
        })}
        linkedRequests={[makeRequest({
          request_id: "as-open",
          operation_batch_id: "internal-use-batch",
          status: "reserved",
          requires_as_research_approval: true,
          approved_at: null,
          department_approved_at: null,
          as_research_approved_at: null,
        })]}
        isGroupedInternalUseBatch
        onCancelRequest={vi.fn()}
        onRevertToDraft={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "요청 취소" })).toBeInTheDocument();
  });
});
