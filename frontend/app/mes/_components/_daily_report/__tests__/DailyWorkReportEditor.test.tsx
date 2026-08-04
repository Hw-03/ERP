import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyWorkReportEditor } from "../DailyWorkReportEditor";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("DailyWorkReportEditor", () => {
  it("저장 실패 뒤에도 입력한 내용을 유지한다", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce("2026-08-04T02:30:00Z");
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={onSave} />);

    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "새 작업 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(screen.getByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();
    expect(input).toHaveValue("새 작업 내용");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("저장됨 · 11:30")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(2);
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

  it("작업 내역 입력 글자를 제목과 같은 18px로 표시한다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    expect(input).toHaveClass("text-lg");
    expect(input).not.toHaveClass("text-sm");
    expect(input).not.toHaveClass("text-base");
  });

  it("작업 내역 제목과 글자 수를 같은 세로선에 맞춘다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} />);

    const heading = screen.getByRole("heading", { name: "작업 내역" });
    expect(heading.parentElement?.parentElement).toHaveClass("items-center");
  });

  it("편집기는 데스크톱 본문을 채우는 628px 높이를 유지한다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} fillAvailableHeight />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    expect(input).toHaveClass("lg:min-h-0");
    expect(input).toHaveClass("lg:flex-1");
    expect(input.parentElement).toHaveClass("lg:h-[628px]", "lg:flex-none");
    expect(input.parentElement).not.toHaveClass("lg:flex-1");
  });

  it("서버 저장 시각을 KST로 표시하고 수정하면 저장 필요 상태로 전환한다", () => {
    render(<DailyWorkReportEditor initialContent="기존 내용" initialUpdatedAt="2026-08-04T02:30:00Z" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T02:30:00Z")} />);

    expect(screen.getByText("저장됨 · 11:30")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "수정한 내용" } });

    expect(screen.getByText("저장 필요")).toBeInTheDocument();
  });

  it("대상이 바뀌면 이전 저장 시각을 초기화한다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 내용" initialUpdatedAt="2026-08-04T01:00:00Z" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T01:00:00Z")} />);

    expect(screen.getByText("저장됨 · 10:00")).toBeInTheDocument();
    rerender(<DailyWorkReportEditor initialContent="다른 내용" initialUpdatedAt="2026-08-04T03:00:00Z" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    expect(screen.getByText("저장됨 · 12:00")).toBeInTheDocument();
  });

  it("대상이 바뀐 뒤 이전 저장 성공 응답은 새 대상 상태를 갱신하지 않는다", async () => {
    const pending = deferred<string>();
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 대상" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockReturnValue(pending.promise)} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "첫 대상 저장" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    rerender(<DailyWorkReportEditor initialContent="새 대상" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    await act(async () => { pending.resolve("2026-08-04T02:30:00Z"); });

    expect(screen.getByRole("textbox", { name: "작업 내역" })).toHaveValue("새 대상");
    expect(screen.queryByText("저장됨 · 11:30")).not.toBeInTheDocument();
  });

  it("대상이 바뀐 뒤 이전 저장 실패 응답은 새 대상에 실패 상태를 남기지 않는다", async () => {
    const pending = deferred<string>();
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 대상" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockReturnValue(pending.promise)} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "첫 대상 저장" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    rerender(<DailyWorkReportEditor initialContent="새 대상" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    await act(async () => { pending.reject(new Error("저장 실패")); });

    expect(screen.getByRole("textbox", { name: "작업 내역" })).toHaveValue("새 대상");
    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장 중 수정한 입력은 이전 저장 성공 응답으로 덮어쓰지 않는다", async () => {
    const pending = deferred<string>();
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={vi.fn().mockReturnValue(pending.promise)} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "저장 요청 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.change(input, { target: { value: "저장 중 수정한 내용" } });

    await act(async () => { pending.resolve("2026-08-04T02:30:00Z"); });

    expect(input).toHaveValue("저장 중 수정한 내용");
    expect(screen.getByText("저장 필요")).toBeInTheDocument();
    expect(screen.queryByText("저장됨 · 11:30")).not.toBeInTheDocument();
  });

  it("읽기 전용 장문은 데스크톱 카드 내부에서만 스크롤한다", () => {
    const content = "긴 작업 내역 ".repeat(500);
    render(<DailyWorkReportEditor initialContent={content} editable={false} saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T02:30:00Z")} />);

    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === content)).toHaveClass("lg:max-h-72", "lg:overflow-y-auto");
  });
});
