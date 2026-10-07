import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getStatisticsReport: vi.fn() }));
vi.mock("@/lib/api/defects", () => ({ defectsApi: api }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data: Array<{ label: string }> }) => <div data-testid="trend-chart" data-count={data.length} data-labels={data.map((entry) => entry.label).join(",")}>{children}</div>,
  Bar: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
import { DefectStatisticsView, shiftStatisticsAnchor } from "../DefectStatisticsView";

const item = (item_id: string, label: string, quantity: number, record_count = 1) =>
  ({ key: item_id, item_id, mes_code: `MES-${item_id}`, label, quantity, record_count });
const group = (key: string, quantity: number, record_count = 1) => ({ key, label: key, quantity, record_count });
const report = {
  period: { kind: "month" as const, anchor: "2026-10-06", start_date: "2026-10-01", end_date: "2026-10-31" },
  as_of: "2026-10-06T10:00:00+09:00", observed_until: "2026-10-06T10:00:00+09:00", is_partial: true,
  summary: { quantity: 10, record_count: 4, top_item: item("a", "A품목", 6), top_reason: group("외관", 5, 2) },
  timeline: [{ bucket: "2026-10-01", label: "1일", quantity: 3, record_count: 1 }],
  trend: [{ bucket: "2026-10", label: "10월", start_date: "2026-10-01", end_date: "2026-10-31", is_partial: true, quantity: 10, record_count: 4 }],
  items: [item("a", "A품목", 6, 2), item("b", "B품목", 3), item("c", "C품목", 1)],
  reasons: [group("외관", 5, 2), group("파손", 5, 2)],
  departments: [group("조립", 6, 2), group("품질", 4, 2)],
  excluded_legacy_count: 1,
  comparison: {
    period: { kind: "month" as const, anchor: "2026-09-06", start_date: "2026-09-01", end_date: "2026-09-30" },
    observed_until: "2026-09-06T10:00:00+09:00", is_partial: true, range_adjusted: false,
    summary: { quantity: 8, record_count: 3, top_item: item("d", "이전품목", 4), top_reason: group("외관", 3) },
    items: [item("a", "A품목", 4), item("d", "이전품목", 4)],
    reasons: [group("외관", 3)], departments: [group("조립", 8)], excluded_legacy_count: 2,
    quantity_delta: 2, quantity_change_pct: 25, record_count_delta: 1, record_count_change_pct: 33.3,
  },
};
const props = { departmentOptions: ["조립", "품질"], modelOptions: ["DX"], currentDepartment: "조립", onBack: vi.fn() };

