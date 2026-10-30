import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { DashboardNavigationProvider, useDashboardNavigation, useDashboardSnapshot } from "../../DashboardNavigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CostNode } from "@/lib/api/types/cost";
import { CostTree, CostViews } from "../CostAnalysisPanel";

vi.mock("../../DepartmentsContext", () => ({ useDeptColorLookup: () => (name: string) => name === "조립" ? "#123456" : "#654321" }));

const node = (id: string, children: CostNode[] = []): CostNode => ({
  item_id: id, mes_code: id, item_name: `품목 ${id}`, quantity_per_parent: "2", required_quantity: "6",
  material_cost: "100", own_labor_cost: "20", labor_cost: "20", unit_cost: "120.50", amount: "723.00",
  status: "complete", issues: [], children,
});
const tree = (): CostNode => node("root", [node("a", [node("shared", [node("leaf-a")])]), node("b", [node("shared", [node("leaf-b")])]), node("raw")]);
const pick = (id: string): HTMLElement => screen.getAllByRole("button", { name: `품목 ${id} 계통 선택` })[0];
const card = (id: string): HTMLElement => pick(id).closest("article")!;
const chooseScope = (label: string): void => {
  fireEvent.click(screen.getByRole("combobox", { name: "강조할 품목 범위" }));
  expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["상하위 품목", "하위 품목", "상위 품목", "직속 상하위 품목"]);
  fireEvent.mouseDown(screen.getByRole("option", { name: label, exact: true }));
};

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} }));
afterEach(() => vi.unstubAllGlobals());

