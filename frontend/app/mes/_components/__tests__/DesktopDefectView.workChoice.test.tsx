import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCallback, useState } from "react";
import { DesktopDefectView } from "../DesktopDefectView";
import type { Operator } from "../login/useCurrentOperator";
import type { Item } from "../_warehouse_v2/types";

vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => null }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: { listDefects: vi.fn().mockResolvedValue([]), listReasonCategories: vi.fn().mockResolvedValue([{ category_id: "surface-id", name: "외관 불량", is_active: true, is_other: false }]) } }));
vi.mock("@/lib/api/dept-adjustment", () => ({ deptAdjustmentApi: { getBomTemplate: vi.fn().mockResolvedValue({ lines: [] }) } }));
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

function FullscreenDesktopHarness({ onFullscreenChange }: { onFullscreenChange: (fullscreen: boolean) => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  const changeFullscreen = useCallback((next: boolean): void => {
    setFullscreen(next);
    onFullscreenChange(next);
  }, [onFullscreenChange]);
  return <>
    <output aria-label="부모 전체 화면 상태">{fullscreen ? "확대" : "기본"}</output>
    <DesktopDefectView operator={operator} itemPickerFullscreen={fullscreen} onItemPickerFullscreenChange={changeFullscreen} />
  </>;
}

async function mountDesktop(): Promise<ReturnType<typeof render>> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let mounted!: ReturnType<typeof render>;
  await act(async () => { mounted = render(<QueryClientProvider client={client}><DesktopDefectView operator={operator} /></QueryClientProvider>); });
  return mounted;
}

async function openWork(): Promise<ReturnType<typeof render>> {
  const mounted = await mountDesktop();
  fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));
  return mounted;
}

function finishExit(): void {
  fireEvent.animationEnd(screen.getByTestId("defect-work-choice"));
}

