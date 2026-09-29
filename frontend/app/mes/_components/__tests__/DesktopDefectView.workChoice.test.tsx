import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopDefectView } from "../DesktopDefectView";
import type { Operator } from "../login/useCurrentOperator";
import type { Item } from "../_warehouse_v2/types";

vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => null }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { listDefects: vi.fn().mockResolvedValue([]) } }));
vi.mock("../_warehouse_hooks/useWarehouseData", () => ({
  useWarehouseData: () => ({ items: [item], productModels: [] }),
}));

const item = {
  item_id: "assembly", item_name: "조립 시험 품목", mes_code: "3-AF-0001",
  process_type_code: "AF", has_bom: true, unit: "EA", warehouse_qty: 10,
  production_total: 10, pending_quantity: 0, available_quantity: 20,
  locations: [{ department: "조립", status: "PRODUCTION", quantity: 10, pending_quantity: 0, available_quantity: 10 }],
  model_slots: [],
} as unknown as Item;
const operator = { employee_id: "tester", name: "테스터", department: "조립", warehouse_role: "none", department_role: "none" } as Operator;

async function openWork(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { render(<QueryClientProvider client={client}><DesktopDefectView operator={operator} /></QueryClientProvider>); });
  fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));
}

function finishExit(): void {
  fireEvent.animationEnd(screen.getByTestId("defect-work-choice"));
}

beforeEach(() => {
  window.history.replaceState({ defect: "hub" }, "");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

describe("데스크톱 불량 작업·출처 통합 선택", async () => {
  it("최초 진입에는 작업 세 개만 표시한다", async () => {
    await openWork();
    for (const label of ["격리 등록", "즉시 폐기", "즉시 재작업"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByRole("button", { name: /^(부서 재고|창고 재고)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /다음/ })).not.toBeInTheDocument();
  });

  it("작업을 바꿔도 같은 출처 영역과 이력을 유지한다", async () => {
    await openWork();
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: /격리 등록/ }));
    const warehouse = screen.getByRole("button", { name: /창고 재고/ });
    expect(warehouse).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기/ }));
    expect(screen.getByRole("button", { name: /창고 재고/ })).toBe(warehouse);
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "scrap" });
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it.each(["격리 등록", "즉시 폐기"])("%s 출처 클릭은 품목으로 한 번만 진행한다", async (label) => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
    const push = vi.spyOn(window.history, "pushState");
    const warehouse = screen.getByRole("button", { name: /창고 재고/ });
    fireEvent.click(warehouse);
    fireEvent.click(warehouse);
    finishExit();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state).toMatchObject({ defect: "cart", source: "warehouse", step: 2 });
    expect(screen.getByRole("columnheader", { name: "창고 가용" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: label === "격리 등록" ? "불량 격리" : "즉시 폐기" })).toHaveFocus();
    push.mockRestore();
  });

  it("재작업은 출처 선택 없이 부서 품목으로 진행한다", async () => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /즉시 재작업/ }));
    expect(screen.queryByRole("button", { name: /창고 재고/ })).not.toBeInTheDocument();
    finishExit();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
    expect(screen.getByText("조립 시험 품목")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /BOM 확인/ })).toBeInTheDocument();
  });

  it("모션 감소 설정에서는 기다리지 않고 진행한다", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /즉시 재작업/ }));
    expect(screen.getByRole("heading", { name: "즉시 재작업" })).toHaveFocus();
  });

  it("브라우저 뒤로가기는 선택을 복원하고 자동 진행하지 않는다", async () => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /즉시 폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /창고 재고/ }));
    finishExit();
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /즉시 폐기/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /창고 재고/ })).toHaveAttribute("aria-pressed", "true");
    expect(window.history.state.defect).toBe("work-choice");
  });

  it("전환 중 나가면 예약된 품목 이동을 취소한다", async () => {
    vi.useFakeTimers();
    try {
      await openWork();
      fireEvent.click(screen.getByRole("button", { name: /즉시 재작업/ }));
      fireEvent(window, new PopStateEvent("popstate", { state: { defect: "hub" } }));
      act(() => { vi.runAllTimers(); });
      expect(screen.getByRole("button", { name: /불량 처리/ })).toBeInTheDocument();
      expect(screen.queryByTestId("defect-step2-grid")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("전환 중 선택 이력으로 복귀하면 버튼을 다시 사용할 수 있다", async () => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /격리 등록/ }));
    fireEvent.click(screen.getByRole("button", { name: /창고 재고/ }));
    fireEvent(window, new PopStateEvent("popstate", { state: { defect: "work-choice", action: "add", source: null } }));
    expect(screen.getByRole("button", { name: /^부서 재고/ })).toBeEnabled();
    expect(screen.getByTestId("defect-work-choice")).toHaveAttribute("aria-busy", "false");
  });

  it.each([
    [{ defect: "cart", mode: "add", step: 1, source: "production" }, "격리 등록"],
    [{ defect: "cart", mode: "scrap", directAction: "scrap", step: 1, source: "warehouse" }, "즉시 폐기"],
  ])("이전 출처 선택 이력 %o는 통합 화면으로 복원한다", async (state, label) => {
    window.history.replaceState(state, "");
    const client = new QueryClient();
    await act(async () => { render(<QueryClientProvider client={client}><DesktopDefectView operator={operator} /></QueryClientProvider>); });
    expect(screen.getByRole("button", { name: new RegExp(label) })).toHaveAttribute("aria-pressed", "true");
    expect(window.history.state.defect).toBe("work-choice");
    expect(screen.getByRole("button", { name: /창고 재고/ })).toHaveAttribute("aria-pressed", "false");
  });
});
