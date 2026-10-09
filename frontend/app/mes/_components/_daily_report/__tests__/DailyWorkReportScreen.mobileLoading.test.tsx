import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dailyWorkReportsApi } from "@/lib/api/daily-work-reports";
import { queryKeys } from "@/lib/queries/keys";
import { DailyWorkReportScreen } from "../DailyWorkReportScreen";
import { toKstDateKey } from "../dailyReportDate";

vi.mock("@/lib/api/daily-work-reports", () => ({ dailyWorkReportsApi: { list: vi.fn(), get: vi.fn(), activity: vi.fn(), save: vi.fn() } }));
vi.mock("@/lib/ui/dirty-guard", () => ({ useRegisterDirty: vi.fn() }));

const author = { report_id: "report-1", work_date: toKstDateKey(), employee_id: "employee-2", employee_name: "김작성", department: "조립", content: "확인된 작업", created_at: "2026-09-29T00:00:00Z", updated_at: "2026-09-29T00:00:00Z" };

function renderMobile(mobile = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(<QueryClientProvider client={client}><DailyWorkReportScreen employeeId="employee-1" mobile={mobile} /></QueryClientProvider>);
  return { client, ...view };
}

beforeEach(() => {
  vi.mocked(dailyWorkReportsApi.list).mockReset().mockResolvedValue([author]);
  vi.mocked(dailyWorkReportsApi.get).mockReset().mockResolvedValue(author);
  vi.mocked(dailyWorkReportsApi.activity).mockReset().mockResolvedValue({ work_date: toKstDateKey(), employee_id: "employee-2", summary: [], cancelled_count: 0, details: [] });
});

