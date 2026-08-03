import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyWorkReportEditor } from "../DailyWorkReportEditor";

describe("DailyWorkReportEditor", () => {
  it("저장 실패 뒤에도 입력한 내용을 유지한다", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("저장 실패"));
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError="저장 실패" onSave={onSave} />);

    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "새 작업 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(input).toHaveValue("새 작업 내용");
  });

  it("대상 일지가 바뀌면 저장하지 않은 이전 입력을 새 대상 내용으로 초기화한다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="7월 27일" resetKey="2026-07-27" editable saving={false} saveError={null} onSave={vi.fn()} />);
    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "버려야 할 이전 입력" } });

    rerender(<DailyWorkReportEditor initialContent="7월 28일" resetKey="2026-07-28" editable saving={false} saveError={null} onSave={vi.fn()} />);

    expect(input).toHaveValue("7월 28일");
  });

  it("같은 대상의 늦은 조회 응답은 이미 입력한 초안을 덮어쓰지 않는다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="" resetKey="employee-1:2026-07-28" editable saving={false} saveError={null} onSave={vi.fn()} />);
    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "작성 중인 초안" } });

    rerender(<DailyWorkReportEditor initialContent="늦게 도착한 서버 내용" resetKey="employee-1:2026-07-28" editable saving={false} saveError={null} onSave={vi.fn()} />);

    expect(input).toHaveValue("작성 중인 초안");
  });

  it("새 대상의 늦은 조회 응답은 입력 전일 때 적용한다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="이전 내용" resetKey="employee-1:2026-07-27" editable saving={false} saveError={null} onSave={vi.fn()} />);

    rerender(<DailyWorkReportEditor initialContent="" resetKey="employee-2:2026-07-28" editable saving={false} saveError={null} onSave={vi.fn()} />);
    rerender(<DailyWorkReportEditor initialContent="새 대상 서버 내용" resetKey="employee-2:2026-07-28" editable saving={false} saveError={null} onSave={vi.fn()} />);

    expect(screen.getByLabelText("작업 내역")).toHaveValue("새 대상 서버 내용");
  });

  it("같은 직원과 날짜의 new에서 loaded 전환은 입력한 초안을 보존한다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="" resetKey="mine:2026-07-28:employee-1" editable saving={false} saveError={null} onSave={vi.fn()} />);
    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "조회 중 작성한 초안" } });

    rerender(<DailyWorkReportEditor initialContent="늦게 도착한 기존 일지" resetKey="mine:2026-07-28:employee-1" editable saving={false} saveError={null} onSave={vi.fn()} />);

    expect(input).toHaveValue("조회 중 작성한 초안");
  });

  it("빈 내용 저장은 오류를 보이고 flush를 거부한다", async () => {
    const flushRef = { current: null as (() => Promise<void>) | null };
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} saveRef={flushRef} />);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("일보 내용을 입력하세요.")).toBeInTheDocument();
    await expect(flushRef.current?.()).rejects.toThrow("일보 내용을 입력하세요.");
  });
  it("작업 내역 입력창의 크기 조절을 막는다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    expect(input).toHaveClass("resize-none");
    expect(input).not.toHaveClass("resize-y");
  });

  it("작업 내역 제목과 글자 수를 같은 세로선에 맞춘다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} />);

    const heading = screen.getByRole("heading", { name: "작업 내역" });
    expect(heading.parentElement?.parentElement).toHaveClass("items-center");
  });

  it("거래 상세가 커져도 채움 편집기는 데스크톱 입력 높이를 유지한다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} fillAvailableHeight />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    expect(input).toHaveClass("lg:min-h-0");
    expect(input.parentElement).toHaveClass("lg:h-[424px]");
    expect(input.parentElement).toHaveClass("lg:flex-none");
  });
});
