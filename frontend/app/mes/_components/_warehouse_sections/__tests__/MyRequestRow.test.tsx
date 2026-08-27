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
        req={makeRequest({ status: "submitted", notes: "출고 테스트" })}
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
});
