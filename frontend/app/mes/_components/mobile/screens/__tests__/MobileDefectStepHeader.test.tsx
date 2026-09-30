import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileDefectStepHeader } from "../MobileDefectStepHeader";

describe("MobileDefectStepHeader", () => {
  it("현재 제목과 실제 단계 수를 표시하고 이전 동작을 연결한다", () => {
    const onBack = vi.fn();
    render(<MobileDefectStepHeader title="품목 선택" steps={["출처 선택", "품목 선택"]} current={1} onBack={onBack} />);

    expect(screen.getByRole("heading", { name: "품목 선택" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 / 2")).toBeInTheDocument();
    screen.getByRole("button", { name: "이전" }).click();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