describe("AC 압축·집중 가계도", () => {
  it("집중·상위 경로·전체 복귀를 각각 기록하고 뒤로·앞으로 선택과 카메라를 복원한다", async () => {
    function Workspace() {
      const nav=useDashboardNavigation()!;
      return <><button onClick={()=>nav.navigate("cost")}>원가 진입</button><CostTree root={tree()} /></>;
    }
    window.history.replaceState({__NA:true},"","/mes?tab=dashboard");
    render(<DashboardNavigationProvider><Workspace /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByText("원가 진입"));
    const push=vi.spyOn(window.history,"pushState");
    const restore=(state:unknown):void=>{act(()=>{window.history.replaceState(state,"","");window.dispatchEvent(new PopStateEvent("popstate",{state}));});};
    fireEvent.click(screen.getByRole("button",{name:"가계도 확대"}));
    fireEvent.keyDown(screen.getByRole("group",{name:"품목 원가 가계도"}),{key:"ArrowRight"});
    fireEvent.click(pick("shared"));
    fireEvent.click(screen.getAllByRole("button",{name:"품목 shared 비용 상세 펼치기"})[0]);
    expect(push).not.toHaveBeenCalled();
    const full=window.history.state;
    const camera=screen.getByTestId("cost-tree-content").getAttribute("style");
    fireEvent.click(screen.getByRole("button",{name:"집중 탐색",exact:true}));
    const child=window.history.state;
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("navigation",{name:"집중 탐색 위치"})).getByRole("button",{name:"품목 shared",exact:true}));
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("navigation",{name:"집중 탐색 위치"})).getByRole("button",{name:"품목 a",exact:true}));
    const parent=window.history.state;
    expect(push).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button",{name:"전체 트리로 복귀"}));
    const returned=window.history.state;
    expect(push).toHaveBeenCalledTimes(3);
    restore(parent);
    expect(pick("a").closest("article")).toHaveAttribute("data-hero","true");
    restore(child);
    expect(pick("shared").closest("article")).toHaveAttribute("data-hero","true");
    restore(full);
    expect(screen.queryByRole("navigation",{name:"집중 탐색 위치"})).not.toBeInTheDocument();
    expect(pick("shared")).toHaveAttribute("aria-pressed","true");
    expect(screen.getByRole("button",{name:"품목 shared 비용 상세 접기"})).toBeVisible();
    await waitFor(()=>expect(screen.getByTestId("cost-tree-content")).toHaveAttribute("style",camera!));
    restore(child);restore(returned);
    expect(screen.queryByRole("navigation",{name:"집중 탐색 위치"})).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button",{name:"처음 보기"}));
    expect(push).toHaveBeenCalledTimes(3);
    fireEvent.click(pick("a"));
    fireEvent.click(screen.getByRole("button",{name:"집중 탐색",exact:true}));
    const beforeOverview=window.history.state;
    fireEvent.click(screen.getByRole("button",{name:"처음 보기"}));
    expect(push).toHaveBeenCalledTimes(5);
    restore(beforeOverview);
    expect(pick("a").closest("article")).toHaveAttribute("data-hero","true");
    expect(window.history.state.__NA).toBe(true);
    push.mockRestore();
  });
  it("모든 카드에서 품목명 뒤에 품목코드를 표시한다", () => {
    render(<CostTree root={tree()} />);
    expect(screen.getAllByRole("button", { name: /집중 탐색$/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "집중 탐색", exact: true })).toBeDisabled();
    for(const button of screen.getAllByRole("button",{name:/계통 선택$/})) {
      expect(button.children[0].textContent).toMatch(/^품목 /);
      expect(button.children[1].textContent).not.toMatch(/^품목 /);
    }
  });
  it("상세를 다시 만들 때도 이력의 집중 위치와 선택을 초기 보정으로 덮지 않는다", () => {
    function Workspace() {
      const nav = useDashboardNavigation()!;
      const [open, setOpen] = useState(false);
      useDashboardSnapshot("cost:main", () => open, setOpen, { isHome: !open, home: () => setOpen(false) });
      return <><button onClick={() => nav.navigate("cost")}>원가</button><button onClick={() => nav.commit(() => setOpen(true))}>상세</button>{open && <CostTree root={tree()} />}</>;
    }
    window.history.replaceState({}, "", "/mes?tab=dashboard");
    render(<DashboardNavigationProvider><Workspace /></DashboardNavigationProvider>);
    fireEvent.click(screen.getByText("원가"));
    fireEvent.click(screen.getByText("상세"));
    fireEvent.click(pick("a"));
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "품목 a 비용 상세 펼치기" }));
    const entry = window.history.state;
    fireEvent.click(screen.getByText("원가"));
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: entry })));
    expect(screen.getByRole("navigation", { name: "집중 탐색 위치" })).toBeVisible();
    expect(pick("a")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "품목 a 비용 상세 접기" })).toBeVisible();
  });
  it("네 부서 F/A를 같은 가로 영역에 놓고 원자재 행은 각각 아래에 둔다", () => {
    render(<CostTree root={node("3-AF-1", [
      ...["N", "V", "H", "T"].map(process => node(`3-${process}F-1`, [node(`3-${process}A-1`, [node(`3-${process}R-1`)])])),
    ])} />);
    const strip = card("3-NF-1").closest("[data-department-strip='processes']");
    expect(strip).not.toBeNull();
    expect(card("3-AF-1").closest("[data-department-strip='processes']")).toBeNull();
    for (const process of ["N", "V", "H", "T"]) {
      expect(card(`3-${process}F-1`).closest("[data-department-strip]")).toBe(strip);
      expect(card(`3-${process}A-1`).closest("[data-department-strip]")).toBe(strip);
      expect(card(`3-${process}A-1`).closest("[data-department-row]")).toHaveAttribute("data-process-tier", "fa");
      expect(card(`3-${process}R-1`).closest("[data-department-row]")).toHaveAttribute("data-process-tier", "raw");
    }
  });

  it("공정순·대시보드 부서 색을 쓰며 단계 배지와 하단 상세를 없앤다", () => {
    render(<CostTree root={node("root", [node("3-NF-0001", [node("shared")]), node("3-AA-0001", [node("shared")]), node("3-PR-0001")])} />);
    expect(screen.getAllByRole("heading", { level: 4 }).map(heading => heading.textContent)).toEqual(["출하", "조립", "튜닝", "기타"]);
    expect(card("3-AA-0001").style.getPropertyValue("--branch-color")).toBe("#123456");
    expect(screen.queryByText(/\d+단계/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "선택 품목 상세" })).not.toBeInTheDocument();
    expect(card("3-NF-0001")).toHaveAttribute("data-cost-path", "root/0:3-NF-0001");
    fireEvent.click(pick("3-NF-0001"));
    expect(card("3-NF-0001")).toHaveAttribute("title", "품목 root → 품목 3-NF-0001");
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색", exact: true }));
    expect(card("3-NF-0001")).toHaveAttribute("data-cost-depth", "1");
  });

  it("포장 단일 경로를 따라 실제 조립품 분기를 처음부터 보여준다", () => {
    render(<CostTree root={node("product", [node("package", [node("assembly", [node("left", [node("part-l")]), node("right", [node("part-r")])]), node("bag")]), node("box")])} />);
    expect(pick("left")).toBeVisible();
    expect(pick("right")).toBeVisible();
    expect(pick("part-l")).toBeVisible();
    expect(pick("bag")).toBeVisible();
    expect(pick("box")).toBeVisible();
  });

  it("압축 부품 행에서도 선택과 비용 상세는 서로 독립적으로 동작한다", () => {
    render(<CostTree root={node("root", [node("raw")])} />);
    const parts = card("raw");
    fireEvent.click(within(parts).getByRole("button", { name: "품목 raw 비용 상세 펼치기" }));
    expect(pick("raw")).toHaveAttribute("aria-pressed", "false");
    expect(within(parts).getByText("개당 원가")).toBeVisible();
    fireEvent.click(pick("raw"));
    expect(parts).toHaveAttribute("title", "품목 root → 품목 raw");
    expect(within(parts).getByRole("button", { name: "품목 raw 비용 상세 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("반복 품목을 경로로 구분하고 상하위·하위·상위·직접 연결을 강조한다", () => {
    render(<CostTree root={tree()} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    fireEvent.click(pick("shared"));
    expect(pick("shared")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: "품목 shared 계통 선택" })[1]).toHaveAttribute("aria-pressed", "false");
    expect(card("root")).toHaveAttribute("data-highlight", "related");
    expect(card("leaf-a")).toHaveAttribute("data-highlight", "related");
    expect(card("b")).toHaveAttribute("data-highlight", "dim");
    chooseScope("하위 품목");
    expect(card("a")).toHaveAttribute("data-highlight", "dim");
    expect(card("leaf-a")).toHaveAttribute("data-highlight", "related");
    chooseScope("상위 품목");
    expect(card("root")).toHaveAttribute("data-highlight", "related");
    expect(card("leaf-a")).toHaveAttribute("data-highlight", "dim");
    chooseScope("직속 상하위 품목");
    expect(card("root")).toHaveAttribute("data-highlight", "dim");
    expect(card("a")).toHaveAttribute("data-highlight", "related");
    expect(card("leaf-a")).toHaveAttribute("data-highlight", "related");
  });

  it("집중 탐색은 원래 수량과 전체 경로를 유지하고 복귀하면 배율·위치·펼침을 복원한다", () => {
    render(<CostTree root={tree()} />);
    const viewport = screen.getByRole("group", { name: "품목 원가 가계도" });
    fireEvent.click(screen.getByRole("button", { name: "품목 a 하위 품목 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "가계도 확대" }));
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    fireEvent.keyDown(viewport, { key: "ArrowDown" });
    const originalView = screen.getByTestId("cost-tree-content").style.transform;
    fireEvent.click(pick("b"));
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색" }));
    expect(screen.queryByRole("button", { name: "품목 a 계통 선택" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "집중 탐색 위치" })).toHaveTextContent("품목 root");
    fireEvent.click(pick("shared"));
    expect(card("shared")).toHaveAttribute("title", "품목 root → 품목 b → 품목 shared");
    expect(card("shared")).toHaveAttribute("data-cost-depth", "2");
    fireEvent.click(screen.getByRole("button", { name: "품목 shared 비용 상세 펼치기" }));
    expect(within(card("shared")).getByText("소요량").nextElementSibling).toHaveTextContent("6");
    expect(card("shared")).toHaveTextContent("723 원");
    fireEvent.click(screen.getByRole("button", { name: "가계도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 트리로 복귀" }));
    expect(screen.getByTestId("cost-tree-content").style.transform).toBe(originalView);
    expect(screen.getByRole("button", { name: "품목 a 하위 품목 펼치기" })).toBeInTheDocument();
  });

  it("시급 재조회와 탭 왕복에서 선택·범위·상세를 유지하며 최신 금액을 표시한다", () => {
    const original = tree();
    const view = render(<CostViews root={original} canEdit={false} />);
    fireEvent.click(pick("a"));
    chooseScope("하위 품목");
    fireEvent.click(screen.getByRole("button", { name: "품목 a 비용 상세 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "가계도 확대" }));
    const originalView = screen.getByTestId("cost-tree-content").style.transform;
    fireEvent.click(screen.getByRole("tab", { name: "표" }));
    const updated = tree();
    updated.children[0].amount = "9007199254740991.01";
    view.rerender(<CostViews root={updated} canEdit={false} />);
    fireEvent.click(screen.getByRole("tab", { name: "가계도" }));
    expect(pick("a")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: "강조할 품목 범위" })).toHaveTextContent("하위 품목");
    expect(screen.getByRole("button", { name: "품목 a 비용 상세 접기" })).toHaveAttribute("aria-expanded", "true");
    expect(card("a")).toHaveTextContent("9,007,199,254,740,991.01 원");
    expect(screen.getByTestId("cost-tree-content").style.transform).toBe(originalView);
  });

  it("같은 품목 재클릭·빈 공간·Esc는 강조만 해제하고 Esc 전파를 막는다", () => {
    const outsideEscape = vi.fn();
    render(<div onKeyDown={outsideEscape}><CostTree root={tree()} /></div>);
    const viewport = screen.getByRole("group", { name: "품목 원가 가계도" });
    fireEvent.click(pick("a"));
    fireEvent.click(pick("a"));
    expect(pick("a")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pick("a"));
    fireEvent.click(viewport);
    expect(pick("a")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pick("a"));
    fireEvent.keyDown(pick("a"), { key: "Escape" });
    expect(pick("a")).toHaveAttribute("aria-pressed", "false");
    expect(outsideEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(viewport, { key: "Escape" });
    expect(outsideEscape).toHaveBeenCalledTimes(1);
  });

  it("집중 범위에서 모두 접기를 해도 다른 가지와 비용 상세는 유지한다", () => {
    render(<CostTree root={tree()} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    fireEvent.click(screen.getByRole("button", { name: "품목 a 비용 상세 펼치기" }));
    fireEvent.click(pick("b"));
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색" }));
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByRole("button", { name: "품목 shared 계통 선택" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 트리로 복귀" }));
    expect(pick("leaf-a")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품목 a 비용 상세 접기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품목 b 하위 품목 접기" })).toBeInTheDocument();
    fireEvent.click(pick("b"));
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색" }));
    expect(screen.getByRole("button", { name: "품목 b 하위 품목 펼치기" })).toBeInTheDocument();
  });

  it("사라진 집중·선택 경로는 유효한 상위로 정리하고 다른 조회 품목에서는 초기화한다", () => {
    const original = tree();
    const view = render(<CostTree root={original} />);
    fireEvent.click(pick("shared"));
    fireEvent.click(screen.getByRole("button", { name: "집중 탐색" }));
    const changed = tree();
    changed.children[0].children = [];
    view.rerender(<CostTree root={changed} />);
    expect(screen.getByRole("navigation", { name: "집중 탐색 위치" })).toHaveTextContent("품목 a");
    expect(card("a")).toHaveAttribute("title", "품목 root → 품목 a");
    view.rerender(<CostTree root={node("new-root")} />);
    expect(screen.queryByRole("navigation", { name: "집중 탐색 위치" })).not.toBeInTheDocument();
    expect(pick("new-root")).toHaveAttribute("aria-pressed", "false");
  });

  it("말단을 처음부터 모두 표시하고 처음 보기로 전체 펼침을 복원한다", () => {
    render(<CostTree root={node("root", Array.from({ length: 12 }, (_, i) => node(`raw-${i}`)))} />);
    expect(pick("raw-11")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "모두 접기" }));
    expect(screen.queryByRole("button", { name: "품목 raw-11 계통 선택" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "처음 보기" }));
    expect(pick("raw-11")).toBeInTheDocument();
  });

  it("다수의 직속 조립품과 깊은 가지를 빠짐없이 펼치고 원본 BOM을 변경하지 않는다", () => {
    let deep = node("deep-9");
    for (let depth = 8; depth >= 0; depth--) deep = node(`deep-${depth}`, [deep]);
    const original = node("root", [deep, ...Array.from({ length: 9 }, (_, i) => node(`assembly-${i}`, [node(`part-${i}`)]))]);
    const before = JSON.stringify(original);
    render(<CostTree root={original} />);
    fireEvent.click(screen.getByRole("button", { name: "모두 펼치기" }));
    expect(screen.getAllByRole("button", { name: /계통 선택$/ })).toHaveLength(29);
    fireEvent.click(pick("deep-9"));
    expect(card("deep-9")).toHaveAttribute("data-cost-depth", "10");
    expect(card("deep-9").title).toContain("품목 root → 품목 deep-0");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("카드 비용 상세의 큰 수량·부분 비용·미등록과 0원을 정확하게 구분한다", () => {
    const original = node("root", [{ ...node("missing"), amount: null, unit_cost: null, status: "unavailable", issues: [{ code: "missing_price", item_id: "missing", path: ["root", "missing"] }] },
      { ...node("partial"), amount: "9007199254740991.01", required_quantity: "994014980014994001", status: "partial" }, { ...node("zero"), amount: "0.00" }]);
    render(<CostTree root={original} />);
    fireEvent.click(screen.getByRole("button", { name: "품목 missing 비용 상세 펼치기" }));
    expect(within(card("missing")).getAllByText("정보 없음")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "품목 partial 비용 상세 펼치기" }));
    expect(card("partial")).toHaveTextContent("9,007,199,254,740,991.01 원");
    expect(card("partial")).toHaveTextContent("994,014,980,014,994,001");
    expect(card("zero")).toHaveTextContent("0 원");
  });
});
