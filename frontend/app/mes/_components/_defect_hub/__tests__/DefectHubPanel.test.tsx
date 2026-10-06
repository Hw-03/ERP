import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DefectHubPanel } from "../DefectHubPanel";
import type { DefectLocation } from "@/lib/api/types/defects";

const realtime = vi.hoisted(() => ({ revision: null as number | null }));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtime.revision,
}));

// defectsApi 모킹
vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    listDefects: vi.fn(),
  },
}));

// 통합 처리 패널 모킹 — DOM 렌더만 검증 (실제 API 호출 X)
vi.mock("../../mobile/screens/MobileDefectProcessPanel", () => ({
  MobileDefectProcessPanel: ({ location }: { location: { mes_code: string; quantity: number } }) => (
    <div data-testid="process-panel">{location.mes_code}:{location.quantity}</div>
  ),
}));
// 격리 추가·바로 처리 다품목 카트 모킹 — DOM 렌더만 검증
vi.mock("../../mobile/screens/MobileDefectCartFlow", () => ({
  MobileDefectCartFlow: ({ mode, defaultSource, initialAction, initialSource, onCancel }: { mode: string; defaultSource?: string; initialAction?: string; initialSource?: string; onCancel: () => void }) => (
    <div data-testid="cart-flow" data-default-source={defaultSource ?? "unset"} data-initial-action={initialAction} data-initial-source={initialSource}>{mode}<button type="button" onClick={onCancel}>모바일 카트 취소</button></div>
  ),
}));
vi.mock("../DefectProcessPanel", () => ({
  DefectProcessPanel: ({ locations, location, restoreOnly, onDone }: { locations?: DefectLocation[]; location?: DefectLocation; restoreOnly?: boolean; onDone: () => void }) => (
    <div data-testid="batch-process-panel">
      {(locations ?? (location ? [location] : [])).map((record) => record.record_id).join(",")}
      {restoreOnly && <span>정상 복귀 전용</span>}
      <button type="button" onClick={onDone}>처리 완료</button>
    </div>
  ),
}));
vi.mock("../DefectStatisticsView", () => ({
  DefectStatisticsView: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="statistics-view">
      불량 통계 화면
      <button type="button" onClick={onBack}>통계 뒤로</button>
    </div>
  ),
}));

import { defectsApi } from "@/lib/api/defects";

// 조립부 1개, 진공부 1개
const mockLocations: DefectLocation[] = [
  {
    record_id: "record-001",
    item_id: "item-001",
    item_name: "전극(70kV)",
    mes_code: "7-TR-0001",
    department: "조립",
    quantity: 3,
    original_quantity: 3,
    pending_quantity: 0,
    available_quantity: 3,
    defective_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200일 전
    reason_category: "외관 불량",
    reason_memo: "스크래치",
    quarantined_by: "김건호",
    quarantined_by_employee_id: "emp-001",
    is_legacy: false,
    has_bom: false,
  },
  {
    record_id: "record-002",
    item_id: "item-002",
    item_name: "게터",
    mes_code: "7-TR-0003",
    department: "진공",
    quantity: 8,
    original_quantity: 8,
    pending_quantity: 0,
    available_quantity: 8,
    defective_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 400일 전 (1년 초과)
    reason_category: "기능 불량",
    reason_memo: null,
    quarantined_by: "이서윤",
    quarantined_by_employee_id: "emp-002",
    is_legacy: false,
    has_bom: false,
  },
];

const mockEmployee = {
  employee_id: "emp-001",
  name: "김건호",
  department: "조립",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  realtime.revision = null;
  vi.mocked(defectsApi.listDefects).mockClear();
  vi.mocked(defectsApi.listDefects).mockResolvedValue(mockLocations);
  window.localStorage.clear();
  window.history.replaceState({ defect: "hub" }, "");
});

