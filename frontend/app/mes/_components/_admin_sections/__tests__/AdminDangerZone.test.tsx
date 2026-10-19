import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminDangerZone } from "../AdminDangerZone";

function AdminDangerZoneHarness({ isSaving = false }: { isSaving?: boolean }) {
  const [pinForm, setPinForm] = useState({ current_pin: "", new_pin: "", confirm_pin: "" });
  const props = { pinForm, setPinForm, onChangePin: vi.fn(), isSaving };

  return (
    <AdminDangerZone {...props} />
  );
}

describe("AdminDangerZone", () => {
  it("공통 관리자 카드 안에 PIN 입력과 장식용 덱스레이를 배치한다", () => {
    const { container } = render(<AdminDangerZoneHarness />);

    expect(container.firstElementChild).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");
    const scrollRegion = container.querySelector(".overflow-y-auto");
    expect(scrollRegion).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(scrollRegion).toHaveClass("rounded-[20px]", "border");
    expect(scrollRegion?.firstElementChild).toHaveClass("grid", "min-h-full", "items-center", "lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)_minmax(0,1fr)]");
    expect(scrollRegion?.firstElementChild?.firstElementChild).toHaveClass("lg:col-start-2", "max-w-[560px]");
    const mascot = container.querySelector("img");
    expect(mascot).toHaveAttribute("alt", "");
    expect(mascot?.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(mascot?.parentElement).toHaveClass("hidden", "lg:flex");
    expect(mascot?.parentElement).toHaveClass("lg:col-start-3");
    expect(mascot).toHaveClass("max-w-[240px]");
    for (const label of ["현재 PIN", "새 PIN", "새 PIN 확인"]) {
      expect(screen.getByLabelText(label)).toHaveClass("min-h-11");
    }
    expect(screen.getByRole("button", { name: "PIN 변경" })).toHaveClass("min-h-11", "w-full");
  });

  it("저장 중에는 세 PIN 입력과 변경 버튼을 비활성화한다", () => {
    render(<AdminDangerZoneHarness isSaving />);

    expect(screen.getByLabelText("현재 PIN")).toBeDisabled();
    expect(screen.getByLabelText("새 PIN")).toBeDisabled();
    expect(screen.getByLabelText("새 PIN 확인")).toBeDisabled();
    expect(screen.getByRole("button", { name: "변경 중..." })).toBeDisabled();
  });

  it("세 PIN이 비어 있으면 길이 오류 없이 변경 버튼을 비활성화한다", () => {
    render(<AdminDangerZoneHarness />);

    expect(screen.queryByText("PIN은 4~32자로 입력하세요.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PIN 변경" })).toBeDisabled();
  });

  it("4~32자가 아닌 PIN은 즉시 오류 안내와 연결하고 변경을 막는다", () => {
    render(<AdminDangerZoneHarness />);

    const currentPin = screen.getByLabelText("현재 PIN");
    const newPin = screen.getByLabelText("새 PIN");
    const confirmPin = screen.getByLabelText("새 PIN 확인");
    const changeButton = screen.getByRole("button", { name: "PIN 변경" });

    fireEvent.change(currentPin, { target: { value: "123" } });
    fireEvent.change(newPin, { target: { value: "456" } });
    fireEvent.change(confirmPin, { target: { value: "456" } });

    expect(screen.getAllByText("PIN은 4~32자로 입력하세요.")).toHaveLength(3);
    expect(currentPin).toHaveAttribute("aria-invalid", "true");
    expect(currentPin).toHaveAttribute("aria-describedby", "admin-current-pin-error");
    expect(newPin).toHaveAttribute("aria-invalid", "true");
    expect(newPin).toHaveAttribute("aria-describedby", "admin-new-pin-error");
    expect(confirmPin).toHaveAttribute("aria-invalid", "true");
    expect(confirmPin).toHaveAttribute("aria-describedby", "admin-confirm-pin-error");
    expect(changeButton).toBeDisabled();
  });

  it("새 PIN 불일치 오류를 확인 입력에 연결한다", () => {
    render(<AdminDangerZoneHarness />);

    const currentPin = screen.getByLabelText("현재 PIN");
    const newPin = screen.getByLabelText("새 PIN");
    const confirmPin = screen.getByLabelText("새 PIN 확인");

    fireEvent.change(currentPin, { target: { value: "0000" } });
    fireEvent.change(newPin, { target: { value: "1234" } });
    fireEvent.change(confirmPin, { target: { value: "5678" } });

    expect(screen.getByText("새 PIN과 일치하지 않습니다.")).toBeInTheDocument();
    expect(confirmPin).toHaveAttribute("aria-invalid", "true");
    expect(confirmPin).toHaveAttribute("aria-describedby", "admin-confirm-pin-error");
  });

  it("연결된 PIN 값이 비어 있으면 불일치 오류를 즉시 표시하지 않는다", () => {
    render(<AdminDangerZoneHarness />);

    const confirmPin = screen.getByLabelText("새 PIN 확인");
    fireEvent.change(confirmPin, { target: { value: "1234" } });

    expect(screen.queryByText("새 PIN과 일치하지 않습니다.")).not.toBeInTheDocument();
  });

  it("유효하고 일치하는 PIN에서만 변경 버튼을 활성화한다", () => {
    render(<AdminDangerZoneHarness />);

    const currentPin = screen.getByLabelText("현재 PIN");
    const newPin = screen.getByLabelText("새 PIN");
    const confirmPin = screen.getByLabelText("새 PIN 확인");
    const changeButton = screen.getByRole("button", { name: "PIN 변경" });

    fireEvent.change(currentPin, { target: { value: "0000" } });
    fireEvent.change(newPin, { target: { value: "1234" } });
    fireEvent.change(confirmPin, { target: { value: "1234" } });

    expect(changeButton).toBeEnabled();
  });

  it("32자 PIN은 허용하고 33자 PIN은 오류와 함께 거부한다", () => {
    render(<AdminDangerZoneHarness />);

    const currentPin = screen.getByLabelText("현재 PIN");
    const newPin = screen.getByLabelText("새 PIN");
    const confirmPin = screen.getByLabelText("새 PIN 확인");
    const changeButton = screen.getByRole("button", { name: "PIN 변경" });
    const maxLengthPin = "1".repeat(32);

    fireEvent.change(currentPin, { target: { value: maxLengthPin } });
    fireEvent.change(newPin, { target: { value: maxLengthPin } });
    fireEvent.change(confirmPin, { target: { value: maxLengthPin } });

    expect(changeButton).toBeEnabled();

    fireEvent.change(confirmPin, { target: { value: "1".repeat(33) } });

    expect(screen.getByText("PIN은 4~32자로 입력하세요.")).toBeInTheDocument();
    expect(confirmPin).toHaveAttribute("aria-invalid", "true");
    expect(changeButton).toBeDisabled();
  });

  it("길이가 유효해도 새 PIN이 일치하지 않으면 변경 버튼을 비활성화한다", () => {
    render(<AdminDangerZoneHarness />);

    fireEvent.change(screen.getByLabelText("현재 PIN"), { target: { value: "0000" } });
    fireEvent.change(screen.getByLabelText("새 PIN"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("새 PIN 확인"), { target: { value: "5678" } });

    expect(screen.getByRole("button", { name: "PIN 변경" })).toBeDisabled();
  });
});
