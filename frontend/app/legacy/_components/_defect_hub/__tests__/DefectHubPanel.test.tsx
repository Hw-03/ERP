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

// 처리 모달 모킹 — DOM 렌더만 검증 (실제 API 호출 X)
vi.mock("../RDefectActionModal", () => ({
  RDefectActionModal: ({ open, location }: { open: boolean; location: { item_code: string } }) =>
    open ? <div data-testid="r-modal">{location.item_code}</div> : null,
}));
vi.mock("../PaPfDefectWizard", () => ({
  PaPfDefectWizard: ({ open, location }: { open: boolean; location: { item_code: string } }) =>
    open ? <div data-testid="papf-wizard">{location.item_code}</div> : null,
}));

import { defectsApi } from "@/lib/api/defects";

const mockKpi: DefectKpi = {
  quarantined: 17,
  over_one_year: 3,
  pending_approval: 2,
  processed_today: 1,
};

// 조립부 1개, 진공부 1개
const mockLocations: DefectLocation[] = [
  {
    item_id: "item-001",
    item_name: "전극(70kV)",
    item_code: "7-TR-0001",
    department: "조립",
    quantity: 3,
    defective_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // 200일 전
    reason_category: "외관 불량",
    reason_memo: "스크래치",
  },
  {
    item_id: "item-002",
    item_name: "게터",
    item_code: "7-TR-0003",
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

describe("DefectHubPanel", () => {
  it("KPI 카드 4개를 렌더링한다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);

    await waitFor(() => {
      expect(screen.getByText("격리 중")).toBeInTheDocument();
      expect(screen.getByText("1년 이상 ⚠")).toBeInTheDocument();
      expect(screen.getByText("결재 대기")).toBeInTheDocument();
      expect(screen.getByText("오늘 처리")).toBeInTheDocument();
    });
  });

  it("KPI 카드 값이 올바르게 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={mockEmployee} />);

    await waitFor(() => {
      expect(screen.getByText("17")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("부서별 그룹핑이 정확하다 — 조립/진공 2개 부서 표시", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);

    // scope="all"이 초기값 (기타는 생산라인 아님)
    await waitFor(() => {
      expect(screen.getByText("조립")).toBeInTheDocument();
      expect(screen.getByText("진공")).toBeInTheDocument();
    });
  });

  it("400일 전 격리 항목에 ⚠1년 배지가 표시된다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);

    await waitFor(() => {
      // 진공부 게터 — 400일 전이라 1년 초과 배지 표시
      expect(screen.getByText("1년 초과")).toBeInTheDocument();
    });
  });

  it("200일 전 격리 항목에는 ⚠1년 배지가 없다", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);

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

    await waitFor(() => {
      // scope="my"이지만 defectDeptFilter="진공"이므로 진공 부서만 표시
      expect(screen.queryByText("조립")).not.toBeInTheDocument();
      expect(screen.getByText("진공")).toBeInTheDocument();
    });
  });

  it("[처리] 버튼 클릭 시 R 모달이 열린다 (R 품목)", async () => {
    render(<DefectHubPanel currentEmployee={{ ...mockEmployee, department: "기타" }} />);

    await waitFor(() => {
      expect(screen.getAllByText("처리").length).toBeGreaterThan(0);
    });

    // mockLocations 의 첫 항목 item_code="7-TR-0001" — PA/PF 아님 → R 모달 분기
    const processButtons = screen.getAllByText("처리");
    fireEvent.click(processButtons[0]);

    expect(await screen.findByTestId("r-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("papf-wizard")).not.toBeInTheDocument();
  });
});
