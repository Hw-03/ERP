import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { useAdminSettings } from "../useAdminSettings";

vi.mock("@/lib/api", () => ({
  api: { updateAdminPin: vi.fn() },
}));

describe("useAdminSettings", () => {
  beforeEach(() => {
    vi.mocked(api.updateAdminPin).mockReset();
  });

  it("PIN 변경 성공은 저장 메시지와 초기화 상태를 남기고 오류 콜백을 호출하지 않는다", async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    vi.mocked(api.updateAdminPin).mockResolvedValue({ message: "관리자 비밀번호를 변경했습니다." });
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "0000", new_pin: "1234", confirm_pin: "1234" });
    });

    await act(async () => {
      await result.current.changePin();
    });

    expect(api.updateAdminPin).toHaveBeenCalledWith({ current_pin: "0000", new_pin: "1234" });
    expect(result.current.pinForm).toEqual({ current_pin: "", new_pin: "", confirm_pin: "" });
    expect(result.current.saveMessage).toBe("관리자 비밀번호를 변경했습니다.");
    expect(onStatusChange).toHaveBeenCalledWith("관리자 비밀번호를 변경했습니다.");
    expect(onError).not.toHaveBeenCalled();
  });

  it("API 거부는 오류 콜백으로 전달하고 저장 메시지를 남기지 않는다", async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    vi.mocked(api.updateAdminPin).mockRejectedValue(new Error("현재 비밀번호가 올바르지 않습니다."));
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "0000", new_pin: "1234", confirm_pin: "1234" });
    });

    await act(async () => {
      await result.current.changePin();
    });

    expect(onError).toHaveBeenCalledWith("현재 비밀번호가 올바르지 않습니다.");
    expect(result.current.saveMessage).toBeNull();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
  });

  it("새 PIN 불일치 자체 검증은 API 호출 없이 오류 콜백으로 전달한다", async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "0000", new_pin: "1234", confirm_pin: "5678" });
    });

    await act(async () => {
      await result.current.changePin();
    });

    expect(api.updateAdminPin).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("새 PIN과 확인 PIN이 일치하지 않습니다.");
    expect(result.current.saveMessage).toBeNull();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("4자 미만 PIN 자체 검증은 API 호출 없이 오류 콜백으로 전달한다", async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "123", new_pin: "1234", confirm_pin: "1234" });
    });

    await act(async () => {
      await result.current.changePin();
    });

    expect(api.updateAdminPin).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("PIN은 4~32자로 입력하세요.");
    expect(result.current.saveMessage).toBeNull();
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("진행 중인 PIN 변경은 중복 API 호출 없이 완료 후에만 상태를 초기화한다", async () => {
    const onStatusChange = vi.fn();
    const onError = vi.fn();
    let resolveRequest!: (value: { message: string }) => void;
    vi.mocked(api.updateAdminPin).mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "0000", new_pin: "1234", confirm_pin: "1234" });
    });

    let firstChange!: Promise<void>;
    act(() => {
      firstChange = result.current.changePin();
    });

    expect(result.current.isSaving).toBe(true);
    expect(result.current.pinForm).toEqual({ current_pin: "0000", new_pin: "1234", confirm_pin: "1234" });

    let secondChange!: Promise<void>;
    act(() => {
      secondChange = result.current.changePin();
    });

    expect(api.updateAdminPin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ message: "관리자 비밀번호를 변경했습니다." });
      await Promise.all([firstChange, secondChange]);
    });

    expect(result.current.pinForm).toEqual({ current_pin: "", new_pin: "", confirm_pin: "" });
    expect(result.current.isSaving).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("상태 콜백 예외를 오류 콜백으로 전환하지 않는다", async () => {
    const callbackError = new Error("상태 콜백 실패");
    const onStatusChange = vi.fn(() => { throw callbackError; });
    const onError = vi.fn();
    vi.mocked(api.updateAdminPin).mockResolvedValue({ message: "관리자 비밀번호를 변경했습니다." });
    const { result } = renderHook(() => useAdminSettings({ onStatusChange, onError }));

    act(() => {
      result.current.setPinForm({ current_pin: "0000", new_pin: "1234", confirm_pin: "1234" });
    });

    let thrownError: unknown;
    await act(async () => {
      try {
        await result.current.changePin();
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toBe(callbackError);
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
  });
});
