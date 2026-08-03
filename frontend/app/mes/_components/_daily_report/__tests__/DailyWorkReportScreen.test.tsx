import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DailyWorkReportScreen } from "../DailyWorkReportScreen";

const queryState = {
  report: { data: null as { employee_name: string; department: string; content: string } | null, isError: false },
  selectedReport: { data: null as { employee_name: string; department: string; content: string } | null, isError: false },
  reports: [] as Array<{ employee_id: string; employee_name: string; department: string }>,
  activity: { data: { work_date: "2026-08-03", employee_id: "employee-1", summary: [], cancelled_count: 0, details: [] }, isError: false },
};

vi.mock("@/lib/queries/useDailyWorkReportsQuery", () => ({
  useDailyWorkReportQuery: (employeeId: string | null | undefined) => employeeId === "employee-2" ? queryState.selectedReport : queryState.report,
  useDailyWorkReportsQuery: () => ({ data: queryState.reports, isError: false }),
  useDailyWorkActivityQuery: () => queryState.activity,
  useSaveDailyWorkReport: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/ui/dirty-guard", () => ({
  useRegisterDirty: vi.fn(),
}));

describe("DailyWorkReportScreen", () => {
  beforeEach(() => {
    queryState.report = { data: null, isError: false };
    queryState.selectedReport = { data: null, isError: false };
    queryState.reports = [];
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

  it("데스크톱에서는 작업 내역이 남은 세로 공간을 채운다", () => {
    render(
      <DailyWorkReportScreen
        employeeId="employee-1"
        operator={{ employee_id: "employee-1", name: "김현우", department: "조립" } as never}
      />,
    );

    expect(screen.getByRole("textbox", { name: "작업 내역" }).closest("section")).toHaveClass("lg:flex-1");
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
});
