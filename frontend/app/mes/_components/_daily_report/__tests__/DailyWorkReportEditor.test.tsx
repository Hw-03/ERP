import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DailyWorkReportEditor } from "../DailyWorkReportEditor";

beforeAll(() => vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn(); }));
afterAll(() => vi.unstubAllGlobals());

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
  it("문구를 지정하지 않으면 작업 내역 제목과 기존 일보 안내를 유지한다", () => {
    const props = { initialContent: "", editable: true, saving: false, saveError: null, onSave: vi.fn() };
    const { rerender } = render(<DailyWorkReportEditor {...props} />);
    expect(screen.getByRole("heading", { name: "작업 내역" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "작업 내역" })).toBeInTheDocument();
    expect(screen.getByText("과거 일보도 수정할 수 있습니다.")).toBeInTheDocument();
    rerender(<DailyWorkReportEditor {...props} editable={false} />);
    expect(screen.getByText("작성된 일보가 없습니다.")).toBeInTheDocument();
  });

  it("선택 문구로 제목, 입력, 로딩, 빈 화면과 자동저장 안내를 재사용한다", () => {
    const props = { initialContent: "", editable: true, saving: false, saveError: null, onSave: vi.fn(), copy: { title: "메모", inputLabel: "개인 메모", emptyMessage: "작성된 메모가 없습니다.", footerHint: "입력한 내용은 자동으로 저장됩니다." } };
    const { rerender } = render(<DailyWorkReportEditor {...props} />);
    expect(screen.getByRole("heading", { name: "메모" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "개인 메모" })).toBeInTheDocument();
    expect(screen.getByText("입력한 내용은 자동으로 저장됩니다.")).toBeInTheDocument();
    expect(screen.queryByText(/일보/)).not.toBeInTheDocument();
    rerender(<DailyWorkReportEditor {...props} loading />);
    expect(screen.getByRole("status", { name: "개인 메모 불러오는 중" })).toBeInTheDocument();
    rerender(<DailyWorkReportEditor {...props} editable={false} />);
    expect(screen.getByText("작성된 메모가 없습니다.")).toBeInTheDocument();
  });

  it.each([undefined, "메모를 저장하지 못했습니다."])("알 수 없는 저장 오류의 기본 안내를 copy %s에 따라 표시한다", async (message) => {
    const saveRef = { current: null as (() => Promise<void>) | null };
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn().mockRejectedValue(null)} saveRef={saveRef} copy={{ saveError: message }} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "기록" } });
    await act(async () => { await saveRef.current?.().catch(() => {}); });
    expect(screen.getByRole("alert")).toHaveTextContent(message ?? "일보를 저장하지 못했습니다.");
  });

  it("빈 입력의 안내 이미지는 포커스와 내용에 따라 숨긴다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} />);
    const input = screen.getByLabelText("작업 내역");
    expect(screen.getByTestId("daily-empty-mascot")).toBeInTheDocument();
    fireEvent.focus(input);
    expect(screen.queryByTestId("daily-empty-mascot")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "기록" } });
    fireEvent.blur(input);
    expect(screen.queryByTestId("daily-empty-mascot")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("daily-empty-mascot")).toBeInTheDocument();
  });
  it("저장 실패 뒤에도 입력한 내용을 유지한다", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValueOnce("2026-08-04T02:30:00Z");
    const saveRef = { current: null as (() => Promise<void>) | null };
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={onSave} saveRef={saveRef} />);

    const input = screen.getByLabelText("작업 내역");
    fireEvent.change(input, { target: { value: "새 작업 내용" } });
    await act(async () => { await saveRef.current?.().catch(() => {}); });

    expect(await screen.findByText("저장 실패")).toBeInTheDocument();
    expect(screen.getByText("저장 실패 · 다시 시도하세요")).toBeInTheDocument();
    expect(input).toHaveValue("새 작업 내용");

    await act(async () => { await saveRef.current?.(); });
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

  it("기존 내용을 모두 지우면 빈 내용으로 자동 저장할 수 있다", async () => {
    const flushRef = { current: null as (() => Promise<void>) | null };
    const onSave = vi.fn().mockResolvedValue(null);
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={onSave} saveRef={flushRef} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "" } });
    await act(async () => { await flushRef.current?.(); });

    expect(onSave).toHaveBeenCalledWith("");
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });

  it("입력이 멈춘 뒤 1초 후 자동 저장하고 이어진 입력은 타이머를 다시 시작한다", async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue("2026-08-04T02:30:00Z");
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={onSave} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "첫 입력" } });
    await act(async () => { vi.advanceTimersByTime(700); });
    fireEvent.change(input, { target: { value: "최종 입력" } });
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith("최종 입력");
    vi.useRealTimers();
  });

  it("페이지가 숨겨질 때 대기 중인 내용을 저장 시도한다", () => {
    const onSave = vi.fn().mockResolvedValue("2026-08-04T02:30:00Z");
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "닫기 전 내용" } });

    fireEvent(window, new Event("pagehide"));

    expect(onSave).toHaveBeenCalledWith("닫기 전 내용");
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

  it("편집기는 데스크톱 본문의 남은 높이를 채운다", () => {
    render(<DailyWorkReportEditor initialContent="" editable saving={false} saveError={null} onSave={vi.fn()} fillAvailableHeight />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    expect(input).toHaveClass("lg:min-h-0");
    expect(input).toHaveClass("lg:flex-1");
    expect(input.parentElement).toHaveClass("lg:min-h-0", "lg:flex-1");
    expect(input.parentElement).not.toHaveClass("lg:h-[628px]", "lg:flex-none");
  });

  it("서버 저장 시각을 KST로 표시하고 수정하면 자동 저장 대기 상태로 전환한다", () => {
    render(<DailyWorkReportEditor initialContent="기존 내용" initialUpdatedAt="2026-08-04T02:30:00Z" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T02:30:00Z")} />);

    expect(screen.getByText("저장됨 · 11:30")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "수정한 내용" } });

    expect(screen.getByText("저장 대기 중")).toBeInTheDocument();
  });

  it("같은 서버 저장 시각이 반환돼도 저장 성공 후 저장됨 상태로 전환한다", async () => {
    vi.useFakeTimers();
    render(<DailyWorkReportEditor initialContent="기존 내용" initialUpdatedAt="2026-08-04T02:30:00Z" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T02:30:00Z")} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "수정한 내용" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();

    expect(screen.getByText("저장됨 · 11:30")).toBeInTheDocument();
    expect(screen.queryByText("저장 대기 중")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it.each(["  수정한 내용 ", "수정한 내용\n\n", " \n "])("자동 저장 후 공백과 줄바꿈을 유지한다: %j", async (content) => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue("2026-08-04T02:30:00Z");
    render(<DailyWorkReportEditor initialContent="기존 내용" initialUpdatedAt="2026-08-04T02:30:00Z" editable saving={false} saveError={null} onSave={onSave} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: content } });
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(screen.getByText("저장됨 · 11:30")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(content);
    expect(screen.getByRole("textbox", { name: "작업 내역" })).toHaveValue(content);
    expect(screen.queryByText("저장 대기 중")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("대상이 바뀌면 이전 저장 시각을 초기화한다", () => {
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 내용" initialUpdatedAt="2026-08-04T01:00:00Z" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T01:00:00Z")} />);

    expect(screen.getByText("저장됨 · 10:00")).toBeInTheDocument();
    rerender(<DailyWorkReportEditor initialContent="다른 내용" initialUpdatedAt="2026-08-04T03:00:00Z" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    expect(screen.getByText("저장됨 · 12:00")).toBeInTheDocument();
  });

  it("대상이 바뀐 뒤 이전 저장 성공 응답은 새 대상 상태를 갱신하지 않는다", async () => {
    const pending = deferred<string>();
    const saveRef = { current: null as (() => Promise<void>) | null };
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 대상" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockReturnValue(pending.promise)} saveRef={saveRef} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "첫 대상 저장" } });
    const pendingSave = saveRef.current?.();
    rerender(<DailyWorkReportEditor initialContent="새 대상" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    await act(async () => { pending.resolve("2026-08-04T02:30:00Z"); await pendingSave; });

    expect(screen.getByRole("textbox", { name: "작업 내역" })).toHaveValue("새 대상");
    expect(screen.queryByText("저장됨 · 11:30")).not.toBeInTheDocument();
  });

  it("대상이 바뀐 뒤 이전 저장 실패 응답은 새 대상에 실패 상태를 남기지 않는다", async () => {
    const pending = deferred<string>();
    const saveRef = { current: null as (() => Promise<void>) | null };
    const { rerender } = render(<DailyWorkReportEditor initialContent="첫 대상" resetKey="employee-1:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockReturnValue(pending.promise)} saveRef={saveRef} />);

    fireEvent.change(screen.getByRole("textbox", { name: "작업 내역" }), { target: { value: "첫 대상 저장" } });
    const pendingSave = saveRef.current?.().catch(() => {});
    rerender(<DailyWorkReportEditor initialContent="새 대상" resetKey="employee-2:2026-08-04" editable saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T03:00:00Z")} />);

    await act(async () => { pending.reject(new Error("저장 실패")); await pendingSave; });

    expect(screen.getByRole("textbox", { name: "작업 내역" })).toHaveValue("새 대상");
    expect(screen.queryByText("저장 실패 · 다시 시도하세요")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("저장 중 수정한 입력은 이전 저장 성공 응답으로 덮어쓰지 않는다", async () => {
    const pending = deferred<string>();
    const saveRef = { current: null as (() => Promise<void>) | null };
    const onSave = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce("2026-08-04T03:00:00Z");
    render(<DailyWorkReportEditor initialContent="기존 내용" editable saving={false} saveError={null} onSave={onSave} saveRef={saveRef} />);

    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "저장 요청 내용" } });
    const pendingSave = saveRef.current?.();
    fireEvent.change(input, { target: { value: "저장 중 수정한 내용" } });

    await act(async () => { pending.resolve("2026-08-04T02:30:00Z"); await pendingSave; });

    expect(input).toHaveValue("저장 중 수정한 내용");
    expect(onSave).toHaveBeenNthCalledWith(2, "저장 중 수정한 내용");
    expect(screen.getByText("저장됨 · 12:00")).toBeInTheDocument();
  });

  it.each([false, true])("저장 중 원래 입력으로 되돌려도 서버 내용을 다시 저장하고 flush를 기다린다: %s", async (flushWhileSaving) => {
    const first = deferred<string>();
    const second = deferred<string>();
    const saveRef = { current: null as (() => Promise<void>) | null };
    let serverContent = "A";
    const onSave = vi.fn()
      .mockImplementationOnce(async (content: string) => { const updatedAt = await first.promise; serverContent = content; return updatedAt; })
      .mockImplementationOnce(async (content: string) => { const updatedAt = await second.promise; serverContent = content; return updatedAt; });
    render(<DailyWorkReportEditor initialContent="A" editable saving={false} saveError={null} onSave={onSave} saveRef={saveRef} />);
    const input = screen.getByRole("textbox", { name: "작업 내역" });
    fireEvent.change(input, { target: { value: "B" } });
    let pendingSave!: Promise<void>;
    act(() => { pendingSave = saveRef.current!(); });
    fireEvent.change(input, { target: { value: "A" } });
    let flushed = false;
    let closeFlush: Promise<void> | undefined;
    if (flushWhileSaving) act(() => { closeFlush = saveRef.current!().then(() => { flushed = true; }); });

    await act(async () => { first.resolve("2026-08-04T02:30:00Z"); await Promise.resolve(); });
    expect(serverContent).toBe("B");
    expect(input).toHaveValue("A");
    expect(onSave).toHaveBeenNthCalledWith(2, "A");
    expect(flushed).toBe(false);

    await act(async () => { second.resolve("2026-08-04T03:00:00Z"); await pendingSave; await closeFlush; });
    expect(serverContent).toBe("A");
    expect(input).toHaveValue("A");
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.getByText("저장됨 · 12:00")).toBeInTheDocument();
    await act(async () => { await saveRef.current!(); });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(flushed).toBe(flushWhileSaving);
  });

  it("읽기 전용 장문은 데스크톱 카드 내부에서만 스크롤한다", () => {
    const content = "긴 작업 내역 ".repeat(500);
    render(<DailyWorkReportEditor initialContent={content} editable={false} saving={false} saveError={null} onSave={vi.fn().mockResolvedValue("2026-08-04T02:30:00Z")} fillAvailableHeight />);

    const readonlyContent = screen.getByText((_, element) => element?.tagName === "P" && element.textContent === content);
    expect(readonlyContent).toHaveClass("lg:min-h-0", "lg:flex-1", "lg:overflow-y-auto");
    expect(readonlyContent).not.toHaveClass("lg:max-h-72");
    expect(readonlyContent.closest("section")).toHaveClass("lg:flex", "lg:min-h-0", "lg:flex-1", "lg:flex-col");
  });

  it("모바일 높이 채움 모드의 입력과 로딩은 같은 남은 공간을 쓰고 긴 입력은 입력창 안에서 스크롤한다", () => {
    const props = { initialContent: "긴 작업 내역 ".repeat(500), editable: true, saving: false, saveError: null, onSave: vi.fn().mockResolvedValue(null), mobile: true, fillAvailableHeight: true };
    const { rerender } = render(<DailyWorkReportEditor {...props} />);
    const editor = screen.getByRole("textbox", { name: "작업 내역" });
    expect(editor).toHaveClass("min-h-0", "overflow-y-auto");
    expect(editor.closest("section")).toHaveClass("min-h-0", "flex-1");
    rerender(<DailyWorkReportEditor {...props} loading />);
    expect(screen.getByTestId("daily-report-editor-skeleton")).toHaveClass("min-h-0", "flex-1");
  });
});