beforeEach(() => {
  window.history.replaceState({ defect: "hub" }, "");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

describe("데스크톱 불량 작업·출처 통합 선택", async () => {
  it("실제 작성 흐름의 전체 화면 제어를 부모로 전달하고 단계 이동과 해제 때 초기화한다", async () => {
    const onFullscreenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let mounted!: ReturnType<typeof render>;
    await act(async () => {
      mounted = render(<QueryClientProvider client={client}><FullscreenDesktopHarness onFullscreenChange={onFullscreenChange} /></QueryClientProvider>);
    });
    fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));
    fireEvent.click(screen.getByRole("button", { name: /^격리 등록/ }));
    fireEvent.click(screen.getByRole("button", { name: /^부서 재고/ }));
    finishExit();
    fireEvent.change(screen.getByRole("textbox", { name: "검색" }), { target: { value: "조립 시험" } });
    fireEvent.click(screen.getByRole("button", { name: "조립 시험 품목 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 화면", exact: true }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText("부모 전체 화면 상태")).toHaveTextContent("확대");
    expect(screen.queryByRole("navigation", { name: "불량 처리 단계" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("부모 전체 화면 상태")).toHaveTextContent("기본");
    expect(screen.getByRole("textbox", { name: "검색" })).toHaveValue("조립 시험");
    expect(screen.getByText("선택 1품목")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 화면", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "수량·처리 정보 →", exact: true }));
    expect(screen.getByLabelText("부모 전체 화면 상태")).toHaveTextContent("기본");
    expect(screen.getByRole("navigation", { name: "불량 처리 단계" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: /품목 선택/ }));
    fireEvent.click(await screen.findByRole("button", { name: "전체 화면", exact: true }));
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);
    mounted.unmount();
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("완료한 작업·출처 단계와 불량 메뉴 칸으로 각각 돌아간다", async () => {
    await openWork();
    const navigation = within(screen.getByRole("navigation", { name: "불량 처리 단계" }));
    expect(navigation.queryByRole("button", { name: "이전" })).not.toBeInTheDocument();
    expect(navigation.getByRole("button", { name: "작업·출처", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^격리 등록/ }));
    fireEvent.click(screen.getByRole("button", { name: /^부서 재고/ }));
    finishExit();
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: /^작업·출처/ }));
    await waitFor(() => expect(screen.getByTestId("defect-work-choice")).toBeInTheDocument());
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "add", source: "production" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: "불량 메뉴", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: /불량 처리 품목을/ })).toBeInTheDocument());
    expect(window.history.state).toMatchObject({ defect: "hub" });
  });
  it.each([
    { reloads: 1, exitStep: 2 },
    { reloads: 1, exitStep: 4 },
    { reloads: 2, exitStep: 2 },
    { reloads: 2, exitStep: 4 },
  ])("BOM 새로고침 $reloads 회 후 $exitStep 단계에서 실제 작업 선택으로 돌아간다", async ({ reloads, exitStep }) => {
    let mounted = await openWork();
    fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
    finishExit();
    async function enterBom(): Promise<void> {
      fireEvent.click(screen.getByRole("button", { name: "조립 시험 품목 장바구니에 추가" }));
      fireEvent.click(screen.getByRole("button", { name: "수량·처리 정보 →", exact: true }));
      fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "2" } });
      fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
      fireEvent.click(await screen.findByRole("button", { name: "외관 불량", exact: true }));
      fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: "새로고침 후 사유" } });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /BOM 확인 →/ })); });
      expect(screen.getByText("BOM 재작업 트리")).toBeInTheDocument();
    }
    for (let count = 0; count < reloads; count++) {
      await enterBom();
      mounted.unmount();
      mounted = await mountDesktop();
      expect(window.history.state).toMatchObject({ defect: "cart", step: 2 });
      expect(screen.getByText("선택 0품목")).toBeInTheDocument();
    }
    if (exitStep === 4) {
      await enterBom();
      act(() => window.history.back());
      await waitFor(() => expect(screen.getByPlaceholderText(/스크래치 다수/)).toHaveValue("새로고침 후 사유"));
      act(() => window.history.forward());
      await waitFor(() => expect(screen.getByText("BOM 재작업 트리")).toBeInTheDocument());
    }
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: /작업·출처/ }));
    if (exitStep === 4) fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    await waitFor(() => expect(screen.getByTestId("defect-work-choice")).toBeInTheDocument());
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "rework", source: "production" });
  });
  it("최초 진입에는 작업 세 개만 표시한다", async () => {
    await openWork();
    expect(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getAllByRole("button")).toHaveLength(4);
    for (const label of ["격리 등록", "즉시 폐기", "즉시 재작업"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.queryByRole("button", { name: /^(부서 재고|창고 재고)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /다음/ })).not.toBeInTheDocument();
  });

  it("작업을 바꿔도 같은 출처 영역과 이력을 유지한다", async () => {
    await openWork();
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: /^격리 등록/ }));
    const warehouse = screen.getByRole("button", { name: /^창고 재고/ });
    expect(warehouse).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /^즉시 폐기/ }));
    expect(screen.getByRole("button", { name: /^창고 재고/ })).toBe(warehouse);
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "scrap" });
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it.each(["격리 등록", "즉시 폐기"])("%s 출처 클릭은 품목으로 한 번만 진행한다", async (label) => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));
    const push = vi.spyOn(window.history, "pushState");
    const warehouse = screen.getByRole("button", { name: /^창고 재고/ });
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
    fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
    expect(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getAllByRole("button")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /^창고 재고/ })).not.toBeInTheDocument();
    finishExit();
    expect(window.history.state).toMatchObject({ directAction: "rework", source: "production", step: 2 });
    expect(screen.getByText("조립 시험 품목")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수량·처리 정보 →", exact: true })).toBeInTheDocument();
  });
  it("BOM에서 1단계 이탈 확인을 취소하면 보존하고 승인하면 실제 작업 선택으로 이동한다", async () => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
    finishExit();
    fireEvent.click(screen.getByRole("button", { name: "조립 시험 품목 장바구니에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "수량·처리 정보 →", exact: true }));
    fireEvent.change(screen.getByPlaceholderText(/예: 3/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "사유 카테고리 선택" }));
    fireEvent.click(await screen.findByRole("button", { name: "외관 불량", exact: true }));
    fireEvent.change(screen.getByPlaceholderText(/스크래치 다수/), { target: { value: "보존할 메모" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /BOM 확인 →/ })); });
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: /작업·출처/ }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByText("BOM 재작업 트리")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("navigation", { name: "불량 처리 단계" })).getByRole("button", { name: /작업·출처/ }));
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    await waitFor(() => expect(screen.getByTestId("defect-work-choice")).toBeInTheDocument());
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "rework", source: "production" });
    fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
    finishExit();
    expect(screen.getByText("선택 0품목")).toBeInTheDocument();
  });

  it("모션 감소 설정에서는 기다리지 않고 진행한다", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
    expect(screen.getByRole("heading", { name: "즉시 재작업" })).toHaveFocus();
  });

  it("브라우저 뒤로가기는 선택을 복원하고 자동 진행하지 않는다", async () => {
    await openWork();
    fireEvent.click(screen.getByRole("button", { name: /^즉시 폐기/ }));
    fireEvent.click(screen.getByRole("button", { name: /^창고 재고/ }));
    finishExit();
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /^즉시 폐기/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /^창고 재고/ })).toHaveAttribute("aria-pressed", "true");
    expect(window.history.state.defect).toBe("work-choice");
  });

  it("전환 중 나가면 예약된 품목 이동을 취소한다", async () => {
    vi.useFakeTimers();
    try {
      await openWork();
      fireEvent.click(screen.getByRole("button", { name: /^즉시 재작업/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /^격리 등록/ }));
    fireEvent.click(screen.getByRole("button", { name: /^창고 재고/ }));
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
    expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
    expect(window.history.state.defect).toBe("work-choice");
    expect(screen.getByRole("button", { name: /^창고 재고/ })).toHaveAttribute("aria-pressed", "false");
  });
});
