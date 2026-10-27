import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item } from "@/lib/api";
import type { InventoryRelatedWork, InventoryWorkStatus, WorkInventoryEffect } from "@/lib/api/types/work-reservations";
import { InventoryWorkStatusPanel } from "../InventoryWorkStatusPanel";

const query = vi.hoisted(() => ({ data: undefined as InventoryWorkStatus | undefined, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock("@/lib/queries/useInventoryWorkStatus", () => ({ useInventoryWorkStatus: () => query }));
const item = { item_id: "selected", item_name: "선택 품목", available_quantity: 10, min_stock: 5, unit: "EA" } as Item;
const incoming: WorkInventoryEffect = { effect_id: "in", operation_line_id: "line", bundle_id: "bundle", item_id: item.item_id, item_name: item.item_name, mes_code: "S-1", quantity: 10, unit: "EA", kind: "in", from: null, to: { bucket: "production", department: "조립" } };
const component: WorkInventoryEffect = { ...incoming, effect_id: "part", item_id: "component", item_name: "긴 구성품 이름", mes_code: "C-1", kind: "out", from: { bucket: "warehouse", department: null }, to: null, quantity: 3 };
function work(id: string, complex = false): InventoryRelatedWork {
  return { batch_id: id, revision: 1, status: "draft", reservation_status: "not_required", reservation_issue: null, work_type: "process", sub_type: "produce", reference_no: null, requester_employee_id: id, requester_name: id, requester_department: "조립", requester_active: true,
    targets: [{ item_id: item.item_id, item_name: item.item_name, mes_code: "S-1", quantity: 10, unit: "EA" }], created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z", reserved_inputs: [], expected_effects: complex ? [incoming, component] : [incoming], forecast_issue: null };
}
beforeEach(() => {
  query.data = { item_id: item.item_id, summary: { work_reserved_quantity: 0, approval_reserved_quantity: 0, shipping_reserved_quantity: 0, expected_in_quantity: 10, expected_out_quantity: 0, transfer_in_quantity: 0, transfer_out_quantity: 0, forecast_complete: true, reservation_by_location: [], forecast_by_location: [] }, works: [work("첫 담당자")] };
  item.work_reservations = query.data.summary;
});

describe("관련 작업 카드 간소화", () => {
  it.each([false, true])("단순 작업은 품목명을 한 번 표시하고 수량 반복과 펼침 없이 끝낸다 (mobile=%s)", (mobile) => {
    render(<InventoryWorkStatusPanel item={item} mobile={mobile} />);
    const works = screen.getByRole("region", { name: "관련 작업" });
    expect(within(works).queryByRole("button")).not.toBeInTheDocument();
    expect(within(works).getAllByText(item.item_name, { exact: true })).toHaveLength(1);
    expect(within(works).queryByText("S-1")).not.toBeInTheDocument();
    expect(within(works).getByText("+10 EA")).toBeVisible();
    expect(within(works).getByText("입고 예정 · 조립")).toBeVisible();
    expect(within(works).queryByText(/마지막 저장|완료 시 재고 변동/)).not.toBeInTheDocument();
  });

  it("복합 작업 한 건은 자동으로 열고 재조회가 사용자의 접힘을 풀지 않는다", () => {
    query.data!.works = [work("첫 담당자", true)];
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    const toggle = screen.getByRole("button", { name: /첫 담당자/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByRole("region", { name: "첫 담당자 작업 상세" });
    expect(within(detail).getByText(component.item_name)).toBeVisible();
    expect(within(detail).queryByText(item.item_name)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    query.data = structuredClone(query.data!);
    rerender(<InventoryWorkStatusPanel item={item} />);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("여러 작업은 한 건씩 열며 삭제된 작업이 돌아와도 자동으로 다시 열지 않는다", () => {
    const first = work("첫 담당자", true), second = work("둘째 담당자", true);
    query.data!.works = [first, second];
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    const a = screen.getByRole("button", { name: /첫 담당자/ }), b = screen.getByRole("button", { name: /둘째 담당자/ });
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(a); fireEvent.click(b);
    expect(a).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveAttribute("aria-expanded", "true");
    query.data!.works = [first]; rerender(<InventoryWorkStatusPanel item={item} />);
    expect(a).toHaveAttribute("aria-expanded", "false");
    query.data!.works = [first, second]; rerender(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByRole("button", { name: /둘째 담당자/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("품목을 바꾸면 한 건 자동 펼침 규칙으로 초기화한다", () => {
    query.data!.works = [work("첫 담당자", true)];
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    fireEvent.click(screen.getByRole("button", { name: /첫 담당자/ }));
    query.data = { ...query.data!, item_id: "component" };
    rerender(<InventoryWorkStatusPanel item={{ ...item, item_id: "component" }} />);
    expect(screen.getByRole("button", { name: /첫 담당자/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("예약만 있는 경우에는 서로 다른 위치와 단위를 합산하지 않는다", () => {
    const w = query.data!.works[0]; w.expected_effects = [];
    w.reserved_inputs = [
      { item_id: item.item_id, item_name: item.item_name, mes_code: "S-1", quantity: 4, unit: "EA", location: { bucket: "warehouse", department: null }, source: "draft", stock_request_id: null, operation_line_ids: [] },
      { item_id: item.item_id, item_name: item.item_name, mes_code: "S-1", quantity: 2, unit: "m", location: { bucket: "production", department: "튜브" }, source: "approval", stock_request_id: null, operation_line_ids: [] },
    ];
    render(<InventoryWorkStatusPanel item={item} />);
    const works = screen.getByRole("region", { name: "관련 작업" });
    expect(within(works).getByText("사용 예약 · 창고").parentElement).toHaveTextContent("4 EA");
    expect(within(works).getByText("사용 예약 · 튜브").parentElement).toHaveTextContent("2 m");
    expect(within(works).queryByText(/6 EA|−4 EA|출고 예정/)).not.toBeInTheDocument();
  });

  it("늦게 도착한 첫 응답에 자동 펼침을 적용하고 여러 대상과 같은 품목의 각 효과를 보존한다", () => {
    const data = query.data!;
    query.data = undefined;
    const { rerender } = render(<InventoryWorkStatusPanel item={item} />);
    const w = work("첫 담당자", true);
    w.targets = [
      { item_id: "other-1", item_name: "다른 작업 대상", mes_code: "T-1", quantity: 2, unit: "EA" },
      { item_id: "other-2", item_name: "추가 작업 대상", mes_code: "T-2", quantity: 5, unit: "m" },
    ];
    w.expected_effects.push({ ...component, effect_id: "part-in", kind: "in", from: null, to: { bucket: "production", department: "튜브" }, quantity: 1, unit: "m" });
    query.data = { ...data, works: [w] };
    rerender(<InventoryWorkStatusPanel item={item} />);
    expect(screen.getByRole("button", { name: /첫 담당자/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/외 1건/)).toBeVisible();
    expect(screen.getByRole("group", { name: "추가 작업 대상" })).toHaveTextContent("추가 작업 대상5 m");
    const part = screen.getByRole("listitem", { name: `${component.item_name} 내역` });
    expect(within(part).getAllByText(component.item_name)).toHaveLength(1);
    expect(within(part).getByText("−3 EA")).toBeVisible();
    expect(within(part).getByText("+1 m")).toBeVisible();
  });
});
