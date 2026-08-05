import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyWorkReportScreen } from "../DailyWorkReportScreen";

const { registerDirtyMock } = vi.hoisted(() => ({ registerDirtyMock: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const queryState = {
  report: { data: null as { employee_name: string; department: string; content: string } | null, isError: false },
  selectedReport: { data: null as { employee_name: string; department: string; content: string } | null, isError: false },
  reports: [] as Array<{ employee_id: string; employee_name: string; department: string }>,
  activity: { data: { work_date: "2026-08-03", employee_id: "employee-1", summary: [], cancelled_count: 0, details: [] }, isError: false },
  saveMutation: { isPending: false, mutateAsync: vi.fn() },
};

vi.mock("@/lib/queries/useDailyWorkReportsQuery", () => ({
  useDailyWorkReportQuery: (employeeId: string | null | undefined) => employeeId === "employee-2" ? queryState.selectedReport : queryState.report,
  useDailyWorkReportsQuery: () => ({ data: queryState.reports, isError: false }),
  useDailyWorkActivityQuery: () => queryState.activity,
  useSaveDailyWorkReport: () => queryState.saveMutation,
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  useRegisterDirty: registerDirtyMock,
}));

describe("DailyWorkReportScreen", () => {
  beforeEach(() => {
    queryState.report = { data: null, isError: false };
    queryState.selectedReport = { data: null, isError: false };
    queryState.reports = [];
    queryState.activity = { data: { work_date: "2026-08-03", employee_id: "employee-1", summary: [], cancelled_count: 0, details: [] }, isError: false };
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn() };
    registerDirtyMock.mockClear();
  });

  it("미작성 본인 일보에도 로그인 작업자의 부서와 작성자를 보여 준다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "생산부 조립파트" } as never}
      />,
    );

    expect(screen.getByText("부서")).toBeInTheDocument();
    expect(screen.getByText("생산부 조립파트")).toBeInTheDocument();
    expect(screen.getByText("작성자")).toBeInTheDocument();
    expect(screen.getByText("김현우")).toBeInTheDocument();
  });

  it("저장된 일보는 당시의 작성자와 부서 스냅샷을 보여 준다", () => {
    queryState.report = {
      data: { employee_name: "이전 작성자", department: "이전 부서", content: "기존 작업" },
      isError: false,
    };

    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "현재 작성자", department: "현재 부서" } as never}
      />,
    );

    expect(screen.getByText("이전 작성자")).toBeInTheDocument();
    expect(screen.getByText("이전 부서")).toBeInTheDocument();
    expect(screen.queryByText("현재 작성자")).not.toBeInTheDocument();
  });

  it("전체 일보에서 다른 직원의 스냅샷과 작업 내역을 읽기 전용으로 보여 준다", () => {
    queryState.reports = [{ employee_id: "employee-2", employee_name: "다른 작성자", department: "다른 부서" }];
    queryState.selectedReport = {
      data: { employee_name: "당시 작성자", department: "당시 부서", content: "다른 직원 작업 내역" },
      isError: false,
    };

    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "현재 작성자", department: "현재 부서" } as never}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("button", { name: /다른 작성자/ }));

    expect(screen.getByText("당시 작성자")).toBeInTheDocument();
    expect(screen.getByText("당시 부서")).toBeInTheDocument();
    expect(screen.getByText("다른 직원 작업 내역")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "작업 내역" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("전체 일보의 장문 읽기 전용 작업 내역은 데스크톱 카드 내부에서 스크롤한다", () => {
    const content = "다른 직원의 긴 작업 내역 ".repeat(500);
    queryState.reports = [{ employee_id: "employee-2", employee_name: "다른 작성자", department: "조립" }];
    queryState.selectedReport = { data: { employee_name: "다른 작성자", department: "조립", content }, isError: false };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 작성자 조립" }));

    const readonlyContent = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === content);
    expect(readonlyContent).toHaveClass("lg:max-h-72", "lg:overflow-y-auto");
    expect(readonlyContent.closest("section")).not.toHaveClass("lg:flex-1");
  });

  it("전체 일보의 큰 읽기 전용 카드 묶음은 데스크톱 내부 스크롤 영역에서 접근한다", () => {
    const content = "다른 직원의 긴 작업 내역 ".repeat(500);
    queryState.reports = Array.from({ length: 12 }, (_, index) => ({
      employee_id: `employee-${index + 2}`,
      employee_name: `작성자 ${index + 1}`,
      department: "조립",
    }));
    queryState.selectedReport = { data: { employee_name: "작성자 1", department: "조립", content }, isError: false };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("button", { name: "작성자 1 조립" }));

    const readonlyContent = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === content);
    const targetWrapper = readonlyContent.closest("section")?.parentElement;
    const outer = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header")?.parentElement?.parentElement;
    expect(targetWrapper).toHaveClass("lg:min-h-0", "lg:flex-1", "lg:overflow-y-auto");
    expect(readonlyContent.closest("section")).not.toHaveClass("lg:flex-1");
    expect(outer).toHaveClass("lg:overflow-hidden");
    expect(outer).not.toHaveClass("lg:overflow-y-auto");
  });

  it("전체 일보의 읽기 전용 MES 상세는 일보 본문 스크롤로 확인한다", () => {
    queryState.reports = [{ employee_id: "employee-2", employee_name: "다른 작성자", department: "조립" }];
    queryState.selectedReport = {
      data: { employee_name: "다른 작성자", department: "조립", content: "다른 작업 내역" },
      isError: false,
    };
    queryState.activity = {
      data: {
        work_date: "2026-08-03",
        employee_id: "employee-2",
        cancelled_count: 0,
        summary: [{ operation_key: "warehouse", operation_label: "창고", work_count: 1, quantity_by_unit: { EA: 1 } }],
        details: [{ type: "solo", key: "log-1", logs: [] }],
      } as never,
      isError: false,
    };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 작성자 조립" }));
    fireEvent.click(screen.getByRole("button", { name: "창고 거래 상세 펼치기" }));

    expect(screen.getByTestId("daily-work-activity-details")).not.toHaveClass("lg:max-h-56", "lg:overflow-y-auto");
    expect(screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header")?.parentElement).toHaveClass("lg:overflow-y-auto");
    expect(screen.queryByRole("textbox", { name: "작업 내역" })).not.toBeInTheDocument();
  });

  it("전체 일보 작성자 버튼을 공정 순서로 보여 준다", () => {
    queryState.reports = [
      { employee_id: "employee-1", employee_name: "조립 직원", department: "조립" },
      { employee_id: "employee-2", employee_name: "고압 직원", department: "고압" },
      { employee_id: "employee-3", employee_name: "출하 직원", department: "출하" },
      { employee_id: "employee-4", employee_name: "튜브 직원", department: "튜브" },
      { employee_id: "employee-5", employee_name: "진공 직원", department: "진공" },
      { employee_id: "employee-6", employee_name: "튜닝 직원", department: "튜닝" },
    ];

    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "현재 작성자", department: "조립" } as never}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    const chips = ["튜브 직원 튜브", "고압 직원 고압", "진공 직원 진공", "튜닝 직원 튜닝", "조립 직원 조립", "출하 직원 출하"]
      .map((name) => screen.getByRole("button", { name }));

    for (let index = 0; index < chips.length - 1; index += 1) {
      expect(chips[index].compareDocumentPosition(chips[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it("헤더를 한 줄 정보행으로 보이고 MES 거래 요약을 작업 내역보다 먼저 배치한다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    expect(screen.queryByText("DAILY WORK REPORT")).not.toBeInTheDocument();
    expect(screen.queryByText("하루의 작업 내역과 실제 MES 거래를 함께 확인합니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "일일 작업 일보" }).parentElement).toHaveClass("flex", "items-center");

    const activity = screen.getByRole("region", { name: "MES 작업 기록" });
    const editor = screen.getByRole("textbox", { name: "작업 내역" });
    expect(activity.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("데스크톱에서는 다른 탭과 같은 좌측 시작선을 사용한다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const header = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header");
    expect(header?.parentElement?.parentElement).toHaveClass("lg:px-0", "lg:pr-4");
  });
  it("네이티브 날짜 입력 대신 일보 날짜 달력을 연다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "일보 날짜 선택" }));
    expect(screen.getByRole("dialog", { name: "일보 날짜 선택" })).toBeInTheDocument();
  });

  it("데스크톱에서는 작업 내역이 본문을 채우는 628px 높이를 유지한다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "작업 내역" }).closest("section");
    expect(editor).toHaveClass("lg:h-[628px]", "lg:flex-none");
    expect(editor).not.toHaveClass("lg:flex-1");
  });

  it("작성한 직원 칩은 데스크톱에서 카드 내부 스크롤 경계를 둔다", () => {
    queryState.reports = Array.from({ length: 12 }, (_, index) => ({
      employee_id: `employee-${index + 2}`,
      employee_name: `직원 ${index + 1}`,
      department: "조립",
    }));

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));

    expect(screen.getByTestId("daily-work-report-author-chips")).toHaveClass("lg:max-h-36", "lg:overflow-y-auto");
  });

  it("데스크톱 전체 일보는 MES 상세 확장 시 본문에서 스크롤한다", () => {
    queryState.reports = [{ employee_id: "employee-2", employee_name: "다른 작성자", department: "조립" }];

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);

    const header = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header");
    const activity = screen.getByRole("region", { name: "MES 작업 기록" });
    expect(header?.parentElement).toHaveClass("lg:overflow-y-auto");
    expect(header?.parentElement).not.toHaveClass("lg:overflow-hidden");
    expect(header).toHaveClass("lg:shrink-0");
    expect(activity).toHaveClass("lg:shrink-0");

    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    expect(screen.getByTestId("daily-work-report-author-chips").closest("section")).toHaveClass("lg:shrink-0");
  });

  it("실패한 저장 오류는 날짜·탭·작성자 대상 변경 뒤에 남지 않는다", async () => {
    queryState.report = { data: { employee_name: "김현우", department: "조립", content: "기존 내용" }, isError: false };
    queryState.selectedReport = { data: { employee_name: "다른 작성자", department: "조립", content: "다른 내용" }, isError: false };
    queryState.reports = [
      { employee_id: "employee-1", employee_name: "김현우", department: "조립" },
      { employee_id: "employee-2", employee_name: "다른 작성자", department: "조립" },
    ];
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn().mockRejectedValue(new Error("저장 실패")) };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} confirmNavigation={(proceed) => proceed()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "실패할 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();

    const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {});
    const previousDay = new Date(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day) - 1);
    const previousDayLabel = `${previousDay.getFullYear()}년 ${previousDay.getMonth() + 1}월 ${previousDay.getDate()}일`;
    fireEvent.click(screen.getByRole("button", { name: "일보 날짜 선택" }));
    fireEvent.click(screen.getByRole("button", { name: previousDayLabel }));
    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("button", { name: "김현우 조립" }));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "다시 실패할 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "다른 작성자 조립" }));
    fireEvent.click(screen.getByRole("button", { name: "김현우 조립" }));
    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "탭 전환 전 실패" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "내 일보" }));
    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장 실패 뒤 입력을 수정하면 Screen 오류와 실패 상태를 함께 지운다", async () => {
    queryState.report = { data: { employee_name: "김현우", department: "조립", content: "기존 내용" }, isError: false };
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn().mockRejectedValue(new Error("저장 실패")) };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "실패할 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "수정한 내용" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("저장 필요")).toBeInTheDocument();
  });

  it("대상이 바뀐 뒤 이전 저장 실패 응답은 Screen 오류 상태를 갱신하지 않는다", async () => {
    const pending = deferred<never>();
    queryState.report = { data: { employee_name: "김현우", department: "조립", content: "기존 내용" }, isError: false };
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn().mockReturnValue(pending.promise) };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} confirmNavigation={(proceed) => proceed()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "저장 요청 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));
    fireEvent.click(screen.getByRole("tab", { name: "내 일보" }));

    await act(async () => { pending.reject(new Error("저장 실패")); });

    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장 중 다시 입력한 뒤 이전 실패 응답은 Screen 상태를 갱신하지 않는다", async () => {
    const pending = deferred<never>();
    queryState.report = { data: { employee_name: "김현우", department: "조립", content: "기존 내용" }, isError: false };
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn().mockReturnValue(pending.promise) };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "저장 요청 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.change(input, { target: { value: "저장 중 수정한 내용" } });

    await act(async () => { pending.reject(new Error("저장 실패")); });

    expect(input).toHaveValue("저장 중 수정한 내용");
    expect(screen.getByText("저장 필요")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const dirtyValues = registerDirtyMock.mock.calls.map((args) => args[1]);
    expect(dirtyValues.slice(dirtyValues.indexOf(true) + 1)).not.toContain(false);
  });

  it("저장 중 다시 입력한 뒤 이전 성공 응답은 Screen dirty 상태를 갱신하지 않는다", async () => {
    const pending = deferred<{ updated_at: string }>();
    queryState.report = { data: { employee_name: "김현우", department: "조립", content: "기존 내용" }, isError: false };
    queryState.saveMutation = { isPending: false, mutateAsync: vi.fn().mockReturnValue(pending.promise) };

    render(<DailyWorkReportScreen employeeId="employee-1" operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "저장 요청 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.change(input, { target: { value: "저장 중 수정한 내용" } });

    await act(async () => { pending.resolve({ updated_at: "2026-08-04T02:30:00Z" }); });

    expect(input).toHaveValue("저장 중 수정한 내용");
    expect(screen.getByText("저장 필요")).toBeInTheDocument();
    const dirtyValues = registerDirtyMock.mock.calls.map((args) => args[1]);
    expect(dirtyValues.slice(dirtyValues.indexOf(true) + 1)).not.toContain(false);
  });

  it("작업 내역에 불필요한 보조 문구와 예시를 표시하지 않는다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const textarea = screen.getByRole("textbox", { name: "작업 내역" });
    const footer = screen.getByRole("button", { name: "저장" }).parentElement;
    const header = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header");

    expect(screen.queryByText("WORK DETAIL")).not.toBeInTheDocument();
    expect(screen.queryByText("MES SUMMARY")).not.toBeInTheDocument();
    expect(screen.queryByText("시간대 입력 없이, 오늘 수행한 핵심 작업을 여러 줄로 남기세요.")).not.toBeInTheDocument();
    expect(textarea).not.toHaveAttribute("placeholder");
    expect(footer).toHaveClass("justify-end");
    expect(header?.parentElement?.parentElement).toHaveClass("lg:py-0");
  });

  it("일보 화면 전용 배경색을 덧씌우지 않는다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const header = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header");
    expect(header?.parentElement?.parentElement).not.toHaveAttribute("style");
  });

  it("상단 정보는 그대로 두고 세로 여백만 압축한다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const header = screen.getByRole("heading", { name: "일일 작업 일보" }).closest("header");
    expect(header).toHaveClass("lg:py-2.5");
    expect(header).not.toHaveClass("lg:p-5");
  });

  it("일보 달력에서 미래 날짜는 선택할 수 없다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "일보 날짜 선택" }));
    const kstParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date()).reduce<Record<string, string>>((parts, part) => {
      parts[part.type] = part.value;
      return parts;
    }, {});
    const tomorrow = new Date(Number(kstParts.year), Number(kstParts.month) - 1, Number(kstParts.day) + 1);
    const futureLabel = `${tomorrow.getFullYear()}년 ${tomorrow.getMonth() + 1}월 ${tomorrow.getDate()}일`;

    expect(screen.getByRole("button", { name: futureLabel })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 달" })).toBeDisabled();
  });

  it("부서 색상으로 상단 정보와 전체 일보 직원 버튼을 구분한다", () => {
    queryState.reports = [{ employee_id: "employee-2", employee_name: "김지현", department: "고압" }];

    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    const departmentMeta = screen.getByText("부서").parentElement;
    const authorMeta = screen.getByText("작성자").parentElement;
    expect(departmentMeta?.getAttribute("style")).toContain("rgb(47, 111, 175)");
    expect(departmentMeta?.querySelector(".h-2.w-2")).toBeNull();
    expect(authorMeta?.querySelector(".h-2.w-2")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "전체 일보" }));

    const employeeButton = screen.getByText("고압").closest("button");
    expect(employeeButton?.getAttribute("style")).toContain("rgb(133, 99, 13)");
    expect(employeeButton?.querySelector(".h-2.w-2")).toBeNull();
  });
});
