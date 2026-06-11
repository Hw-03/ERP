import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DefectHubPanel } from "../DefectHubPanel";
import type { DefectKpi, DefectLocation } from "@/lib/api/types/defects";

// defectsApi 모킹
vi.mock("@/lib/api/defects", () => ({
  defectsApi: {
    getDefectKpi: vi.fn(),
    listDefects: vi.fn(),
  },
}));

// 통합 처리 패널 모킹 — DOM 렌더만 검증 (실제 API 호출 X)
vi.mock("../../mobile/screens/MobileDefectProcessPanel", () => ({
  MobileDefectProcessPanel: ({ location }: { location: { mes_code: string } }) => (
    <div data-testid="process-panel">{location.mes_code}</div>
  ),
}));
// 격리 추가·바로 폐기 다품목 카트 모킹 — DOM 렌더만 검증
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

beforeEach(() => {
  vi.mocked(defectsApi.getDefectKpi).mockResolvedValue(mockKpi);
  vi.mocked(defectsApi.listDefects).mockResolvedValue(mockLocations);
});

/** 허브 진입 후 "격리 목록" 카드를 클릭해 list 화면으로 전환. */
async function goToList() {
  fireEvent.click(screen.getByText("격리 목록"));
}

describe("DefectHubPanel", () => {
  it("KPI 카드 2개를 렌더링한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    await goToList();

    await waitFor(() => {
      expect(screen.getByText("격리 중")).toBeInTheDocument();
      expect(screen.getByText("1년 이상 ⚠")).toBeInTheDocument();
    });
  });

  it("KPI 카드 값이 올바르게 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    await goToList();

    await waitFor(() => {
      expect(screen.getByText("17")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("부서별 그룹핑이 정확하다 — 조립/진공 2개 부서 표시", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    await goToList();

    // scope="all"이 초기값 (기타는 생산라인 아님)
    await waitFor(() => {
      expect(screen.getByText("조립")).toBeInTheDocument();
      expect(screen.getByText("진공")).toBeInTheDocument();
    });
  });

  it("400일 전 격리 항목에 ⚠1년 배지가 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    await goToList();

    await waitFor(() => {
      // 진공부 게터 — 400일 전이라 1년 초과 배지 표시
      expect(screen.getByText("1년 초과")).toBeInTheDocument();
    });
  });

  it("200일 전 격리 항목에는 ⚠1년 배지가 없다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    await goToList();

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
    await goToList();

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
    await goToList();

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

  it("'바로 폐기' 카드 클릭 시 다품목 카트(scrap)로 전환된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);
    fireEvent.click(screen.getByText("바로 폐기"));
    const cart = await screen.findByTestId("cart-flow");
    expect(cart).toHaveTextContent("scrap");
  });

  it("[처리] 버튼 클릭 시 통합 처리 패널이 열린다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);
    await goToList();

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