describe("모바일 일보 실제 QueryClient 로딩 계약", () => {
  it("PC 최초 placeholder는 빈 작성자 성공으로 표시하지 않는다", async () => {
    vi.mocked(dailyWorkReportsApi.list).mockReturnValue(new Promise(() => {}));
    const { client } = renderMobile(false);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    expect(screen.getByRole("status", { name: "작성자 목록 불러오는 중" })).toBeInTheDocument();
    expect(screen.queryByText("작성된 일보가 없습니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("0명", { exact: true })).not.toBeInTheDocument();
    client.clear();
  });
  it("미조회 날짜에서는 작성자 칩 크기와 목록 높이를 유지하고 완료 후 해제한다", async () => {
    vi.mocked(dailyWorkReportsApi.list).mockResolvedValue(Array.from({ length: 13 }, (_, index) => ({ ...author, employee_id: `employee-${index}`, employee_name: `김작성${index}` })));
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    const authorButtons = await screen.findAllByRole("button", { name: /김작성/ });
    const chips = screen.getByTestId("daily-work-report-author-chips");
    vi.spyOn(chips, "getBoundingClientRect").mockReturnValue({ width: 370, height: 252 } as DOMRect);
    authorButtons.forEach((chip) => vi.spyOn(chip, "getBoundingClientRect").mockReturnValue({ width: 89, height: 44 } as DOMRect));
    let finish!: (value: typeof author[]) => void;
    vi.mocked(dailyWorkReportsApi.list).mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    fireEvent.click(screen.getByRole("button", { name: "전일" }));
    const loading = screen.getByRole("status", { name: "작성자 목록 불러오는 중" });
    expect(chips).toHaveStyle({ minHeight: "252px" });
    expect(loading.querySelectorAll("[aria-hidden=true]")).toHaveLength(authorButtons.length);
    expect(loading.querySelector("[aria-hidden=true]")).toHaveStyle({ width: "89px", height: "44px" });
    expect(loading.querySelector(".motion-safe\\:animate-pulse")).toBeNull();
    expect(screen.queryByRole("button", { name: /김작성/ })).not.toBeInTheDocument();
    expect(screen.getByText("작성한 직원을 선택하세요.")).toBeInTheDocument();

    await act(async () => { finish([]); });
    expect(await screen.findByText("작성된 일보가 없습니다.")).toBeInTheDocument();
    expect(chips.style.minHeight).toBe("");
    client.clear();
  });

  it("새 날짜를 조회할 때 선택한 직원의 본문을 선택 안내로 바꾸거나 통째로 페이드하지 않는다", async () => {
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(await screen.findByRole("button", { name: /김작성/ }));
    expect(await screen.findByText("확인된 작업")).toBeInTheDocument();
    expect(screen.getByTestId("daily-work-report-result").className).not.toContain("reveal");
    vi.mocked(dailyWorkReportsApi.list).mockReturnValue(new Promise(() => {}));
    vi.mocked(dailyWorkReportsApi.get).mockReturnValue(new Promise(() => {}));
    vi.mocked(dailyWorkReportsApi.activity).mockReturnValue(new Promise(() => {}));
    // 최초 날짜 변경 렌더도 기록해서 선택 복원 effect 전의 안내 깜빡임을 검출한다.
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => mutations.push(node.textContent ?? "")));
    });
    observer.observe(screen.getByTestId("daily-work-report-result").parentElement!, { childList: true, subtree: true });
    fireEvent.click(screen.getByRole("button", { name: "전일" }));
    await act(async () => {});
    observer.disconnect();
    expect(mutations.some((text) => text.includes("작성한 직원을 선택하세요."))).toBe(false);
    expect(screen.getByTestId("daily-work-report-result").className).not.toContain("reveal");
    expect(screen.queryByText("확인된 작업")).not.toBeInTheDocument();
    client.clear();
  });

  it("성공한 빈 작성자 목록은 같은 날짜 갱신 실패에도 유지한다", async () => {
    vi.mocked(dailyWorkReportsApi.list).mockResolvedValue([]);
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    expect(await screen.findByText("작성된 일보가 없습니다.")).toBeInTheDocument();
    vi.mocked(dailyWorkReportsApi.list).mockRejectedValue(new Error("refresh failed"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.dailyWorkReports.list(toKstDateKey()) }); });
    expect(await screen.findByText("작성자 목록을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByText("작성된 일보가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText("0명")).toBeInTheDocument();
    client.clear();
  });
  it.each([true, false])("작성자 최초 실패를 다시 시도해 같은 날짜 목록을 복구한다 mobile=%s", async (mobile) => {
    vi.mocked(dailyWorkReportsApi.list).mockRejectedValueOnce(new Error("initial failed"));
    const { client } = renderMobile(mobile);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    const alert = await screen.findByText("작성자 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("0명")).not.toBeInTheDocument();
    expect(screen.getByText("—명")).toBeInTheDocument();
    fireEvent.click(within(alert.closest("[role=alert]")!).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: /김작성/ })).toBeInTheDocument();
    expect(dailyWorkReportsApi.list).toHaveBeenCalledTimes(2);
    client.clear();
  });

  it.each([true, false])("일보와 MES 최초 실패는 각각 해당 조회를 다시 시도한다 mobile=%s", async (mobile) => {
    vi.mocked(dailyWorkReportsApi.get).mockRejectedValue(new Error("initial failed"));
    vi.mocked(dailyWorkReportsApi.activity).mockRejectedValue(new Error("initial failed"));
    const { client } = renderMobile(mobile);
    const reportAlert = await screen.findByText("일보를 불러오지 못했습니다.");
    const activityAlert = await screen.findByText("MES 거래를 불러오지 못했습니다.");
    vi.mocked(dailyWorkReportsApi.get).mockResolvedValue(author);
    vi.mocked(dailyWorkReportsApi.activity).mockResolvedValue({ work_date: toKstDateKey(), employee_id: "employee-1", summary: [], cancelled_count: 0, details: [] });
    fireEvent.click(within(reportAlert.closest("[role=alert]")!).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.queryByText("일보를 불러오지 못했습니다.")).not.toBeInTheDocument());
    expect(screen.getByText("MES 거래를 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(within(activityAlert.closest("[role=alert]")!).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(mobile ? "작업 기록이 없습니다." : "완료된 MES 거래가 생기면 작업 종류와 수량이 이곳에 자동으로 나타납니다.")).toBeInTheDocument();
    expect(screen.queryByText("MES 거래를 불러오지 못했습니다.")).not.toBeInTheDocument();
    client.clear();
  });
  it("placeholderData가 있어도 최초 작성자 조회 중 0명과 미작성 상태를 숨긴다", () => {
    vi.mocked(dailyWorkReportsApi.list).mockReturnValue(new Promise(() => {}));
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    expect(screen.getByRole("status", { name: "작성자 목록 불러오는 중" })).toBeInTheDocument();
    expect(screen.queryByText("0명")).not.toBeInTheDocument();
    expect(screen.queryByText("작성된 일보가 없습니다.")).not.toBeInTheDocument();
    client.clear();
  });

  it("같은 날짜의 작성자와 MES 기록은 재조회 실패에도 유지한다", async () => {
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(await screen.findByRole("button", { name: /김작성/ }));
    expect(await screen.findByText("작업 기록이 없습니다.")).toBeInTheDocument();
    vi.mocked(dailyWorkReportsApi.list).mockRejectedValue(new Error("refresh failed"));
    vi.mocked(dailyWorkReportsApi.activity).mockRejectedValue(new Error("refresh failed"));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.dailyWorkReports.all }); });
    await waitFor(() => expect(screen.getByText("작성자 목록을 불러오지 못했습니다.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /김작성/ })).toBeInTheDocument();
    expect(screen.getByText("MES 거래를 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByText("작업 기록이 없습니다.")).toBeInTheDocument();
    client.clear();
  });

  it("새 날짜 조회 중 이전 작성자와 작업 내용이 나타나지 않는다", async () => {
    const { client } = renderMobile();
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(await screen.findByRole("button", { name: /김작성/ }));
    expect(await screen.findByText("확인된 작업")).toBeInTheDocument();
    vi.mocked(dailyWorkReportsApi.list).mockReturnValue(new Promise(() => {}));
    vi.mocked(dailyWorkReportsApi.get).mockReturnValue(new Promise(() => {}));
    vi.mocked(dailyWorkReportsApi.activity).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "전일" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "작성자 목록 불러오는 중" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /김작성/ })).not.toBeInTheDocument();
    expect(screen.queryByText("확인된 작업")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "작업 내역 불러오는 중" })).toBeInTheDocument();
    client.clear();
  });
});
