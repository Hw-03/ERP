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
  excluded_category_count: 2,
  categories: [
    { key: "DEFECT", label: "불량", quantity: 6, record_count: 2 },
    { key: "B_GRADE", label: "B급", quantity: 3, record_count: 1 },
    { key: "OBSOLETE", label: "구형", quantity: 1, record_count: 1 },
  ],
  comparison: {
    period: { kind: "month" as const, anchor: "2026-09-06", start_date: "2026-09-01", end_date: "2026-09-30" },
    observed_until: "2026-09-06T10:00:00+09:00", is_partial: true, range_adjusted: false,
    summary: { quantity: 8, record_count: 3, top_item: item("d", "이전품목", 4), top_reason: group("외관", 3) },
    items: [item("a", "A품목", 4), item("d", "이전품목", 4)],
    reasons: [group("외관", 3)], departments: [group("조립", 8)], excluded_legacy_count: 2,
    excluded_category_count: 1,
    categories: [
      { key: "DEFECT", label: "불량", quantity: 4, record_count: 1 },
      { key: "B_GRADE", label: "B급", quantity: 4, record_count: 2 },
      { key: "OBSOLETE", label: "구형", quantity: 0, record_count: 0 },
    ],
    quantity_delta: 2, quantity_change_pct: 25, record_count_delta: 1, record_count_change_pct: 33.3,
  },
};
const props = { departmentOptions: ["조립", "품질"], modelOptions: ["DX"], currentDepartment: "조립", onBack: vi.fn() };
const manyEntriesReport = {
  ...report,
  summary: { ...report.summary, quantity: 130, record_count: 13 },
  items: Array.from({ length: 13 }, (_, index) => item(`item-${index + 1}`, `품목 ${index + 1}`, 10)),
  departments: Array.from({ length: 13 }, (_, index) => group(`부서 ${index + 1}`, 10)),
  reasons: Array.from({ length: 13 }, (_, index) => group(`사유 ${index + 1}`, 10)),
  comparison: { ...report.comparison, items: [item("item-1", "품목 1", 4), item("previous-only", "전기 전용 품목", 4)] },
};
const panelTitles = ["품목 비교", "부서별 집계", "사유별 집계"];

/** 숫자와 단위가 다른 요소에 있어도 사용자에게 읽히는 수량으로 찾는다. */
function quantityText(value: string): (_content: string, node: Element | null) => boolean {
  return (_content, node) => node?.textContent === value && Array.from(node.children).every((child) => child.textContent !== value);
}

function nextPages(): void {
  panelTitles.forEach((title) => fireEvent.click(screen.getByRole("button", { name: `${title} 다음 페이지` })));
}