describe("DefectStatisticsView report", () => {
  it("filters a managed reason by ID while showing its current name", async () => {
    const id = "94b714e1-82d2-41a0-81bc-471d5030d052";
    api.getStatisticsReport.mockResolvedValue({ ...report, reasons: [{ ...group(id, 10), label: "표면 균열" }] });
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: /사유 표면 균열/ }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ reason_category_id: id, reason: undefined })));
    expect(screen.getByRole("button", { name: "사유 표면 균열 ×" })).toBeInTheDocument();
  });
  beforeEach(() => {
    api.getStatisticsReport.mockReset().mockResolvedValue(report);
    window.sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-06T10:10:00+09:00"));
  });

  it("opens this month and all categories with compact collapsed filters", async () => {
    render(<DefectStatisticsView {...props} />);
    expect(api.getStatisticsReport).toHaveBeenCalledWith(expect.objectContaining({ period: "month", anchor: "2026-10-06", departments: [], models: [], process_steps: [] }));
    expect(await screen.findByText("10개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /분류 조건/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "다음 기간" })).toBeDisabled();
    expect(screen.getByText(/조회 2026/)).toBeInTheDocument();
  });

  it("keeps mobile KPI cards in one column below the desktop breakpoint", async () => {
    render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText("10개");
    const grid = screen.getByText("10개").closest("article")?.parentElement;
    expect(grid).toHaveClass("lg:grid-cols-2");
    expect(grid).not.toHaveClass("sm:grid-cols-2");
  });

  it("keeps a historical comparison department available in the expanded filter", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, comparison: { ...report.comparison, departments: [group("옛 부서", 8)] } });
    render(<DefectStatisticsView {...props} departmentOptions={[]} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: /분류 조건/ }));
    expect(within(screen.getByRole("group", { name: "부서 구분" })).getByRole("button", { name: "옛 부서" })).toBeInTheDocument();
  });

  it("shows quantities, deltas, tied reasons, concentration, and recent trend", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    expect(screen.getByText("4건 등록")).toBeInTheDocument();
    expect(screen.getAllByText(/\+2개/).length).toBeGreaterThan(0);
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getAllByText(/외관 · 파손/).length).toBeGreaterThan(0);
    expect(screen.getByText(/10개.*4건.*외관.*파손/)).toBeInTheDocument();
    expect(screen.getByText(/상위 3개 품목/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 추이" })).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-count", "1");
    expect(screen.getByText("최근 6개월 · 집계 중")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-labels", "10월 · 집계 중");
  });

  it("drills into a reason, department, and previous-only item, then clears them", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: /사유 외관/ }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "외관" })));
    fireEvent.click(screen.getByRole("button", { name: /부서 조립/ }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ departments: ["조립"] })));
    fireEvent.click(screen.getByRole("button", { name: /품목 이전품목/ }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ item_id: "d" })));
    expect(screen.getByText("이전품목")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /선택 품목 이전품목/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ departments: [], reason: undefined, item_id: undefined })));
  });

  it("expands report-only categories and follows period navigation", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: /분류 조건/ }));
    expect(screen.getByRole("button", { name: /분류 조건/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "DX" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ models: ["DX"] })));
    fireEvent.click(screen.getByRole("button", { name: "중간공정" }));
    expect(screen.getByRole("button", { name: "공정 중간공정 ×" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ anchor: "2026-09-06" })));
    expect(screen.getByRole("button", { name: "다음 기간" })).toBeEnabled();
  });

  it("never requests a future week after switching from a past week through the current month", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: "주간" }));
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "week", anchor: "2026-09-29" })));
    fireEvent.click(screen.getByRole("button", { name: "월간" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 기간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "month", anchor: "2026-10-29" })));
    fireEvent.click(screen.getByRole("button", { name: "주간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "week", anchor: "2026-10-06" })));
    expect(api.getStatisticsReport.mock.calls.filter(([query]) => query.period === "week").every(([query]) => query.anchor <= "2026-10-06")).toBe(true);
    expect(screen.getByRole("button", { name: "다음 기간" })).toBeDisabled();
  });

  it("clamps a restored mobile future week before the first request", async () => {
    window.sessionStorage.setItem("mes-defect-statistics-period", JSON.stringify("week"));
    window.sessionStorage.setItem("mes-defect-statistics-date", JSON.stringify("2026-10-29"));
    render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText("10개");
    expect(api.getStatisticsReport.mock.calls.every(([query]) => query.anchor === "2026-10-06")).toBe(true);
    expect(screen.getByRole("button", { name: "다음 기간" })).toBeDisabled();
  });

  it("does not present a future empty server response as actual zero defects", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, period: { kind: "week" as const, anchor: "2026-10-29", start_date: "2026-10-26", end_date: "2026-11-01" }, observed_until: null, comparison: null, trend: [], summary: { quantity: 0, record_count: 0, top_item: null, top_reason: null }, items: [], reasons: [], departments: [] });
    render(<DefectStatisticsView {...props} />);
    expect(await screen.findByText(/미래 기간은 아직 집계하지 않았습니다/)).toBeInTheDocument();
    expect(screen.queryByText("0개")).not.toBeInTheDocument();
  });

  it("treats the server's null observation cutoff as no actual result even at the client date boundary", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, observed_until: null, comparison: null, trend: [], summary: { quantity: 0, record_count: 0, top_item: null, top_reason: null }, items: [], reasons: [], departments: [] });
    render(<DefectStatisticsView {...props} />);
    expect(await screen.findByText(/미래 기간은 아직 집계하지 않았습니다/)).toBeInTheDocument();
    expect(screen.queryByText("0개")).not.toBeInTheDocument();
  });

  it("omits change percentage when comparison starts at zero and keeps zero empty state honest", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, summary: { record_count: 0, quantity: 0, top_item: null, top_reason: null }, items: [], reasons: [], departments: [], comparison: { ...report.comparison, summary: { record_count: 0, quantity: 0, top_item: null, top_reason: null }, quantity_change_pct: null, quantity_delta: 0 } });
    render(<DefectStatisticsView {...props} />);
    await screen.findAllByText("0개");
    expect(screen.getByText(/비율 산출 불가/)).toBeInTheDocument();
    expect(screen.getByText(/이전 수량 0개로 비율을 표시하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText("상위 0개 품목 집중도")).toBeInTheDocument();
    expect(screen.getAllByText("집계 결과가 없습니다.").length).toBeGreaterThan(0);
  });

  it("rounds comparison percentage and explains the same-time comparison beside the KPI", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, comparison: { ...report.comparison, quantity_change_pct: -78.61111111111111, quantity_delta: -283 } });
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    expect(screen.getByText(/-78\.6%/)).toBeInTheDocument();
    expect(screen.queryByText(/-78\.611111/)).not.toBeInTheDocument();
    expect(screen.getByText(/283개 적습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/-283개 적습니다/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/같은 시각까지 비교/).length).toBeGreaterThan(0);
  });

  it("hides prior values for both desktop and mobile while new filters load", async () => {
    for (const mobilePresentation of [false, true]) {
      const pending = new Promise(() => {});
      api.getStatisticsReport.mockResolvedValueOnce(report).mockReturnValueOnce(pending);
      const view = render(<DefectStatisticsView {...props} mobilePresentation={mobilePresentation} />);
      await screen.findByText("10개");
      fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
      expect(screen.queryByText("10개")).not.toBeInTheDocument();
      expect(screen.getByRole("status", { name: "불량 통계 불러오는 중" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps mobile report selections after returning to the work menu", async () => {
    const first = render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: "연간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "year" })));
    fireEvent.click(screen.getByRole("button", { name: /사유 외관/ }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "year", reason: "외관" })));
    first.unmount();
    render(<DefectStatisticsView {...props} mobilePresentation />);
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "year", reason: "외관" })));
    expect(screen.getByRole("button", { name: "연간" })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores an older response arriving after a newer period result", async () => {
    let resolveOld!: (value: typeof report) => void;
    api.getStatisticsReport.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ ...report, summary: { ...report.summary, quantity: 20 } });
    render(<DefectStatisticsView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    expect(await screen.findByText("20개")).toBeInTheDocument();
    await act(async () => { resolveOld(report); });
    expect(screen.getByText("20개")).toBeInTheDocument();
    expect(screen.queryByText("10개")).not.toBeInTheDocument();
  });

  it("does not show a cached period result while returning to that period", async () => {
    api.getStatisticsReport.mockResolvedValueOnce(report).mockReturnValue(new Promise(() => {}));
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    expect(screen.queryByText("10개")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 기간" }));
    expect(screen.queryByText("10개")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "불량 통계 불러오는 중" })).toBeInTheDocument();
  });

  it("filters future trend buckets and retains keyboard-accessible scroll panels", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, trend: [...report.trend, { ...report.trend[0], bucket: "2026-11", label: "11월", start_date: "2026-11-01", end_date: "2026-11-30", is_partial: false, quantity: 0 }] });
    render(<DefectStatisticsView {...props} />);
    await screen.findByText("10개");
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-count", "1");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["최근 추이", "품목 비교", "부서별 집계", "사유별 집계"]);
    for (const title of ["사유별 집계", "부서별 집계", "품목 비교"]) {
      const panel = screen.getByRole("region", { name: `${title} 스크롤 영역` });
      expect(panel).toHaveAttribute("tabindex", "0");
      expect(panel).toHaveAttribute("data-keep-scroll");
      expect(panel).not.toContainElement(screen.getByRole("heading", { name: title }));
    }
  });

  it("retries a failed request without showing empty zero statistics", async () => {
    api.getStatisticsReport.mockRejectedValueOnce(new Error("조회 실패"));
    render(<DefectStatisticsView {...props} />);
    expect(await screen.findByText(/조회 실패/)).toBeInTheDocument();
    expect(screen.queryByText("0개")).not.toBeInTheDocument();
    expect(screen.getByRole("alert").parentElement).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("10개")).toBeInTheDocument();
  });

  it("does not resurrect an old failure after changing periods and returning", async () => {
    api.getStatisticsReport.mockRejectedValueOnce(new Error("첫 요청 실패"));
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(/첫 요청 실패/);
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await screen.findByText("10개");
    fireEvent.click(screen.getByRole("button", { name: "다음 기간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("10개")).toBeInTheDocument();
    expect(screen.queryByText(/첫 요청 실패/)).not.toBeInTheDocument();
  });

  it("moves through short months and leap years without skipping a period", () => {
    expect(shiftStatisticsAnchor("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2024-02-29", "year", 1)).toBe("2025-02-28");
  });
});
