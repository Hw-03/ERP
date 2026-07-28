import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopPinLock } from "../DesktopPinLock";

const { verifyAdminPin } = vi.hoisted(() => ({ verifyAdminPin: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: { verifyAdminPin },
}));

describe("DesktopPinLock", () => {
  it("automatically verifies on the fourth digit", async () => {
    verifyAdminPin.mockResolvedValueOnce(undefined);
    const onUnlocked = vi.fn();
    render(<DesktopPinLock onUnlocked={onUnlocked} />);

    ["1", "2", "3", "4"].forEach((digit) => fireEvent.click(screen.getByRole("button", { name: digit })));

    await waitFor(() => {
      expect(verifyAdminPin).toHaveBeenCalledWith("1234");
      expect(onUnlocked).toHaveBeenCalledWith("1234");
    });
  });

  it("deletes the last digit and clears an error on the next entry", async () => {
    verifyAdminPin.mockRejectedValueOnce(new Error("invalid"));
    const onUnlocked = vi.fn();
    render(<DesktopPinLock onUnlocked={onUnlocked} />);

    ["1", "2", "3", "4"].forEach((digit) => fireEvent.click(screen.getByRole("button", { name: digit })));
    await screen.findByText("PIN이 올바르지 않습니다. 다시 입력해 주세요.");

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getAllByRole("button").at(-1)!);

    expect(screen.queryByText("PIN이 올바르지 않습니다. 다시 입력해 주세요.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));

    await waitFor(() => {
      expect(verifyAdminPin).toHaveBeenLastCalledWith("1245");
      expect(onUnlocked).toHaveBeenCalledWith("1245");
    });
  });

  it("uses a single PIN card above the inherited shell background", () => {
    const { container } = render(<DesktopPinLock onUnlocked={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass("flex", "items-center", "justify-center");
    expect(container.querySelector(".max-w-\\[440px\\]")).toHaveClass("relative", "rounded-[28px]", "border");
    expect(container.querySelectorAll(".blur-3xl")).toHaveLength(0);
  });
});