describe("DefectHubPanel", () => {
  it.each([
    ["격리 등록", "부서 재고", "add", "scrap", "production"],
    ["격리 등록", "창고 재고", "add", "scrap", "warehouse"],
    ["즉시 폐기", "부서 재고", "scrap", "scrap", "production"],
    ["즉시 폐기", "창고 재고", "scrap", "scrap", "warehouse"],
  ])("모바일 %s에서 %s를 고르면 품목 단계에 선택을 전달한다", async (work, source, mode, action, sourceKind) => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    fireEvent.click(screen.getByRole("button", { name: "불량 처리" }));
    expect(screen.queryByRole("button", { name: "부서 재고" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: work }));
    expect(screen.getByText("Step 2 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: work })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /다음/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: source }));
    expect(screen.getByTestId("mobile-defect-work-choice")).toHaveAttribute("aria-busy", "true");
    fireEvent.animationEnd(screen.getByTestId("mobile-defect-work-choice"));
    expect(screen.getByTestId("cart-flow")).toHaveTextContent(mode);
    expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-action", action);
    expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-source", sourceKind);
    expect(window.history.state).toMatchObject({ defect: "cart", mode, directAction: action, source: sourceKind, step: 2 });
    await act(async () => {});
  });

  it("모바일 즉시 재작업은 출처 화면 없이 부서 품목 단계로 간다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    fireEvent.click(screen.getByRole("button", { name: "불량 처리" }));
    fireEvent.click(screen.getByRole("button", { name: "즉시 재작업" }));
    fireEvent.animationEnd(screen.getByTestId("mobile-defect-work-choice"));
    expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-action", "rework");
    expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-source", "production");
    await act(async () => {});
  });

  it("모바일 뒤로가기는 작업과 출처 선택을 복원한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "work-choice", action: "scrap", source: "warehouse" } })));
    expect(screen.getByRole("button", { name: "즉시 폐기" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "창고 재고" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "격리 등록" }));
    expect(screen.getByRole("button", { name: "창고 재고" })).toHaveAttribute("aria-pressed", "false");
    expect(window.history.state).toMatchObject({ defect: "work-choice", action: "add", source: null });
    await act(async () => {});
  });

  it.each([
    { mode: "add", directAction: "scrap", step: 3 },
    { mode: "scrap", directAction: "scrap", step: 3 },
    { mode: "scrap", directAction: "rework", step: 4 },
  ])("모바일 상세 단계 $mode/$directAction/$step 앞뒤 이동에서 작업 화면을 유지한다", async (state) => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "cart", source: "production", ...state } })));
    expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-action", state.directAction);
    expect(screen.queryByTestId("mobile-defect-work-choice")).not.toBeInTheDocument();
    await act(async () => {});
  });

  it("이전 모바일 출처 history는 통합 선택 화면으로 복원한다", async () => {
    window.history.replaceState({ defect: "cart", mode: "add", step: 1, source: "warehouse" }, "");
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    expect(screen.getByRole("button", { name: "격리 등록" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "창고 재고" })).toBeInTheDocument();
    expect(screen.queryByTestId("cart-flow")).not.toBeInTheDocument();
    await act(async () => {});
  });

  it("모바일 이동 중 연속 탭과 중첩 애니메이션은 중복 이동하지 않는다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    fireEvent.click(screen.getByRole("button", { name: "불량 처리" }));
    fireEvent.click(screen.getByRole("button", { name: "격리 등록" }));
    const source = screen.getByRole("button", { name: "부서 재고" });
    const push = vi.spyOn(window.history, "pushState");
    try {
      fireEvent.click(source);
      fireEvent.click(source);
      fireEvent.animationEnd(source);
      expect(screen.queryByTestId("cart-flow")).not.toBeInTheDocument();
      fireEvent.animationEnd(screen.getByTestId("mobile-defect-work-choice"));
      expect(push).toHaveBeenCalledTimes(1);
      await act(async () => {});
    } finally { push.mockRestore(); }
  });

  it("모바일 모션 축소 설정에서는 지연 없이 품목 화면을 연다", async () => {
    const media = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    try {
      render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
      fireEvent.click(screen.getByRole("button", { name: "불량 처리" }));
      fireEvent.click(screen.getByRole("button", { name: "즉시 재작업" }));
      expect(screen.getByTestId("cart-flow")).toHaveAttribute("data-initial-action", "rework");
      await act(async () => {});
    } finally { media.mockRestore(); }
  });

  it("shows the collapsed filter and compact rows in the mobile list while keeping search visible", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    fireEvent.click(screen.getByText("격리 목록"));

    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("searchbox", { name: "불량 검색" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /전극\(70kV\).*격리 1건/ })).toHaveTextContent("7-TR-0001");
    expect(screen.queryByRole("button", { name: "처리" })).not.toBeInTheDocument();
  });

  it("모바일 격리 품목 행은 100px 높이에서 품명과 요약 정보를 읽기 쉽게 표시한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    openList();

    const row = await screen.findByTestId("defect-mobile-item-summary");
    expect(row).toHaveClass("h-[100px]");
    expect(within(row).getByText("전극(70kV)")).toBeInTheDocument();
    const name = within(row).getByText("전극(70kV)");
    const code = within(row).getByText("7-TR-0001");
    expect(code.parentElement).toBe(name.parentElement);
    expect(within(row).getByText("수량")).toBeInTheDocument();
    expect(within(row).getByText("최근")).toBeInTheDocument();
    expect(within(row).getByText("기록")).toBeInTheDocument();
  });

  it("preserves the dashboard model catalog order on mobile", async () => {
    const productModels = [{ slot: 3, model_name: "DX3000" }, { slot: 7, model_name: "COCOON" }, { slot: 4, model_name: "ADX4000W" }].map((model) => ({ ...model, symbol: null, is_reserved: false }));
    render(<DefectHubPanel currentEmployee={mockEmployee} productModels={productModels} />);
    fireEvent.click(screen.getByText("격리 목록"));
    const group = await screen.findByRole("group", { name: "모델 구분" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["전체", "DX3000", "COCOON", "ADX4000W"]);
  });

  // 항목 2-5 — 첫 화면(hub)은 카드 4장만. KPI/필터/격리 목록은 '격리 목록' 카드 선택 후 list 화면에서만.
  // 카드 라벨 '격리 목록' 을 눌러 list 화면으로 진입한다.
  function openList() {
    fireEvent.click(screen.getByText("격리 목록"));
  }

  it("KPI 카드 2개를 렌더링한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    openList();

    await waitFor(() => {
      expect(screen.getByText("격리 중")).toBeInTheDocument();
      expect(screen.getByText("1년 이상 ⚠")).toBeInTheDocument();
    });
  });

  it("KPI 카드 값이 올바르게 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    openList();

    await waitFor(() => {
      expect(screen.getByText("격리 중").parentElement).toHaveTextContent("1건");
      expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("0건");
    });
  });

  it("부서별 그룹핑이 정확하다 — 조립/진공 2개 부서 표시", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    // scope="all"이 초기값 (기타는 생산라인 아님)
    await waitFor(() => {
      expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
      expect(screen.getByText("7-TR-0003")).toBeInTheDocument();
    });
  });

  it("생산 부서 소속 창고 담당자는 데스크톱과 같이 전체 부서를 기본 조회한다", async () => {
    render(
      <DefectHubPanel
        currentEmployee={{ ...mockEmployee, warehouse_role: "primary" }}
      />,
    );
    openList();

    await waitFor(() => {
      expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
      expect(screen.getByText("7-TR-0003")).toBeInTheDocument();
    });
  });

  it("history 대상 state에 따라 통계와 목록 화면을 복원한다", async () => {
    window.history.replaceState({ defect: "statistics" }, "");
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    expect(await screen.findByTestId("statistics-view")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "list" } }));
    });
    expect(await screen.findByText("격리 중")).toBeInTheDocument();
  });

  it("목록에서 작업 선택으로 돌아간 뒤 통계 뒤로가기도 허브로 복귀한다", async () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.history.replaceState({ defect: "hub" }, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "hub" } }));
    });
    try {
      render(<DefectHubPanel currentEmployee={mockEmployee} />);
      openList();
      expect(window.history.state).toEqual({ defect: "list" });

      fireEvent.click(screen.getByRole("button", { name: /작업 선택/ }));
      expect(backSpy).toHaveBeenCalledTimes(1);
      expect(window.history.state).toEqual({ defect: "hub" });
      expect(screen.getByRole("button", { name: /불량 통계/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /불량 통계/ }));
      fireEvent.click(await screen.findByRole("button", { name: "통계 뒤로" }));

      expect(backSpy).toHaveBeenCalledTimes(2);
      expect(window.history.state).toEqual({ defect: "hub" });
      expect(screen.getByRole("button", { name: /격리 목록/ })).toBeInTheDocument();
    } finally {
      backSpy.mockRestore();
    }
  });

  it("400일 전 격리 항목에 ⚠1년 배지가 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    await waitFor(() => {
      // 진공부 게터 — 400일 전이라 1년 초과 배지 표시
      expect(screen.getByText("1년 초과")).toBeInTheDocument();
    });
  });

  it("200일 전 격리 항목에는 ⚠1년 배지가 없다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    await waitFor(() => {
      // 조립부 전극 — 200일 전이라 배지 없음. 항목 자체는 표시됨.
      expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
    });

    // 1년 초과 배지는 1개만 (게터)
    const badges = screen.queryAllByText("1년 초과");
    expect(badges).toHaveLength(1);
  });

  it("'1년 이상' KPI 카드 클릭 시 해당 항목만 필터된다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    await waitFor(() => {
      expect(screen.getByText("게터")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("1년 이상 ⚠"));

    await waitFor(() => {
      // 400일 된 게터만 남아야 함
      expect(screen.getByText("게터")).toBeInTheDocument();
      // 200일 된 전극은 사라져야 함
      expect(screen.queryByText("전극(70kV)")).not.toBeInTheDocument();
    });
  });

  it("defectDeptFilter prop 이 있으면 해당 부서 필터가 초기 적용된다", async () => {
    render(
      <DefectHubPanel
        currentEmployee={{ ...mockEmployee, department: "조립" }}
        defectDeptFilter="진공"
      />
    );
    openList();

    await waitFor(() => {
      // scope="my"이지만 defectDeptFilter="진공"이므로 진공 부서만 표시
      expect(screen.queryByText("7-TR-0001")).not.toBeInTheDocument();
      expect(screen.getByText("7-TR-0003")).toBeInTheDocument();
    });
  });

  it("'불량 처리'에서 격리 등록을 선택하면 다품목 카트(add)로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByText("불량 처리"));
    fireEvent.click(await screen.findByRole("button", { name: /격리 등록/ }));
    const cart = await screen.findByTestId("cart-flow");
    expect(cart).toHaveTextContent("add");
    expect(cart).toHaveAttribute("data-default-source", "unset");
  });

  it("모바일 작업 선택에는 공통 단계 헤더를 표시한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} mobilePresentation />);
    fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));

    expect(await screen.findByRole("heading", { name: "작업 선택", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Step 1 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeInTheDocument();
  });

  it("모바일 격리 카트 취소는 허브 대신 작업 선택 history로 돌아간다", async () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "work-choice" } }));
    });
    try {
      render(<DefectHubPanel currentEmployee={mockEmployee} />);
      fireEvent.click(screen.getByText("불량 처리"));
      fireEvent.click(await screen.findByRole("button", { name: /격리 등록/ }));
      fireEvent.click(screen.getByRole("button", { name: "모바일 카트 취소" }));

      expect(backSpy).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: /바로 처리/ })).toBeInTheDocument();
    } finally {
      backSpy.mockRestore();
    }
  });

  it("'불량 처리'에서 바로 처리를 선택하면 다품목 카트(scrap)로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByText("불량 처리"));
    fireEvent.click(await screen.findByRole("button", { name: /바로 처리/ }));
    const cart = await screen.findByTestId("cart-flow");
    expect(cart).toHaveTextContent("scrap");
  });

  it("B급·구형 카드는 기존 fixture에 없는 관리 분류를 DEFECT로 보아 목록에서 제외한다", async () => {
    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([
      { ...mockLocations[0], management_category: "B_GRADE" },
      { ...mockLocations[1], management_category: "DEFECT" },
    ]);
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();
    expect(await screen.findByText("7-TR-0003")).toBeInTheDocument();
    expect(screen.queryByText("7-TR-0001")).not.toBeInTheDocument();
  });

  it("B급·구형 보관 목록의 최초 로딩 상태를 표시한다", async () => {
    const pendingLocations = deferred<DefectLocation[]>();
    vi.mocked(defectsApi.listDefects).mockReturnValueOnce(pendingLocations.promise);
    render(<DefectHubPanel currentEmployee={mockEmployee} />);

    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("B급·구형 자재를 불러오는 중");

    await act(async () => {
      pendingLocations.resolve([]);
    });
  });

  it("모바일 정상 복귀 완료 뒤 B급·구형 보관 목록으로 돌아오고 전용 상태를 해제한다", async () => {
    vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...mockLocations[0], management_category: "B_GRADE" }]);
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);

    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    fireEvent.click(await screen.findByRole("button", { name: "정상 복귀" }));
    expect(await screen.findByText("정상 복귀 전용")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "처리 완료" }));
    expect(await screen.findByRole("heading", { name: "B급·구형 자재" })).toBeInTheDocument();
  });

  it("'불량 통계' 카드 클릭 시 주·월·연 통계 화면으로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByRole("button", { name: /불량 통계/ }));
    expect(await screen.findByTestId("statistics-view")).toBeInTheDocument();
  });

  it("[처리] 버튼 클릭 시 통합 처리 패널이 열린다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    await waitFor(() => {
      expect(screen.getAllByText("처리").length).toBeGreaterThan(0);
    });

    // 첫 항목(mes_code="7-TR-0001") 처리 → 데스크톱과 동일한 통합 처리 패널로 전환
    const processButtons = screen.getAllByText("처리");
    fireEvent.click(processButtons[0]);

    const panel = await screen.findByTestId("process-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("7-TR-0001");
  });

  it("모바일 재작업의 내부 history 이동은 처리 화면을 유지한다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} mobilePresentation />);
    openList();
    fireEvent.click(await screen.findByRole("button", { name: "전극(70kV) 격리 1건" }));
    fireEvent.click((await screen.findAllByText("처리"))[0]);
    expect(await screen.findByTestId("process-panel")).toBeInTheDocument();
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "process", recordId: "record-001", step: 2, mobileRework: { key: "record-001", nav: { path: [0] } } } })));
    expect(screen.getByTestId("process-panel")).toBeInTheDocument();
    act(() => window.dispatchEvent(new PopStateEvent("popstate", { state: { defect: "list" } })));
    expect(screen.queryByTestId("process-panel")).not.toBeInTheDocument();
  });

  it("동일 품목의 선택 기록만 모바일 다건 처리 패널로 전달한다", async () => {
    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([
      mockLocations[0],
      { ...mockLocations[0], record_id: "record-003", quantity: 2, original_quantity: 2, available_quantity: 2 },
    ]);
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} mobilePresentation />);
    openList();

    fireEvent.click(await screen.findByRole("button", { name: "전극(70kV) 격리 2건" }));
    const selectMany = await screen.findByRole("button", { name: "여러 건 선택" });
    await act(async () => { fireEvent.click(selectMany); });
    const checkboxes = await screen.findAllByRole("checkbox", { name: /전극\(70kV\).*선택/ });
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "선택 처리 2건" }));

    expect(await screen.findByTestId("batch-process-panel")).toHaveTextContent("record-001,record-003");
  });

  it("combines department and quarantine actor for the list and KPI population", async () => {
    const day = 24 * 60 * 60 * 1000;
    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([
      {
        ...mockLocations[0],
        record_id: "record-mine-assembly",
        item_id: "mine-assembly",
        item_name: "내 조립 격리",
        mes_code: "MINE-ASSEMBLY",
        department: mockEmployee.department,
        quarantined_by_employee_id: mockEmployee.employee_id,
        defective_at: new Date(Date.now() - 100 * day).toISOString(),
      },
      {
        ...mockLocations[0],
        record_id: "record-mine-vacuum",
        item_id: "mine-vacuum",
        item_name: "내 진공 격리",
        mes_code: "MINE-VACUUM",
        department: "진공",
        quarantined_by_employee_id: mockEmployee.employee_id,
        defective_at: new Date(Date.now() - 400 * day).toISOString(),
      },
      {
        ...mockLocations[0],
        record_id: "record-other-assembly",
        item_id: "other-assembly",
        item_name: "다른 작업자 격리",
        mes_code: "OTHER-ASSEMBLY",
        department: mockEmployee.department,
        quarantined_by_employee_id: "employee-2",
      },
      {
        ...mockLocations[0],
        record_id: "record-unknown-assembly",
        item_id: "unknown-assembly",
        item_name: "처리자 미상 격리",
        mes_code: "UNKNOWN-ASSEMBLY",
        department: mockEmployee.department,
        quarantined_by_employee_id: null,
      },
    ]);
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    openList();
    expect(await screen.findByText("UNKNOWN-ASSEMBLY")).toBeInTheDocument();

    const actorFilters = screen.getByText("격리자").parentElement!;
    fireEvent.click(within(actorFilters).getByRole("button", { name: "내가 격리" }));

    expect(screen.getByText("MINE-ASSEMBLY")).toBeInTheDocument();
    expect(screen.queryByText("MINE-VACUUM")).not.toBeInTheDocument();
    expect(screen.queryByText("OTHER-ASSEMBLY")).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN-ASSEMBLY")).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("1건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("0건");

    const departmentFilters = screen.getByRole("group", { name: "부서 구분" });
    fireEvent.click(within(departmentFilters).getByRole("button", { name: "전체" }));

    expect(screen.getByText("MINE-ASSEMBLY")).toBeInTheDocument();
    expect(screen.getByText("MINE-VACUUM")).toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("2건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("1건");
  });

  it("restores the employee's locked filters into the mobile list and KPI", async () => {
    window.localStorage.setItem(
      `dexcowin_mes_defect_filters:${mockEmployee.employee_id}`,
      JSON.stringify({ version: 1, scope: "all", actorScope: "mine", sort: "newest" }),
    );

    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    openList();

    expect(await screen.findByRole("checkbox", { name: "필터 고정" })).toBeChecked();
    expect(screen.getByRole("combobox")).toHaveValue("newest");
    expect(screen.getByRole("button", { name: "내가 격리" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("7-TR-0001")).toBeInTheDocument();
    expect(screen.queryByText("7-TR-0003")).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("1건");
  });

  it("applies mobile search with scope, actor, KPI intersection and keeps it after realtime refresh", async () => {
    const { rerender } = render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();
    expect(await screen.findByText("전극(70kV)")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "불량 검색" });
    fireEvent.change(search, { target: { value: " 기능 불량 " } });
    expect(screen.getByText("게터")).toBeInTheDocument();
    expect(screen.queryByText("전극(70kV)")).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("2건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("1건");

    fireEvent.click(screen.getByRole("button", { name: "내가 격리" }));
    expect(screen.queryByText("게터")).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("1건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("0건");

    fireEvent.change(search, { target: { value: "없는 검색어" } });
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "TARGET" } });
    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([
      { ...mockLocations[0], mes_code: "TARGET-001", quarantined_by_employee_id: mockEmployee.employee_id },
      { ...mockLocations[0], record_id: "other", mes_code: "OTHER-001", quarantined_by_employee_id: mockEmployee.employee_id },
    ]);
    realtime.revision = 1;
    rerender(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    await waitFor(() => expect(vi.mocked(defectsApi.listDefects)).toHaveBeenCalledTimes(2));
    expect(screen.getByText("TARGET-001")).toBeInTheDocument();
    expect(screen.queryByText("OTHER-001")).not.toBeInTheDocument();
  });

  it("preserves the selected sort order in the mobile filtered list", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();
    expect(await screen.findByText("전극(70kV)")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    const summaries = screen.getAllByTestId("defect-item-summary");
    expect(summaries[0]).toHaveTextContent("전극(70kV)");
    expect(summaries[1]).toHaveTextContent("게터");
  });

  it("intersects search and the over-year KPI while retaining scope KPI counts and sort order", async () => {
    const day = 24 * 60 * 60 * 1000;
    const matchingOld = { ...mockLocations[0], record_id: "target-old", item_id: "target-old", item_name: "검색 오래된", mes_code: "TARGET-OLD", defective_at: new Date(Date.now() - 400 * day).toISOString() };
    const matchingNew = { ...mockLocations[0], record_id: "target-new", item_id: "target-new", item_name: "검색 최신", mes_code: "TARGET-NEW", defective_at: new Date(Date.now() - 200 * day).toISOString() };
    const nonMatchingOld = { ...mockLocations[0], record_id: "other-old", item_id: "other-old", item_name: "다른 품목", mes_code: "OTHER-OLD", defective_at: new Date(Date.now() - 400 * day).toISOString() };
    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([matchingOld, matchingNew, nonMatchingOld]);

    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();
    expect(await screen.findByText("검색 오래된")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "불량 검색" });
    fireEvent.change(search, { target: { value: " target " } });
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("3건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("2건");
    expect(screen.queryByText("다른 품목")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "newest" } });
    let summaries = screen.getAllByTestId("defect-item-summary");
    expect(summaries[0]).toHaveTextContent("검색 최신");
    expect(summaries[1]).toHaveTextContent("검색 오래된");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oldest" } });
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("oldest"));
    summaries = screen.getAllByTestId("defect-item-summary");
    expect(summaries[0]).toHaveTextContent("검색 오래된");
    expect(summaries[1]).toHaveTextContent("검색 최신");

    fireEvent.click(screen.getByText("1년 이상 ⚠"));
    expect(screen.getByText("검색 오래된")).toBeInTheDocument();
    expect(screen.queryByText("검색 최신")).not.toBeInTheDocument();
    expect(screen.queryByText("다른 품목")).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("3건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("2건");
  });
});

