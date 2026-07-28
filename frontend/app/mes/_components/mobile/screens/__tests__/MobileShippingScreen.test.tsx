import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ShippingRequest, ShippingRequestRevision } from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";
import { MobileShippingScreen } from "../MobileShippingScreen";

vi.mock("@/lib/api", () => ({
  api: {
    getShippingRequests: vi.fn(),
    getShippingHistory: vi.fn(),
    updateShippingChecklist: vi.fn(),
    clearShippingChecklist: vi.fn(),
  },
}));

import { api } from "@/lib/api";

function revision(overrides: Partial<ShippingRequestRevision> = {}): ShippingRequestRevision {
  return {
    revision_id: "rev-1",
    request_id: "req-1",
    edited_by_employee_id: "employee-1",
    edited_by_name: "김출하",
    summary: "출하 요청 수정: request_quantity, bom_lines",
    affects_preparation: true,
    changes: [],
    created_at: "2026-07-24T09:30:00Z",
    ...overrides,
  };
}

function request(overrides: Partial<ShippingRequest> = {}): ShippingRequest {
  return {
    request_id: "req-1",
    status: "PREPARING",
    request_quantity: 3,
    base_pf_item_id: "pf-1",
    base_pf_item_name: "Standard PF",
    base_pf_mes_code: "PF-001",
    final_pa_item_id: null,
    final_pa_item_name: null,
    final_pf_item_id: null,
    final_pf_item_name: null,
    requested_by_name: "shipping",
    custom_pa_name: null,
    custom_pf_name: null,
    notes: null,
    invoice_number: null,
    prepared_at: null,
    picked_up_at: null,
    cancelled_at: null,
    cancelled_by_employee_id: null,
    cancelled_by_name: null,
    created_at: "2026-06-26T00:00:00Z",
    updated_at: "2026-06-26T00:00:00Z",
    bom_lines: [],
    companion_lines: [],
    checklist_lines: [
      {
        line_id: "check-1",
        item_id: "acc-1",
        item_name: "Cable Set",
        mes_code: "R-001",
        process_type_code: "R",
        quantity: 2,
        checked: false,
      },
    ],
    events: [],
    latest_preparation_revision: null,
    transactions: [],
    allocations: [],
    transaction_count: 0,
    stock_shortages: [],
    ...overrides,
  };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...render(<MobileShippingScreen />, { wrapper: Wrapper }) };
}

