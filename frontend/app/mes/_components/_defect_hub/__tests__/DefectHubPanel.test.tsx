import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DefectHubPanel } from "../DefectHubPanel";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";

const realtime = vi.hoisted(() => ({ revision: null as number | null }));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => realtime.revision,
}));

// defectsApi 모킹
vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    getDefectKpi: vi.fn(),
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
  MobileDefectCartFlow: ({ mode }: { mode: string }) => (
    <div data-testid="cart-flow">{mode}</div>
  ),
}));

import { defectsApi } from "@/lib/api/defects";

const mockKpi: DefectKpi = {
  quarantined: 17,
  over_one_year: 3,
};

// 조립부 1개, 진공부 1개
const mockLocations: DefectLocation[] = [
  {
    item_id: "item-001",
    item_name: "전극(70kV)",
    mes_code: "7-TR-0001",
    department: "조립",
    quantity: 3,
    defective_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200일 전
    reason_category: "외관 불량",
    reason_memo: "스크래치",
  },
  {
    item_id: "item-002",
    item_name: "게터",
    mes_code: "7-TR-0003",
    department: "진공",
    quantity: 8,
    defective_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 400일 전 (1년 초과)
    reason_category: "기능 불량",
    reason_memo: null,
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
  vi.mocked(defectsApi.getDefectKpi).mockClear();
  vi.mocked(defectsApi.listDefects).mockClear();
  vi.mocked(defectsApi.getDefectKpi).mockResolvedValue(mockKpi);
  vi.mocked(defectsApi.listDefects).mockResolvedValue(mockLocations);
});

describe("DefectHubPanel", () => {
  // 항목 2-5 — 첫 화면(hub)은 카드 3장만. KPI/필터/격리 목록은 '격리 목록' 카드 선택 후 list 화면에서만.
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
      expect(screen.getByText("17")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("부서별 그룹핑이 정확하다 — 조립/진공 2개 부서 표시", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    openList();

    // scope="all"이 초기값 (기타는 생산라인 아님)
    await waitFor(() => {
      expect(screen.getByText("조립")).toBeInTheDocument();
      expect(screen.getByText("진공")).toBeInTheDocument();
    });
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
      expect(screen.queryByText("조립")).not.toBeInTheDocument();
      expect(screen.getByText("진공")).toBeInTheDocument();
    });
  });

  it("'불량 격리' 카드 클릭 시 다품목 카트(add)로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByText("불량 격리"));
    const cart = await screen.findByTestId("cart-flow");
    expect(cart).toHaveTextContent("add");
  });

  it("'바로 처리' 카드 클릭 시 다품목 카트(scrap)로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByText("바로 처리"));
    const cart = await screen.findByTestId("cart-flow");
    expect(cart).toHaveTextContent("scrap");
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
});

describe("DefectHubPanel realtime refresh", () => {
  it("reloads KPI and locations on revision without leaving an in-progress cart", async () => {
    const props = { currentEmployee: mockEmployee };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(await screen.findByTestId("cart-flow")).toHaveTextContent("add");
    await waitFor(() => {
      expect(defectsApi.getDefectKpi).toHaveBeenCalledTimes(1);
      expect(defectsApi.listDefects).toHaveBeenCalledTimes(1);
    });

    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    await waitFor(() => {
      expect(defectsApi.getDefectKpi).toHaveBeenCalledTimes(2);
      expect(defectsApi.listDefects).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("cart-flow")).toHaveTextContent("add");
  });

  it("keeps the loaded quarantine list visible while a realtime refresh is pending", async () => {
    const props = { currentEmployee: { ...mockEmployee, department: "기타" } };
    const { rerender } = render(<DefectHubPanel {...props} />);
    fireEvent.click(screen.getByText("격리 목록"));
    expect(await screen.findByText("7-TR-0001")).toBeInTheDocument();

    const pendingKpi = deferred<DefectKpi>();
    const pendingLocations = deferred<DefectLocation[]>();
    vi.mocked(defectsApi.getDefectKpi).mockReturnValueOnce(pendingKpi.promise);
    vi.mocked(defectsApi.listDefects).mockReturnValueOnce(pendingLocations.promise);
    realtime.revision = 1;
    rerender(<DefectHubPanel {...props} />);

    await waitFor(() => expect(defectsApi.listDefects).toHaveBeenCalledTimes(2));
    expect(screen.getByText("7-TR-0001")).toBeInTheDocument();
    expect(screen.queryByText(/로딩 중/)).not.toBeInTheDocument();

    await act(async () => {
      pendingKpi.resolve(mockKpi);
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
      { ...mockLocations[0], quantity: 1 },
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
