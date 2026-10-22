import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import type { InventoryRelatedWork, InventoryWorkStatus } from "@/lib/api/types/work-reservations";
import { InventoryWorkStatusPanel } from "../InventoryWorkStatusPanel";

const query = vi.hoisted(() => ({ data: undefined as InventoryWorkStatus | undefined, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock("@/lib/queries/useInventoryWorkStatus", () => ({ useInventoryWorkStatus: () => query }));

const item = { item_id: "electrode", item_name: "전극 (70kV)", quantity: 214, available_quantity: 154, unit: "EA" } as Item;
const location = { bucket: "production", department: "튜브" } as const;
const baseWork: InventoryRelatedWork = {
  batch_id: "production", revision: 1, status: "draft", reservation_status: "reserved", reservation_issue: null,
  work_type: "process", sub_type: "produce", reference_no: "SR-INTERNAL-PRODUCTION",
  requester_employee_id: "producer", requester_name: "생산 담당자", requester_department: "튜브", requester_active: true,
  created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
  targets: [{ item_id: "tube", item_name: "DXDR-70 튜브", mes_code: "8-TF-0001", quantity: 30, unit: "EA" }],
  reserved_inputs: [{ item_id: item.item_id, item_name: item.item_name, mes_code: "8-TR-0001", quantity: 60, unit: "EA",
    location, source: "draft", stock_request_id: null, operation_line_ids: [] }],
  expected_effects: [], forecast_issue: null,
};

beforeEach(() => {
  query.data = {
    item_id: item.item_id,
    summary: { work_reserved_quantity: 60, approval_reserved_quantity: 0, shipping_reserved_quantity: 0,
      expected_in_quantity: 10, expected_out_quantity: 60, transfer_in_quantity: 0, transfer_out_quantity: 0,
      forecast_complete: true, reservation_by_location: [], forecast_by_location: [] },
    works: [structuredClone(baseWork), {
      ...structuredClone(baseWork), batch_id: "receipt", status: "submitted", reservation_status: "not_required",
      sub_type: "adjust_in", reference_no: "SR-INTERNAL-RECEIPT", requester_name: "입고 담당자", reserved_inputs: [],
      targets: [{ item_id: item.item_id, item_name: item.item_name, mes_code: "8-TR-0001", quantity: 10, unit: "EA" }],
      expected_effects: [{ effect_id: "incoming", operation_line_id: "receipt-line", bundle_id: "receipt-bundle",
        item_id: item.item_id, item_name: item.item_name, mes_code: "8-TR-0001", quantity: 10, unit: "EA",
        kind: "in", from: null, to: location }],
    }],
  };
});

describe("예약과 입고 예정의 직원용 표시", () => {
  it("생산 예약 60과 입고 예정 10을 분리하고 사용 가능한 154에는 입고를 더하지 않는다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    const summary = screen.getByRole("group", { name: "수량 현황" });
    expect(within(summary).getByText("사용 가능 재고").parentElement).toHaveTextContent("154");
    expect(within(summary).getByText("예약 재고").parentElement).toHaveTextContent("60");
    expect(within(summary).getByText("입고 예정").parentElement).toHaveTextContent("10");
    expect(within(summary).queryByText("164")).toBeNull();
    expect(within(summary).queryByText("승인 예약")).toBeNull();
  });

  it("예약할 자재가 없는 입고도 승인 대기 상태와 들어오는 방향을 표시하고 내부 번호는 숨긴다", () => {
    render(<InventoryWorkStatusPanel item={item} />);
    const receipt = screen.getByRole("article", { name: /입고 담당자/ });
    expect(receipt).toHaveTextContent("승인 대기");
    expect(receipt).toHaveTextContent("입고 예정");
    expect(receipt).toHaveTextContent("10 EA");
    expect(within(receipt).getAllByText("전극 (70kV)", { exact: true })).toHaveLength(1);
    expect(receipt.textContent?.match(/10 EA/g)).toHaveLength(1);
    expect(receipt).not.toHaveTextContent("예약 대상 없음");
    expect(receipt).not.toHaveTextContent("선택 품목 예약 없음");
    expect(screen.queryByText(/SR-INTERNAL/)).toBeNull();
  });

  it.each([0, 10])("일부 작업의 예정이 누락되면 확인한 입고량 %s를 확정 총량으로 표시하지 않는다", (quantity) => {
    query.data!.summary.forecast_complete = false;
    query.data!.summary.expected_in_quantity = quantity;
    render(<InventoryWorkStatusPanel item={item} />);
    const incoming = within(screen.getByRole("group", { name: "수량 현황" })).getByText("입고 예정").parentElement!;
    if (quantity === 0) {
      expect(incoming).toHaveTextContent("확인 필요");
      expect(incoming).not.toHaveTextContent("0 EA");
      expect(incoming).not.toHaveTextContent("완료 후 사용");
    } else {
      expect(incoming).toHaveTextContent("확인된 10 EA");
    }
  });

  it("같은 품목을 예약하고 다시 입고하는 작업은 접힌 행에서도 두 방향을 모두 보여준다", () => {
    const production = query.data!.works[0];
    const incoming = query.data!.works[1].expected_effects[0];
    production.expected_effects = [
      { ...incoming, effect_id: "consume", kind: "out", from: location, to: null, quantity: 60 },
      { ...incoming, effect_id: "produce" },
    ];
    render(<InventoryWorkStatusPanel item={item} />);
    const work = screen.getByRole("article", { name: /생산 담당자/ });
    expect(within(work).getByText("출고 예정 · 튜브").parentElement).toHaveTextContent("−60 EA");
    expect(within(work).getByText("입고 예정 · 튜브").parentElement).toHaveTextContent("+10 EA");
    expect(work.textContent?.match(/작업 중/g)).toHaveLength(1);
  });
});
