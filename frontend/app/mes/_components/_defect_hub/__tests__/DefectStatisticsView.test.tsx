import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({ getStatistics: vi.fn() }));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { getStatistics: apiMocks.getStatistics },
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="statistics-chart">{children}</div>,
  Bar: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { DefectStatisticsView, shiftStatisticsAnchor } from "../DefectStatisticsView";

const response = {
  period: {
    kind: "week" as const,
    anchor: "2026-09-04",
    start_date: "2026-08-31",
    end_date: "2026-09-06",
  },
  summary: {
    record_count: 3,
    quantity: 7,
    top_item: { key: "item-1", label: "방사구 필터", record_count: 2, quantity: 5, item_id: "item-1", mes_code: "8-VA-0018" },
    top_reason: { key: "외관 불량", label: "외관 불량", record_count: 2, quantity: 5 },
  },
  timeline: [
    { bucket: "2026-08-31", label: "월", record_count: 0, quantity: 0 },
    { bucket: "2026-09-01", label: "화", record_count: 3, quantity: 7 },
  ],
  items: [
    { key: "item-1", label: "방사구 필터", record_count: 2, quantity: 5, item_id: "item-1", mes_code: "8-VA-0018" },
  ],
  reasons: [{ key: "외관 불량", label: "외관 불량", record_count: 2, quantity: 5 }],
  departments: [{ key: "조립", label: "조립", record_count: 3, quantity: 7 }],
  excluded_legacy_count: 1,
};

describe("DefectStatisticsView", () => {
  beforeEach(() => {
    apiMocks.getStatistics.mockReset().mockResolvedValue(response);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-04T09:00:00+09:00"));
  });

  it("shows KST period summary, trend, rankings, and the excluded legacy notice", async () => {
    render(
      <DefectStatisticsView
        departmentOptions={["조립", "고압"]}
        modelOptions={["DX3000", "SOLO"]}
        currentDepartment="조립"
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findAllByText("방사구 필터")).toHaveLength(2);
    expect(screen.getByText("3건")).toBeInTheDocument();
    expect(screen.getByText("7개")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 부서" })).not.toBeInTheDocument();
    expect(screen.getByTestId("statistics-chart")).toBeInTheDocument();
    expect(screen.getAllByText("외관 불량")).toHaveLength(2);
    expect(screen.getAllByText("조립")).toHaveLength(2);
    expect(screen.getByText(/레거시 합산 기록 1건/)).toBeInTheDocument();
    expect(apiMocks.getStatistics).toHaveBeenCalledWith(expect.objectContaining({
      period: "week",
      anchor: "2026-09-04",
      departments: [],
      models: [],
      process_steps: [],
    }));
  });

  it("moves across short months and leap years without skipping a period", () => {
    expect(shiftStatisticsAnchor("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2024-02-29", "year", 1)).toBe("2025-02-28");
  });

  it("groups the displayed date with period navigation and current-period reset", async () => {
    render(<DefectStatisticsView departmentOptions={[]} modelOptions={[]} currentDepartment="조립" onBack={vi.fn()} />);
    const date = await screen.findByText("2026-08-31 ~ 2026-09-06");
    const controls = screen.getByRole("group", { name: "조회 기간" });
    expect(controls).toContainElement(date);
    for (const name of ["주간", "월간", "연간", "이전 기간", "다음 기간", "현재 기간"]) {
      expect(within(controls).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(controls).not.toContainElement(screen.getByRole("heading", { name: "불량 통계" }));
    fireEvent.click(within(controls).getByRole("button", { name: "이전 기간" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({ anchor: "2026-08-28" })));
    fireEvent.click(within(controls).getByRole("button", { name: "현재 기간" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({ anchor: "2026-09-04" })));
  });

  it.each([false, true])("keeps trend, reason, department, and item panels in reading order (empty: %s)", async (empty) => {
    if (empty) {
      apiMocks.getStatistics.mockResolvedValue({
        ...response,
        summary: { record_count: 0, quantity: 0, top_item: null, top_reason: null },
        items: [], reasons: [], departments: [],
      });
    }
    render(
      <DefectStatisticsView departmentOptions={[]} modelOptions={[]} currentDepartment="조립" onBack={vi.fn()} />,
    );

    await screen.findByRole("heading", { name: "기간별 불량 추이" });
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "기간별 불량 추이", "사유별 집계", "부서별 집계", "품목별 순위",
    ]);
  });

  it("keeps titles outside the keyboard-accessible scroll viewports", async () => {
    render(
      <DefectStatisticsView departmentOptions={[]} modelOptions={[]} currentDepartment="조립" onBack={vi.fn()} />,
    );

    await screen.findByRole("heading", { name: "기간별 불량 추이" });
    for (const title of ["사유별 집계", "부서별 집계", "품목별 순위"]) {
      const viewport = screen.getByRole("region", { name: `${title} 스크롤 영역` });
      expect(viewport).toHaveAttribute("tabindex", "0");
      expect(viewport).toHaveAttribute("data-keep-scroll");
      expect(viewport).toHaveClass("overscroll-y-auto");
      expect(viewport).not.toHaveClass("overscroll-contain");
      expect(viewport).toContainElement(screen.getByRole("list", { name: `${title} 목록` }));
      expect(viewport).not.toContainElement(screen.getByRole("heading", { name: title }));
    }
  });

  it("adds departments found only in historical statistics to the filter", async () => {
    render(
      <DefectStatisticsView
        departmentOptions={[]}
        modelOptions={[]}
        currentDepartment="조립"
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "조립" })).toBeInTheDocument();
  });

  it("changes period, anchor, and category filters without changing unrelated controls", async () => {
    render(
      <DefectStatisticsView
        departmentOptions={["조립", "고압"]}
        modelOptions={["DX3000", "SOLO"]}
        currentDepartment="조립"
        onBack={vi.fn()}
      />,
    );
    await screen.findAllByText("방사구 필터");

    fireEvent.click(screen.getByRole("button", { name: "연간" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({
      period: "year",
      anchor: "2026-09-04",
    })));

    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({
      period: "year",
      anchor: "2025-09-04",
    })));

    fireEvent.click(within(screen.getByRole("group", { name: "부서 구분" })).getByRole("button", { name: "조립" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000" }));
    fireEvent.click(screen.getByRole("button", { name: "중간공정" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({
      departments: ["조립"],
      models: ["DX3000"],
      process_steps: ["A"],
    })));

    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    await waitFor(() => expect(apiMocks.getStatistics).toHaveBeenLastCalledWith(expect.objectContaining({
      departments: [], models: [], process_steps: [],
    })));
  });

  it("shows a retryable error state", async () => {
    apiMocks.getStatistics
      .mockRejectedValueOnce(new Error("통계 조회 실패"))
      .mockResolvedValueOnce(response);
    render(
      <DefectStatisticsView
        departmentOptions={[]}
        modelOptions={[]}
        currentDepartment="조립"
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText("통계 조회 실패")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findAllByText("방사구 필터")).toHaveLength(2);
    expect(apiMocks.getStatistics).toHaveBeenCalledTimes(2);
  });
});
