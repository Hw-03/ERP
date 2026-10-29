import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalMemoDialog } from "../PersonalMemoDialog";

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/api/personal-memo", () => ({ personalMemoApi: mocks }));
vi.mock("../../common/PopupDialogFrame", () => ({ PopupDialogFrame: ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => <div role="dialog"><button onClick={onClose}>닫기</button>{children}</div> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const saved = { content: "기존 메모", updated_at: "2026-10-29T01:00:00Z" };

describe("PersonalMemoDialog", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(saved); mocks.save.mockResolvedValue(saved); });
  afterEach(() => { vi.useRealTimers(); });
  it("조회 실패 시 편집을 막고 재조회 후에만 메모를 표시한다", async () => {
    mocks.get.mockRejectedValueOnce(new Error("조회 실패"));
    render(<PersonalMemoDialog employeeId="a" onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(await screen.findByRole("textbox")).toHaveValue("기존 메모");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("1초 후 자동 저장하고 닫을 때 추가 입력도 저장한다", async () => {
    const close = vi.fn();
    render(<PersonalMemoDialog employeeId="a" onClose={close} />);
    const input = await screen.findByRole("textbox");
    vi.useFakeTimers();
    fireEvent.change(input, { target: { value: "새 메모" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.save).toHaveBeenCalledWith("a", "새 메모");
    fireEvent.change(input, { target: { value: "닫기 직전" } });
    await act(async () => { fireEvent.click(screen.getByText("닫기")); });
    expect(mocks.save).toHaveBeenLastCalledWith("a", "닫기 직전");
    expect(close).toHaveBeenCalledOnce();
  });
  it("닫기 저장 실패 시 내용과 팝업을 유지하고 재시도한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("저장 실패"));
    const close = vi.fn();
    render(<PersonalMemoDialog employeeId="a" onClose={close} />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "남은 내용" } });
    fireEvent.click(screen.getByText("닫기"));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("남은 내용");
    fireEvent.click(screen.getByRole("button", { name: "저장 후 닫기" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it("이전 직원의 늦은 조회 응답을 새 직원에게 적용하지 않는다", async () => {
    const pending = deferred<typeof saved>();
    mocks.get.mockImplementation((id: string) => id === "a" ? pending.promise : Promise.resolve({ ...saved, content: "B 메모" }));
    const close = vi.fn();
    const view = render(<PersonalMemoDialog key="a" employeeId="a" onClose={close} />);
    view.rerender(<PersonalMemoDialog key="b" employeeId="b" onClose={close} />);
    await screen.findByDisplayValue("B 메모");
    await act(async () => { pending.resolve(saved); });
    expect(screen.getByRole("textbox")).toHaveValue("B 메모");
    expect(close).not.toHaveBeenCalled();
  });
  it("직원 전환 후 이전 직원의 늦은 저장 완료로 새 팝업을 닫지 않는다", async () => {
    const pending = deferred<typeof saved>();
    mocks.save.mockReturnValueOnce(pending.promise);
    mocks.get.mockImplementation((id: string) => Promise.resolve({ ...saved, content: id === "a" ? "A 메모" : "B 메모" }));
    const close = vi.fn();
    const view = render(<PersonalMemoDialog employeeId="a" onClose={close} />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "A 수정" } });
    fireEvent.click(screen.getByText("닫기"));
    view.rerender(<PersonalMemoDialog employeeId="b" onClose={close} />);
    expect(await screen.findByRole("textbox")).toHaveValue("B 메모");
    await act(async () => { pending.resolve(saved); });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("B 메모");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it("저장 중 추가한 내용까지 마친 뒤 닫고 재열기에서 서버 내용을 읽는다", async () => {
    const pending = deferred<typeof saved>();
    mocks.save.mockReturnValueOnce(pending.promise);
    const close = vi.fn();
    const view = render(<PersonalMemoDialog employeeId="a" onClose={close} />);
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "첫 입력" } });
    fireEvent.click(screen.getByText("닫기"));
    fireEvent.change(input, { target: { value: "추가 입력" } });
    await act(async () => { pending.resolve(saved); });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mocks.save).toHaveBeenLastCalledWith("a", "추가 입력");
    view.unmount();
    mocks.get.mockResolvedValue({ ...saved, content: "추가 입력" });
    render(<PersonalMemoDialog employeeId="a" onClose={vi.fn()} />);
    expect(await screen.findByRole("textbox")).toHaveValue("추가 입력");
  });
});