describe("DefectHubPanel realtime refresh", () => {
  it("reloads locations on revision without leaving an in-progress cart", async () => {
    const props = { currentEmployee: mockEmployee };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /불량 처리/ }));
    fireEvent.click(screen.getByRole("button", { name: /격리 등록/ }));
    expect(await screen.findByTestId("cart-flow")).toHaveTextContent("add");
    await waitFor(() => {
      expect(defectsApi.listDefects).toHaveBeenCalledTimes(1);
    });

    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    await waitFor(() => {
      expect(defectsApi.listDefects).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("cart-flow")).toHaveTextContent("add");
  });

  it("keeps the loaded quarantine list visible while a realtime refresh is pending", async () => {
    const props = { currentEmployee: { ...mockEmployee, department: "기타" } };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByText("격리 목록"));
    expect(await screen.findByText("7-TR-0001")).toBeInTheDocument();

    const pendingLocations = deferred<DefectLocation[]>();
    vi.mocked(defectsApi.listDefects).mockReturnValueOnce(pendingLocations.promise);
    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    await waitFor(() => expect(defectsApi.listDefects).toHaveBeenCalledTimes(2));
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
    expect(screen.queryByText(/로딩 중/)).not.toBeInTheDocument();

    await act(async () => {
      pendingLocations.resolve(mockLocations);
    });
  });

  it("keeps the loaded quarantine list after refresh failure and retries in place", async () => {
    const props = { currentEmployee: { ...mockEmployee, department: "기타" } };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByText("격리 목록"));
    expect(await screen.findByText("7-TR-0001")).toBeInTheDocument();

    vi.mocked(defectsApi.listDefects).mockRejectedValueOnce(new Error("refresh failed"));
    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeInTheDocument();
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument());
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
  });

  it("keeps the B급·구형 보관 목록 visible after refresh failure and retries in place", async () => {
    const props = { currentEmployee: { ...mockEmployee, department: "기타" } };
    vi.mocked(defectsApi.listDefects).mockResolvedValue([{ ...mockLocations[0], management_category: "B_GRADE" }]);
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /B급·구형 자재/ }));
    expect(await screen.findByText("7-TR-0001")).toBeInTheDocument();

    vi.mocked(defectsApi.listDefects).mockRejectedValueOnce(new Error("storage refresh failed"));
    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    expect(await screen.findByRole("button", { name: "다시 동기화" })).toBeInTheDocument();
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 동기화" })).not.toBeInTheDocument());
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
  });

  it("reconnects a process view to the fresh location and returns to the list when it disappears", async () => {
    const props = { currentEmployee: { ...mockEmployee, department: "기타" } };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByText("격리 목록"));
    fireEvent.click((await screen.findAllByText("처리"))[0]);
    expect(screen.getByTestId("process-panel")).toHaveTextContent("7-TR-0001:3");

    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([
      { ...mockLocations[0], quantity: 1, available_quantity: 1 },
      mockLocations[1],
    ]);
    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);
    await waitFor(() => expect(screen.getByTestId("process-panel")).toHaveTextContent("7-TR-0001:1"));

    vi.mocked(defectsApi.listDefects).mockResolvedValueOnce([]);
    realtime.revision = 2;
    rerender(<DefectHubPanel {...props} />);
    await waitFor(() => expect(screen.queryByTestId("process-panel")).not.toBeInTheDocument());
    expect(screen.getByText("격리 중")).toBeInTheDocument();
  });
});
