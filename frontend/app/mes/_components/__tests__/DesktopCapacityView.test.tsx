import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProductionCapacity } from "@/lib/api";
import { DesktopCapacityView } from "../_capacity_sections/DesktopCapacityView";
import { DashboardNavigationProvider, useDashboardNavigation } from "../DashboardNavigation";

vi.mock("../_capacity_sections/DesktopCapacityPfWorkspace", () => ({ DesktopCapacityPfWorkspace: ({ variant, onBack }: { variant: { af_item_id: string; total_production: number }; onBack: () => void }) => <div data-testid="selected-bom"><button aria-label="생산 가능 목록으로 돌아가기" onClick={onBack}>뒤로</button>{variant.af_item_id}: {variant.total_production}</div> }));
const data: ProductionCapacity = { immediate: 0, maximum: 0, limiting_item: null, top_items: [], af: {
  basis: "AF", status: "producible", summary: { ship_ready: 0, fast_production: 0, total_production: 0 },
  items: ["a", "b"].map((id) => ({ af_item_id: id, af_name: `조립 ${id}`, af_code: id, model_symbol: "3", ship_ready: 0, fast_production: 2, total_production: 3, bom_status: "complete", has_direct_children: true, has_pf_path: true, marked_complete: true })),
  pf_variants: ["a", "b"].map((id, index) => ({ af_item_id: id, pf_item_id: "same", pf_name: "출하 제품", pf_code: "PF", model_symbol: "3", ship_ready: 0, fast_production: 2, total_production: 10 + index, bom_status: "complete" })), auto_representatives: [],
} };
beforeEach(() => { window.history.replaceState({}, ""); vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} }); });
it("공통 이력에서도 같은 PF의 AF 경로를 분리하고 재선택·뒤로·앞으로를 복원한다", () => {
  function Owner() {
    const nav = useDashboardNavigation()!;
    return <><button onClick={() => nav.navigate("capacity")}>생산 탭</button><DesktopCapacityView capacityData={data} active={nav.view === "capacity"} /></>;
  }
  window.history.replaceState({}, "", "/mes?tab=dashboard");
  render(<DashboardNavigationProvider><Owner /></DashboardNavigationProvider>);
  fireEvent.click(screen.getByText("생산 탭"));
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  const overview = screen.getByTestId("capacity-overview-scroll");
  overview.scrollTop = 140;
  fireEvent.scroll(overview);
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 a BOM 보기" }));
  const firstWorkspace = screen.getByTestId("selected-bom");
  const firstIndex = window.history.state.desktopDashboard.index;
  fireEvent.click(screen.getByRole("button", { name: "생산 가능 목록으로 돌아가기" }));
  expect(overview.scrollTop).toBe(140);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "출하 제품" } });
  fireEvent.click(screen.getByRole("button", { name: "조립 a 조립" }));
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 b BOM 보기" }));
  expect(screen.getByTestId("selected-bom")).not.toBe(firstWorkspace);
  expect(window.history.state.desktopDashboard.index).toBeGreaterThan(firstIndex);
  const detail = window.history.state;
  fireEvent.click(screen.getByText("생산 탭"));
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  const home = window.history.state;
  fireEvent.click(screen.getByText("생산 탭"));
  expect(window.history.state).toEqual(home);
  act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: detail })));
  expect(screen.getByTestId("selected-bom")).toHaveTextContent("b: 11");
  act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: home })));
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("출하 제품");
  expect(screen.getByRole("button", { name: "조립 a 조립" })).toHaveAttribute("aria-expanded", "false");
});
it("KPI는 기준 AF 경로의 PF 상세를 열고 복귀 시 검색과 함께 복원된다", () => {
  render(<DesktopCapacityView capacityData={{ ...data, af: { ...data.af!, auto_representatives: [data.af!.pf_variants[1]] } }} active />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "출하 제품" } });
  const overview = screen.getByTestId("capacity-overview-scroll");
  overview.scrollTop = 140;
  fireEvent.scroll(overview);
  const kpis = screen.getByRole("region", { name: "모델별 생산 가능 KPI" });
  fireEvent.click(within(kpis).getByRole("button", { name: /DX3000/ }));
  expect(screen.getByTestId("selected-bom")).toHaveTextContent("b: 11");
  expect(screen.queryByRole("region", { name: "모델별 생산 가능 KPI" })).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "생산 제품 탐색" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "생산 가능 목록으로 돌아가기" }));
  expect(screen.getByRole("region", { name: "모델별 생산 가능 KPI" })).toBeVisible();
  expect(screen.getByRole("textbox")).toHaveValue("출하 제품");
  expect(overview.scrollTop).toBe(140);
});
it("처음에는 모델만 표시하고 BOM을 조회하지 않으며 검색은 경로를 펼친다", () => {
  render(<DesktopCapacityView capacityData={data} active />);
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  expect(screen.queryByText("조립 a")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "출하 제품" } });
  expect(screen.getAllByText("출하 제품")).toHaveLength(2);
  expect(screen.getAllByText("조립", { exact: true })).toHaveLength(2);
  expect(screen.getAllByText("출하", { exact: true })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 접기" }));
  expect(screen.queryByText("조립 a")).not.toBeInTheDocument();
  expect(screen.queryByText("출하 제품")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("출하 제품");
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  expect(screen.getAllByText("출하 제품")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "조립 a 조립" }));
  expect(screen.getAllByText("출하 제품")).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "PF" } });
  expect(screen.getAllByText("출하 제품")).toHaveLength(2);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  expect(screen.queryByText("조립 a")).not.toBeInTheDocument();
});
it("최초 조회 실패는 재시도하고 갱신 실패는 기존 목록을 유지한다", () => {
  const retry = vi.fn();
  const { rerender } = render(<DesktopCapacityView active error="조회 실패" onRetry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledOnce();
  rerender(<DesktopCapacityView active capacityData={data} error="조회 실패" onRetry={retry} />);
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("최신 수량을 갱신하지 못했습니다.");
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 a BOM 보기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("최신 수량을 갱신하지 못했습니다.");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledTimes(2);
});
it("비활성 화면은 Esc와 뒤로가기를 처리하지 않고 재진입 선택을 유지한다", () => {
  const { rerender } = render(<DesktopCapacityView active capacityData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 a BOM 보기" }));
  rerender(<DesktopCapacityView active={false} capacityData={data} />);
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.popState(window, { state: {} });
  expect(screen.getByTestId("selected-bom")).toHaveTextContent("a: 10");
  rerender(<DesktopCapacityView active capacityData={data} />);
  fireEvent.popState(window, { state: {} });
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  fireEvent.popState(window, { state: { desktopCapacitySelection: JSON.stringify(["b", "same"]) } });
  expect(screen.getByTestId("selected-bom")).toHaveTextContent("b: 11");
});
it("갱신 후 삭제된 경로는 다른 제품을 임의 선택하지 않고 목록으로 복귀한다", () => {
  const { rerender } = render(<DesktopCapacityView active capacityData={data} />);
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 b BOM 보기" }));
  rerender(<DesktopCapacityView active capacityData={{ ...data, af: { ...data.af!, pf_variants: [data.af!.pf_variants[0]] } }} />);
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("출하 경로가 변경");
});
it("같은 PF의 다른 조립 경로를 구분하고 뒤로 버튼으로 비교표에 복귀한다", () => {
  render(<DesktopCapacityView capacityData={data} active />);
  fireEvent.click(screen.getByRole("button", { name: "목록 모두 펼치기" }));
  fireEvent.click(screen.getByRole("button", { name: "출하 제품 PF 조립 b BOM 보기" }));
  expect(screen.getByTestId("selected-bom")).toHaveTextContent("b: 11");
  fireEvent.click(screen.getByRole("button", { name: "생산 가능 목록으로 돌아가기" }));
  expect(screen.queryByTestId("selected-bom")).not.toBeInTheDocument();
  expect(screen.getByRole("table")).toBeVisible();
});
