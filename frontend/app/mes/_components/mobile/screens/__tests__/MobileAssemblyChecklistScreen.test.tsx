import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileAssemblyChecklistScreen } from "../MobileAssemblyChecklistScreen";

function renderChecklistScreen() {
  render(<MobileAssemblyChecklistScreen />);
}

describe("MobileAssemblyChecklistScreen", () => {
  it("starts with the DX3000 and ADX6000 product choices", () => {
    renderChecklistScreen();

    expect(screen.getByRole("heading", { name: "조립 체크리스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" })).toBeInTheDocument();
  });

  it("shows DX3000 power-off and power-on sections as a read-only list", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    expect(screen.getByRole("heading", { name: "DX3000" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 OFF 체크리스트" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 ON 체크리스트" })).toBeInTheDocument();
    expect(screen.getByText("손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인")).toBeInTheDocument();
    expect(screen.getByText("펌웨어가 정상적으로 들어갔는지 확인")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("returns to product selection from a checklist", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));

    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" })).toBeInTheDocument();
  });

  it("shows the ADX6000 source wording without checkbox controls", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" }));

    expect(screen.getByRole("heading", { name: "ADX6000" })).toBeInTheDocument();
    expect(screen.getByText("LCD 열고닫을때 소리안나는지 확인")).toBeInTheDocument();
    expect(screen.getByText("POWER BUTTON이 정상적으로 눌리는지 확인")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