async function flushQueries() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.mocked(api.getShippingRequests).mockReset().mockResolvedValue([request()]);
  vi.mocked(api.getShippingHistory).mockReset().mockResolvedValue([]);
  vi.mocked(api.updateShippingChecklist).mockReset().mockResolvedValue({
    ...request(),
    checklist_lines: [{ ...request().checklist_lines[0], checked: true }],
  });
  vi.mocked(api.clearShippingChecklist).mockReset().mockResolvedValue(request());
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("MobileShippingScreen", () => {
  it("공용 requests query로 최초 조회하고 마운트 중 30초마다만 폴링한다", async () => {
    vi.useFakeTimers();
    const { queryClient, unmount } = renderScreen();

    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);
    expect(api.getShippingHistory).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(queryKeys.shipping.requests())).toEqual([request()]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.getShippingRequests).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.getShippingRequests).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.getShippingRequests).toHaveBeenCalledTimes(2);
  });

  it("visibilitychange로 visible 복귀할 때만 즉시 다시 조회한다", async () => {
    renderScreen();
    expect(await screen.findByText("Standard PF")).toBeInTheDocument();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(2);
  });

  it("window focus만으로 즉시 다시 조회하고 unmount 뒤에는 조회하지 않는다", async () => {
    let now = 10_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const { unmount } = renderScreen();
      expect(await screen.findByText("Standard PF")).toBeInTheDocument();

      fireEvent.focus(window);
      await flushQueries();
      expect(api.getShippingRequests).toHaveBeenCalledTimes(2);

      unmount();
      now += 1_000;
      fireEvent.focus(window);
      fireEvent(document, new Event("visibilitychange"));
      await flushQueries();
      expect(api.getShippingRequests).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("visible 전환과 focus가 연속 발생해도 한 번만 다시 조회한다", async () => {
    vi.useFakeTimers();
    renderScreen();
    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.focus(window);
    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    fireEvent.focus(window);
    await flushQueries();
    expect(api.getShippingRequests).toHaveBeenCalledTimes(3);
  });

  it("PREPARING 카드에 최신 준비 revision을 계속 표시하고 구조화 변경을 펼친다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        latest_preparation_revision: revision({
          changes: [
            { field: "request_quantity", before: 2, after: 3 },
            {
              field: "bom_lines",
              before: [
                { parent_stage: "PA", child_item_id: "old-1", item_name: "기존 케이블", mes_code: "PR-001", quantity: 1, unit: "EA", included: true, origin: "CUSTOM" },
              ],
              after: [
                { parent_stage: "PA", child_item_id: "old-1", item_name: "기존 케이블", mes_code: "PR-001", quantity: 2, unit: "EA", included: true, origin: "CUSTOM" },
                { parent_stage: "PF", child_item_id: "new-1", item_name: "신규 브래킷", mes_code: "PR-002", quantity: 1, unit: "EA", included: true, origin: "CUSTOM" },
              ],
            },
            {
              field: "companion_lines",
              before: [{ item_id: "box-1", item_name: "동반 박스", mes_code: "PR-BOX", quantity: 1, unit: "EA" }],
              after: [],
            },
          ],
        }),
      }),
    ]);

    renderScreen();

    expect(await screen.findByText("수정됨")).toBeInTheDocument();
    expect(screen.getByText("김출하 · 2026.07.24 18:30 KST")).toBeInTheDocument();
    expect(screen.getByText("출하 수량 · BOM 구성 · 동반 출하품 수정")).toBeInTheDocument();
    expect(screen.queryByText("출하 요청 수정: request_quantity, bom_lines")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "변경 내용 보기" }));

    expect(screen.getByText("출하 수량")).toBeInTheDocument();
    expect(screen.getByText("2대 → 3대")).toBeInTheDocument();
    expect(screen.getByText(/수량 변경.*\[PA\] 기존 케이블.*PR-001.*1 → 2 EA/)).toBeInTheDocument();
    expect(screen.getByText(/추가.*\[PF\] 신규 브래킷.*PR-002.*1 EA/)).toBeInTheDocument();
    expect(screen.getByText(/삭제.*동반 박스.*PR-BOX.*1 EA/)).toBeInTheDocument();
  });

  it("revision 필드명을 중복 없이 사용자용 한 줄 summary로 표시한다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        latest_preparation_revision: revision({
          changes: [
            { field: "request_quantity", before: 1, after: 2 },
            { field: "request_quantity", before: 2, after: 3 },
            { field: "bom_lines", before: [], after: [] },
          ],
        }),
      }),
    ]);

    renderScreen();

    expect(await screen.findByText("출하 수량 · BOM 구성 수정")).toBeInTheDocument();
  });

  it("revision changes가 비어 있으면 안전한 한국어 summary를 표시한다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ latest_preparation_revision: revision({ changes: [] }) }),
    ]);

    renderScreen();

    expect(await screen.findByText("준비 정보가 수정되었습니다.")).toBeInTheDocument();
    expect(screen.queryByText("출하 요청 수정: request_quantity, bom_lines")).not.toBeInTheDocument();
  });

  it("BOM 수량과 포함 여부가 함께 바뀌면 두 변경을 모두 표시한다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        latest_preparation_revision: revision({
          changes: [{
            field: "bom_lines",
            before: [
              { parent_stage: "PA", child_item_id: "line-1", item_name: "케이블", mes_code: "PR-001", quantity: 1, unit: "EA", included: true },
              { parent_stage: "PF", child_item_id: "line-2", item_name: "브래킷", mes_code: "PR-002", quantity: 1, unit: "EA", included: false },
            ],
            after: [
              { parent_stage: "PA", child_item_id: "line-1", item_name: "케이블", mes_code: "PR-001", quantity: 2, unit: "EA", included: false },
              { parent_stage: "PF", child_item_id: "line-2", item_name: "브래킷", mes_code: "PR-002", quantity: 1, unit: "EA", included: true },
            ],
          }],
        }),
      }),
    ]);

    renderScreen();
    expect(await screen.findByText("수정됨")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 보기" }));

    expect(screen.getByText(/수량 변경.*케이블.*1 → 2 EA/)).toBeInTheDocument();
    expect(screen.getByText(/포함 상태 변경.*케이블.*포함 → 제외/)).toBeInTheDocument();
    expect(screen.getByText(/포함 상태 변경.*브래킷.*제외 → 포함/)).toBeInTheDocument();
    expect(screen.queryByText("구성 순서가 변경되었습니다.")).not.toBeInTheDocument();
  });

  it("invoice 또는 요청자만 바뀐 응답에는 수정됨을 표시하지 않는다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ invoice_number: "INV-001", requested_by_name: "변경 요청자", latest_preparation_revision: null }),
    ]);

    renderScreen();

    expect(await screen.findByText("Standard PF")).toBeInTheDocument();
    expect(screen.queryByText("수정됨")).not.toBeInTheDocument();
  });

  it("focus refetch 뒤 서버의 최신 품목과 수량 및 보존된 체크 상태를 반영한다", async () => {
    vi.mocked(api.getShippingRequests)
      .mockResolvedValueOnce([request()])
      .mockResolvedValueOnce([
        request({
          request_quantity: 5,
          checklist_lines: [
            {
              line_id: "check-2",
              item_id: "acc-2",
              item_name: "최신 구성품",
              mes_code: "R-002",
              process_type_code: "R",
              quantity: 4,
              checked: true,
            },
          ],
        }),
      ]);

    renderScreen();
    expect(await screen.findByText("Cable Set")).toBeInTheDocument();

    fireEvent.focus(window);

    expect(await screen.findByText("최신 구성품")).toBeInTheDocument();
    expect(screen.getByText("총 5대 출하")).toBeInTheDocument();
    expect(screen.getByLabelText("최신 구성품 체크")).toBeChecked();
    expect(screen.queryByText("Cable Set")).not.toBeInTheDocument();
  });

  it("체크 토글과 전체 해제 응답을 공용 requests query 캐시에 반영한다", async () => {
    const checked = {
      ...request(),
      checklist_lines: [{ ...request().checklist_lines[0], checked: true }],
    };
    vi.mocked(api.updateShippingChecklist).mockResolvedValue(checked);
    vi.mocked(api.clearShippingChecklist).mockResolvedValue(request());
    const { queryClient } = renderScreen();

    const checkbox = await screen.findByLabelText("Cable Set 체크");
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(queryClient.getQueryData<ShippingRequest[]>(queryKeys.shipping.requests())?.[0].checklist_lines[0].checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /전체 해제/ }));

    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(api.clearShippingChecklist).toHaveBeenCalledWith("req-1");
    expect(queryClient.getQueryData<ShippingRequest[]>(queryKeys.shipping.requests())?.[0].checklist_lines[0].checked).toBe(false);
  });

  it("PREPARED 요청의 체크리스트와 전체 해제는 읽기 전용이며 API를 호출하지 않는다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        status: "PREPARED",
        checklist_lines: [{ ...request().checklist_lines[0], item_name: "Prepared Cable" }],
      }),
    ]);

    renderScreen();

    const checkbox = await screen.findByRole("checkbox", { name: /Prepared Cable/ });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /전체 해제/ }));

    expect(api.updateShippingChecklist).not.toHaveBeenCalled();
    expect(api.clearShippingChecklist).not.toHaveBeenCalled();
  });

  it("한 PREPARING 카드의 체크리스트 오류는 해당 카드에만 표시하고 다른 카드를 유지한다", async () => {
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({ request_id: "req-fail", base_pf_item_name: "Failing PF" }),
      request({
        request_id: "req-kept",
        base_pf_item_name: "Kept PF",
        checklist_lines: [{ ...request().checklist_lines[0], item_name: "Kept Cable" }],
      }),
    ]);
    vi.mocked(api.updateShippingChecklist).mockRejectedValueOnce(new Error("422 checklist rejected"));

    renderScreen();

    fireEvent.click(await screen.findByRole("checkbox", { name: /Cable Set/ }));

    expect(await screen.findByText("422 checklist rejected")).toBeInTheDocument();
    expect(screen.getByText("Failing PF")).toBeInTheDocument();
    expect(screen.getByText("Kept PF")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Kept Cable/ })).toBeInTheDocument();
  });

  it("CANCELLED는 요청과 준비 목록에서 제외하고 history page 호환 목록에는 표시한다", async () => {
    const cancelled = request({ request_id: "cancelled-1", status: "CANCELLED", base_pf_item_name: "취소된 PF" });
    vi.mocked(api.getShippingRequests).mockResolvedValue([cancelled, request()]);
    vi.mocked(api.getShippingHistory).mockResolvedValue([cancelled]);

    renderScreen();

    expect(await screen.findByText("Standard PF")).toBeInTheDocument();
    expect(screen.queryByText("취소된 PF")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "요청" }));
    expect(screen.queryByText("취소된 PF")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "이력" }));
    expect(await screen.findByText("취소된 PF")).toBeInTheDocument();
    expect(api.getShippingHistory).toHaveBeenCalledTimes(1);
  });

  it("모바일에서는 조회와 체크만 제공하고 PC 전용 완료 액션은 숨긴다", async () => {
    renderScreen();

    expect(await screen.findByText("Standard PF")).toBeInTheDocument();
    expect(screen.getByText("총 3대 출하")).toBeInTheDocument();
    expect(screen.getByText(/생성·수정·완료 처리는 PC/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /준비 완료/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /픽업 완료/ })).not.toBeInTheDocument();
  });

  it("uses the expandable two-line item name pattern for long shipping names", async () => {
    const longName = "ADX6000FB 80kV 5mA 러시아 납품용 긴 품목명 옵션 포함";
    vi.mocked(api.getShippingRequests).mockResolvedValue([
      request({
        base_pf_item_name: longName,
        final_pa_item_id: "pa-1",
        final_pa_item_name: `${longName} 최종 PA`,
        final_pf_item_id: "pf-1",
        final_pf_item_name: `${longName} 최종 PF`,
      }),
    ]);

    renderScreen();

    const nameButton = await screen.findByRole("button", { name: longName });
    expect(nameButton).toHaveClass("line-clamp-2");

    fireEvent.click(nameButton);

    expect(nameButton).toHaveClass("whitespace-normal");
    expect(nameButton).toHaveClass("break-words");
  });
});