describe("DefectStatisticsView report", () => {






  it("filters a managed reason by ID while showing its current name", async () => {
    const id = "94b714e1-82d2-41a0-81bc-471d5030d052";
    api.getStatisticsReport.mockResolvedValue({ ...report, reasons: [{ ...group(id, 10), label: "표면 균열" }] });
    render(<DefectStatisticsView {...props} />);
    await screen.findByRole("button", { name: "사유 표면 균열 선택" });
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

  it.each([false, true])("shows immutable initial categories and comparison without new filters (mobile %s)", async (mobilePresentation) => {
    render(<DefectStatisticsView {...props} mobilePresentation={mobilePresentation} />);
    if (!mobilePresentation) fireEvent.click(await screen.findByRole("button", { name: "이전 기간 상세" }));
    const categories = await screen.findByRole("table", { name: "최초 발생 분류별 집계" });
    const rows = within(categories).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "최초 분류발생 수량발생 건수이전 수량이전 건수",
      "불량6개2건4개1건", "B급3개1건4개2건", "구형1개1건0개0건",
    ]);
    if (!mobilePresentation) fireEvent.click(screen.getByRole("button", { name: "집계 기준" }));
    expect(screen.getByText(/원래 수량과 최초 발생 분류/)).toBeVisible();
    expect(screen.getByText(/최초 분류를 확인할 수 없는 기록.*현재 2건.*비교 기간 1건/)).toBeInTheDocument();
    expect(screen.queryByText(/B급·구형 제외/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "B급" })).not.toBeInTheDocument();
  });

  it("opens this month and all categories with compact collapsed filters", async () => {
    render(<DefectStatisticsView {...props} />);
    expect(api.getStatisticsReport).toHaveBeenCalledWith(expect.objectContaining({ period: "month", anchor: "2026-10-06", departments: [], models: [], process_steps: [] }));
    expect(await screen.findByText(quantityText("10개"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "다음 기간" })).toBeDisabled();
    expect(screen.queryByText(/조회 2026/)).not.toBeInTheDocument();
  });



  it("discloses comparison and collection details independently without hiding the exclusion notice", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    const comparison = screen.getByRole("button", { name: "이전 기간 상세" });
    const basis = screen.getByRole("button", { name: "집계 기준" });
    expect(comparison).toHaveAttribute("aria-expanded", "false");
    expect(basis).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table", { name: "최초 발생 분류별 집계" })).not.toBeInTheDocument();
    expect(screen.getByText("집계 제외 기록 있음")).toBeVisible();
    expect(within(screen.getByRole("group", { name: "발생 분류" })).getByText("불량")).toBeVisible();

    fireEvent.click(comparison);
    expect(comparison).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table", { name: "최초 발생 분류별 집계" })).toBeVisible();
    expect(basis).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(basis);
    expect(screen.getByText(/조회 2026/)).toBeVisible();
    expect(screen.getByText(/같은 시각까지 비교/)).toBeVisible();
    fireEvent.click(comparison);
    expect(screen.queryByRole("table", { name: "최초 발생 분류별 집계" })).not.toBeInTheDocument();
    expect(screen.getByText(/조회 2026/)).toBeVisible();
    expect(api.getStatisticsReport).toHaveBeenCalledTimes(1);
  });

  it("omits unavailable comparison and exclusion notices when neither applies", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, comparison: null, excluded_legacy_count: 0, excluded_category_count: 0 });
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    expect(screen.getByText("비교 없음")).toBeVisible();
    expect(screen.queryByRole("button", { name: "이전 기간 상세" })).not.toBeInTheDocument();
    expect(screen.queryByText("집계 제외 기록 있음")).not.toBeInTheDocument();
  });

  it("keeps mobile KPI cards in one column below the desktop breakpoint", async () => {
    render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText(quantityText("10개"));
    const grid = screen.getByText(quantityText("10개")).closest("article")?.parentElement;
    expect(grid).toHaveClass("lg:grid-cols-2");
    expect(grid).not.toHaveClass("sm:grid-cols-2");
  });

  it("keeps a historical comparison department available in the expanded filter", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, comparison: { ...report.comparison, departments: [group("옛 부서", 8)] } });
    render(<DefectStatisticsView {...props} departmentOptions={[]} />);
    await screen.findByText(quantityText("10개"));
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    expect(within(screen.getByRole("group", { name: "부서 구분" })).getByRole("button", { name: "옛 부서" })).toBeInTheDocument();
  });

  it("shows quantities, deltas, tied reasons, concentration, and recent trend", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    expect(screen.getByText("4건 등록")).toBeInTheDocument();
    expect(screen.getAllByText(/\+2개/).length).toBeGreaterThan(0);
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "사유 외관 선택" })).getByText("공동 1위")).toBeVisible();
    expect(within(screen.getByRole("button", { name: "사유 파손 선택" })).getByText("공동 1위")).toBeVisible();
    expect(screen.getByText(/상위 3개 품목/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 추이" })).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-count", "1");
    expect(screen.getByText("최근 6개월 · 집계 중")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-labels", "10월 · 집계 중");
  });

  it("drills into a reason, department, and previous-only item, then clears them", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    fireEvent.click(await screen.findByRole("button", { name: /사유 외관/ }));
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
    await screen.findByText(quantityText("10개"));
    fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    expect(screen.getByRole("button", { name: "필터 접기" })).toHaveAttribute("aria-expanded", "true");
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
    await screen.findByText(quantityText("10개"));
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
    await screen.findByText(quantityText("10개"));
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
    fireEvent.click(screen.getByRole("button", { name: "집계 기준" }));
    expect(screen.getByText(/이전 수량 0개로 비율을 표시하지 않습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/상위 0개 품목/)).not.toBeInTheDocument();
    expect(screen.getAllByText("집계 결과가 없습니다.").length).toBeGreaterThan(0);
  });

  it("rounds comparison percentage and discloses its exact same-time basis", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, comparison: { ...report.comparison, quantity_change_pct: -78.61111111111111, quantity_delta: -283 } });
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    expect(screen.getByText(/-78\.6%/)).toBeInTheDocument();
    expect(screen.queryByText(/-78\.611111/)).not.toBeInTheDocument();
    expect(screen.getByText(/-283개/)).toBeVisible();
    expect(screen.getByText("이전 달 같은 시점 대비")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "집계 기준" }));
    expect(screen.getAllByText(/같은 시각까지 비교/).length).toBeGreaterThan(0);
  });

  it("hides prior values for both desktop and mobile while new filters load", async () => {
    for (const mobilePresentation of [false, true]) {
      const pending = new Promise(() => {});
      api.getStatisticsReport.mockResolvedValueOnce(report).mockReturnValueOnce(pending);
      const view = render(<DefectStatisticsView {...props} mobilePresentation={mobilePresentation} />);
      await screen.findByText(quantityText("10개"));
      fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
      expect(screen.queryByText(quantityText("10개"))).not.toBeInTheDocument();
      expect(screen.getByRole("status", { name: "불량 통계 불러오는 중" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("keeps mobile report selections after returning to the work menu", async () => {
    const first = render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText(quantityText("10개"));
    fireEvent.click(screen.getByRole("button", { name: "연간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ period: "year" })));
    fireEvent.click(await screen.findByRole("button", { name: /사유 외관/ }));
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
    expect(await screen.findByText(quantityText("20개"))).toBeInTheDocument();
    await act(async () => { resolveOld(report); });
    expect(screen.getByText(quantityText("20개"))).toBeInTheDocument();
    expect(screen.queryByText(quantityText("10개"))).not.toBeInTheDocument();
  });

  it("does not show a cached period result while returning to that period", async () => {
    api.getStatisticsReport.mockResolvedValueOnce(report).mockReturnValue(new Promise(() => {}));
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    expect(screen.queryByText(quantityText("10개"))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 기간" }));
    expect(screen.queryByText(quantityText("10개"))).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "불량 통계 불러오는 중" })).toBeInTheDocument();
  });

  it("filters future trend buckets and retains keyboard-accessible scroll panels", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, trend: [...report.trend, { ...report.trend[0], bucket: "2026-11", label: "11월", start_date: "2026-11-01", end_date: "2026-11-30", is_partial: false, quantity: 0 }] });
    render(<DefectStatisticsView {...props} mobilePresentation />);
    await screen.findByText(quantityText("10개"));
    expect(screen.getByTestId("trend-chart")).toHaveAttribute("data-count", "1");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["최근 추이", "품목 비교", "부서별 집계", "사유별 집계"]);
    for (const title of ["사유별 집계", "부서별 집계", "품목 비교"]) {
      const panel = screen.getByRole("region", { name: `${title} 스크롤 영역` });
      expect(panel).toHaveAttribute("tabindex", "0");
      expect(panel).toHaveAttribute("data-keep-scroll");
      expect(panel).not.toContainElement(screen.getByRole("heading", { name: title }));
    }
  });

  it("pages desktop lists independently in sixes without refetching or changing full totals", async () => {
    api.getStatisticsReport.mockResolvedValue(manyEntriesReport);
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("130개"));
    expect(within(screen.getByRole("table", { name: "품목 비교 목록" })).getAllByRole("row")).toHaveLength(7);
    for (const title of ["부서별 집계", "사유별 집계"]) {
      expect(within(screen.getByRole("list", { name: `${title} 목록` })).getAllByRole("listitem")).toHaveLength(6);
    }
    expect(screen.getByLabelText("상위 3개 품목: 30개 / 전체 130개")).toBeVisible();
    expect(within(screen.getByRole("table", { name: "품목 비교 목록" })).getAllByText("8%")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "품목 비교 다음 페이지" }));
    expect(screen.getByRole("status", { name: "품목 비교 현재 페이지" })).toHaveTextContent("2 / 3");
    expect(screen.getByRole("status", { name: "부서별 집계 현재 페이지" })).toHaveTextContent("1 / 3");
    expect(screen.getByRole("button", { name: "품목 품목 7 선택" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "품목 품목 1 선택" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사유별 집계 다음 페이지" }));
    expect(screen.getByRole("button", { name: "사유 사유 7 선택" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "품목 비교 다음 페이지" }));
    const lastRows = within(screen.getByRole("table", { name: "품목 비교 목록" })).getAllByRole("row");
    expect(lastRows.slice(1).map((row) => within(row).getByRole("button").getAttribute("aria-label"))).toEqual(["품목 품목 13 선택", "품목 전기 전용 품목 선택"]);
    expect(lastRows[2]).toHaveTextContent("0개0건0%4개");
    expect(screen.getByRole("button", { name: "품목 비교 다음 페이지" })).toBeDisabled();
    expect(screen.getByLabelText("상위 3개 품목: 30개 / 전체 130개")).toBeVisible();
    expect(api.getStatisticsReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: /스크롤 영역/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "품목 비교 이전 페이지" }));
    expect(screen.getByRole("status", { name: "품목 비교 현재 페이지" })).toHaveTextContent("2 / 3");
  });

  it.each(["기간", "기준일", "부서", "모델", "공정", "사유", "품목"])("resets every page when the %s identity changes", async (condition) => {
    api.getStatisticsReport.mockResolvedValue(manyEntriesReport);
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("130개"));
    nextPages();
    if (["부서", "모델", "공정"].includes(condition)) fireEvent.click(screen.getByRole("button", { name: "필터 펼치기" }));
    const names: Record<string, string> = { 기간: "연간", 기준일: "이전 기간", 부서: "조립", 모델: "DX", 공정: "중간공정", 사유: "사유 사유 7 선택", 품목: "품목 품목 7 선택" };
    fireEvent.click(screen.getByRole("button", { name: names[condition], exact: true }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenCalledTimes(2));
    for (const title of panelTitles) expect(await screen.findByRole("status", { name: `${title} 현재 페이지` })).toHaveTextContent("1 / 3");
  });



  it("retains pages through refresh loading and clamps only after a successful smaller response", async () => {
    let completeRefresh!: (value: typeof manyEntriesReport) => void;
    api.getStatisticsReport.mockResolvedValueOnce(manyEntriesReport).mockImplementation(() => new Promise((resolve) => { completeRefresh = resolve; }));
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("130개"));
    nextPages(); nextPages();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(screen.getByRole("status", { name: "불량 통계 불러오는 중" })).toBeInTheDocument();
    await act(async () => { completeRefresh(manyEntriesReport); });
    for (const title of panelTitles) expect(screen.getByRole("status", { name: `${title} 현재 페이지` })).toHaveTextContent("3 / 3");
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await act(async () => { completeRefresh({ ...manyEntriesReport, items: manyEntriesReport.items.slice(0, 7), comparison: { ...manyEntriesReport.comparison, items: [] }, reasons: manyEntriesReport.reasons.slice(0, 3), departments: manyEntriesReport.departments.slice(0, 3) }); });
    expect(screen.getByRole("status", { name: "품목 비교 현재 페이지" })).toHaveTextContent("2 / 2");
    for (const title of ["부서별 집계", "사유별 집계"]) expect(screen.getByRole("status", { name: `${title} 현재 페이지` })).toHaveTextContent("1 / 1");
    expect(screen.getByRole("button", { name: "품목 품목 7 선택" })).toBeInTheDocument();
  });

  it("ignores a refreshed old response and its page counts after a filter change", async () => {
    let completeOld!: (value: typeof manyEntriesReport) => void;
    api.getStatisticsReport.mockResolvedValueOnce(manyEntriesReport).mockReturnValueOnce(new Promise((resolve) => { completeOld = resolve; })).mockResolvedValue(report);
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("130개"));
    nextPages(); nextPages();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await screen.findByText(quantityText("10개"));
    await act(async () => { completeOld(manyEntriesReport); });
    for (const title of panelTitles) expect(screen.getByRole("status", { name: `${title} 현재 페이지` })).toHaveTextContent("1 / 1");
    expect(screen.queryByRole("button", { name: "품목 품목 13 선택" })).not.toBeInTheDocument();
  });

  it("shows full labels through keyboard focus and hover without adding extra tab stops", async () => {
    const label = "아주 긴 전체 이름이 두 줄을 넘어가는 품목 부서 사유 상세 설명";
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, items: [item("long", label, 10)], comparison: { ...report.comparison, items: [] }, departments: [{ ...group("long-dept", 10), label }], reasons: [{ ...group("long-reason", 10), label }] });
    render(<DefectStatisticsView {...props} />);
    await screen.findByRole("button", { name: `품목 ${label} 선택` });
    for (const prefix of ["품목", "부서", "사유"]) {
      const button = screen.getByRole("button", { name: `${prefix} ${label} 선택` });
      const name = within(button).getByText(label, { exact: true });
      Object.defineProperties(name, { clientHeight: { configurable: true, value: 44 }, scrollHeight: { configurable: true, value: 66 } });
      fireEvent(window, new Event("resize"));
      fireEvent.focus(button);
      expect(screen.getByRole("tooltip")).toHaveTextContent(label);
      expect(button.parentElement).not.toHaveAttribute("tabindex");
      fireEvent.blur(button);
      fireEvent.mouseEnter(button.parentElement!);
      expect(screen.getByRole("tooltip")).toHaveTextContent(label);
      fireEvent.mouseLeave(button.parentElement!);
    }
  });

  it.each([["품목", "A품목"], ["부서", "조립"], ["사유", "외관"]])("omits the %s tooltip when the name fits, including after widening the label", async (prefix, name) => {
    render(<DefectStatisticsView {...props} />);
    const button = await screen.findByRole("button", { name: `${prefix} ${name} 선택` });
    const label = within(button).getByText(name, { exact: true });
    const trigger = button.parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    Object.defineProperties(label, { clientWidth: { configurable: true, value: 60 }, scrollWidth: { configurable: true, value: 120 } });
    fireEvent(window, new Event("resize"));
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent(name);
    Object.defineProperty(label, "clientWidth", { configurable: true, value: 120 });
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps all mobile rows scrollable and omits pagination", async () => {
    api.getStatisticsReport.mockResolvedValueOnce(manyEntriesReport);
    render(<DefectStatisticsView {...props} mobilePresentation />);
    expect(await screen.findByRole("button", { name: "품목 전기 전용 품목 선택" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "사유별 집계 목록" })).getAllByRole("listitem")).toHaveLength(13);
    expect(screen.getAllByRole("region", { name: /스크롤 영역/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /다음 페이지/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "분류 조건 펼치기" })).toBeInTheDocument();
  });

  it("shows empty desktop lists without zero-page pagination", async () => {
    api.getStatisticsReport.mockResolvedValueOnce({ ...report, items: [], departments: [], reasons: [], comparison: null, summary: { quantity: 0, record_count: 0, top_item: null, top_reason: null } });
    render(<DefectStatisticsView {...props} />);
    expect(await screen.findAllByText("집계 결과가 없습니다.")).toHaveLength(3);
    expect(screen.queryByRole("navigation", { name: /페이지/ })).not.toBeInTheDocument();
    expect(screen.queryByText("0 / 0")).not.toBeInTheDocument();
  });

  it("opens filters below the overview from its footer and keeps selected chips visible when collapsed", async () => {
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(quantityText("10개"));
    const overview = screen.getByRole("region", { name: "발생 현황" });
    fireEvent.click(within(overview).getByRole("button", { name: "필터 펼치기" }));
    const filters = document.getElementById("statistics-category-filters")!;
    expect(filters).toBeVisible();
    expect(overview).not.toContainElement(filters);
    expect(overview.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "DX", exact: true }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "필터 접기" }));
    expect(within(overview).getByRole("button", { name: "모델 DX ×" })).toBeVisible();
    expect(screen.getByRole("button", { name: "전체 초기화" })).toBeVisible();
    expect(screen.getByRole("button", { name: "이전 기간" })).toBeVisible();
    expect(screen.getByRole("button", { name: "필터 펼치기" })).toHaveAttribute("aria-controls", "statistics-category-filters");
    fireEvent.click(screen.getByRole("button", { name: "모델 DX ×" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenLastCalledWith(expect.objectContaining({ models: [] })));
  });

  it("retries a failed request without showing empty zero statistics", async () => {
    api.getStatisticsReport.mockRejectedValueOnce(new Error("조회 실패"));
    render(<DefectStatisticsView {...props} />);
    expect(await screen.findByText(/조회 실패/)).toBeInTheDocument();
    expect(screen.queryByText("0개")).not.toBeInTheDocument();
    expect(screen.getByRole("alert").parentElement).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(quantityText("10개"))).toBeInTheDocument();
  });

  it("does not resurrect an old failure after changing periods and returning", async () => {
    api.getStatisticsReport.mockRejectedValueOnce(new Error("첫 요청 실패"));
    render(<DefectStatisticsView {...props} />);
    await screen.findByText(/첫 요청 실패/);
    fireEvent.click(screen.getByRole("button", { name: "이전 기간" }));
    await screen.findByText(quantityText("10개"));
    fireEvent.click(screen.getByRole("button", { name: "다음 기간" }));
    await waitFor(() => expect(api.getStatisticsReport).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(quantityText("10개"))).toBeInTheDocument();
    expect(screen.queryByText(/첫 요청 실패/)).not.toBeInTheDocument();
  });

  it("moves through short months and leap years without skipping a period", () => {
    expect(shiftStatisticsAnchor("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(shiftStatisticsAnchor("2024-02-29", "year", 1)).toBe("2025-02-28");
  });
});
