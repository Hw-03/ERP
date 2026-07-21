import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminDangerZone } from "../AdminDangerZone";

function AdminDangerZoneHarness() {
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });

  return (
    <AdminDangerZone
      pinForm={pinForm}
      setPinForm={setPinForm}
      onChangePin={vi.fn()}
    />
  );
}

describe("AdminDangerZone", () => {
  it("PIN 입력을 레이블로 연결하고 불일치 오류를 확인 입력에 연결한다", () => {
    render(<AdminDangerZoneHarness />);

    const currentPin = screen.getByLabelText("현재 PIN");
    const newPin = screen.getByLabelText("새 PIN");
    const confirmPin = screen.getByLabelText("새 PIN 확인");

    fireEvent.change(currentPin, { target: { value: "0000" } });
    fireEvent.change(newPin, { target: { value: "1234" } });
    fireEvent.change(confirmPin, { target: { value: "5678" } });

    expect(screen.getByText("새 PIN과 일치하지 않습니다.")).toBeInTheDocument();
    expect(confirmPin).toHaveAttribute("aria-describedby");
  });
});
