import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProductionCapacity, ProductionCapacityPfVariant } from "@/lib/api/types/production";
import type { ItemCostSummary } from "@/lib/api/types/cost";
import { CapacityModelKpis, CostModelKpis, toCostKpiTargets } from "../DashboardModelKpis";

const state = vi.hoisted(() => ({ summaries: [] as ItemCostSummary[], error: false, retry: vi.fn(), summariesCall: vi.fn() }));
vi.mock("@/lib/queries/useCostQuery", () => ({ useCostSummaryQueries: (...args: unknown[]) => { state.summariesCall(...args); return [{ data: state.summaries, isError: state.error, refetch: state.retry }]; } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { hourly_labor_rate: "18000" }, isError: false }) }));
function variant(id = "pf-a", model = "3"): ProductionCapacityPfVariant {
  return { pf_item_id: id, pf_name: `출하품 ${id}`, pf_code: id, model_symbol: model, af_item_id: "route-a", ship_ready: 0, fast_production: 7, total_production: 12, bom_status: "complete" };
}
const actor = { employee_id: "e", token: "token" };
beforeEach(() => { state.summaries = []; state.error = false; state.retry.mockClear(); state.summariesCall.mockClear(); });

it("모델 정렬과 PF 식별자를 보존하고 원가 대상에서 생산 수량은 분리한다", () => {
  const targets = toCostKpiTargets([variant("b", "4"), variant()]);
  expect(targets.map(t => t.pfItemId)).toEqual(["pf-a", "b"]);
  expect(targets[0]).toMatchObject({ label: "DX3000", code: "pf-a" });
  expect(targets[0]).not.toHaveProperty("total_production");
});
it("대표 PF의 세 수량을 합산하지 않고 그대로 표시하며 AF 경로까지 전달한다", () => {
  const v = variant(); const open = vi.fn();
  render(<CapacityModelKpis capacityData={{ af: { auto_representatives: [v] } } as ProductionCapacity} onOpen={open} />);
  const card = screen.getByRole("button", { name: /DX3000/ });
  for (const value of ["0", "7", "12"]) expect(within(card).getByText(value, { exact: true })).toBeVisible();
  expect(within(card).getAllByRole("term").map(value => value.textContent)).toEqual(["출하 대기", "빠른 생산", "총생산"]);
  expect(within(card).getAllByRole("definition").map(value => value.textContent)).toEqual(["0", "7", "12"]);
  expect(within(card).queryByText(v.pf_code!)).not.toBeInTheDocument();
  expect(within(card).queryByText(v.pf_name)).not.toBeInTheDocument();
  expect(card).toHaveAccessibleName(expect.stringContaining(v.pf_code!));
  expect(screen.queryByText("대표 출하품 기준 · 모델별 독립 계산")).not.toBeInTheDocument();
  fireEvent.click(card); expect(open).toHaveBeenCalledWith(v, card);
});
it("기준 PF 없음·로딩·오류를 구분하고 재시도한다", () => {
  const retry = vi.fn(); const v = render(<CapacityModelKpis capacityLoading onOpen={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("불러오는 중");
  v.rerender(<CapacityModelKpis capacityData={{ af: { auto_representatives: [] } } as unknown as ProductionCapacity} onOpen={vi.fn()} />);
  expect(screen.getByText("표시할 기준 PF가 없습니다.")).toBeVisible();
  v.rerender(<CapacityModelKpis capacityError="실패" onCapacityRetry={retry} onOpen={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); expect(retry).toHaveBeenCalledOnce();
});
it("기억된 가정 시급으로 조회하고 PF 한 개의 원가를 표시해 상세를 연다", () => {
  state.summaries = [{ item_id: "pf-a", unit_cost: "12500.50", own_labor_cost: "3000", amount: "12500.50", status: "complete" }];
  const open = vi.fn(); render(<CostModelKpis targets={toCostKpiTargets([variant()])} actor={actor} hourlyRate="20000" onOpen={open} />);
  expect(screen.getByText(/가정 시급 20,000원/)).toBeVisible();
  expect(screen.getByRole("definition")).toHaveTextContent("12,501 원");
  expect(screen.queryByText("개당 원가")).not.toBeInTheDocument();
  expect(screen.queryByText("출하품 pf-a")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /DX3000/ })).toHaveAccessibleName(expect.stringContaining("출하품 pf-a"));
  expect(state.summariesCall).toHaveBeenLastCalledWith([["pf-a"]], actor, "20000");
  fireEvent.click(screen.getByRole("button", { name: /DX3000/ })); expect(open).toHaveBeenCalledWith("pf-a");
});
it("부분 원가·0원·미등록을 구분하며 기준 PF 변경에 이전 금액을 섞지 않는다", () => {
  const targets = toCostKpiTargets([variant()]);
  state.summaries = [{ item_id: "pf-a", unit_cost: "0", own_labor_cost: "0", amount: "0", status: "partial" }];
  const view = render(<CostModelKpis targets={targets} actor={actor} onOpen={vi.fn()} />);
  expect(screen.getByText("부분 원가")).toBeVisible(); expect(screen.getByText("—")).toBeVisible();
  state.summaries = [{ ...state.summaries[0], unit_cost: null, status: "unavailable" }];
  view.rerender(<CostModelKpis targets={targets} actor={actor} onOpen={vi.fn()} />); expect(screen.getByText("정보 없음")).toBeVisible();
  view.rerender(<CostModelKpis targets={toCostKpiTargets([variant("new")])} actor={actor} onOpen={vi.fn()} />);
  expect(screen.getByRole("button", { name: /DX3000/ })).toHaveAccessibleName(expect.stringContaining("출하품 new")); expect(screen.getByText("정보 없음")).toBeVisible();
});
it.each([
  ["12500.49", "12,500 원"], ["12500.50", "12,501 원"], ["12500.99", "12,501 원"],
  ["9007199254740991.50", "9,007,199,254,740,992 원"],
])("KPI 원가 %s를 원 단위 반올림해 %s로 표시하고 원본은 유지한다", (value, expected) => {
  state.summaries = [{ item_id: "pf-a", unit_cost: value, own_labor_cost: "0", amount: value, status: "complete" }];
  render(<CostModelKpis targets={toCostKpiTargets([variant()])} actor={actor} onOpen={vi.fn()} />);
  expect(screen.getByRole("definition")).toHaveTextContent(expected);
  expect(state.summaries[0].unit_cost).toBe(value);
});
it("원가 갱신 실패는 남아 있는 금액과 함께 경고하고 재시도한다", () => {
  state.error = true; state.summaries = [{ item_id: "pf-a", unit_cost: "100", own_labor_cost: "0", amount: "100", status: "complete" }];
  render(<CostModelKpis targets={toCostKpiTargets([variant()])} actor={actor} onOpen={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("갱신 실패"); expect(screen.getByRole("definition")).toHaveTextContent("100 원");
  fireEvent.click(screen.getByRole("button", { name: "원가 다시 시도" })); expect(state.retry).toHaveBeenCalledOnce();
});
