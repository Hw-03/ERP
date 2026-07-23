import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileAssemblyChecklistScreen } from "../MobileAssemblyChecklistScreen";

function renderChecklistScreen(onExit?: () => void) {
  render(<MobileAssemblyChecklistScreen onExit={onExit} />);
}

function expectCardWithoutShadow(card: HTMLElement) {
  expect(card.style.boxShadow).toBe("");
  expect(card.className.split(/\s+/).some((className) => className === "shadow" || className.startsWith("shadow-"))).toBe(false);
}

describe("MobileAssemblyChecklistScreen", () => {
  it("starts with the DX3000 and ADX6000 product choices", () => {
    renderChecklistScreen();

    expect(screen.getByRole("heading", { name: "조립 체크리스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DX3000 체크리스트 열기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" })).toBeInTheDocument();
  });

  it("returns to the More menu from the product selection screen", () => {
    const onExit = vi.fn();

    renderChecklistScreen(onExit);

    fireEvent.click(screen.getByRole("button", { name: "더보기 메뉴로 돌아가기" }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("shows DX3000 power-off and power-on checklist sections", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    expect(screen.getByRole("heading", { name: "DX3000" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 OFF 체크리스트" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "전원 ON 체크리스트" })).toBeInTheDocument();
    expect(screen.getByText("손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인")).toBeInTheDocument();
    expect(screen.getByText("펌웨어가 정상적으로 들어갔는지 확인")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("toggles a DX3000 item and clears only the selected product checklist", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    const firstItem = screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ });
    const clearButton = screen.getByRole("button", { name: "전체 해제" });

    expect(firstItem).toHaveAttribute("aria-pressed", "false");
    expect(clearButton).toBeDisabled();

    fireEvent.click(firstItem);

    expect(firstItem).toHaveAttribute("aria-pressed", "true");
    expect(firstItem).toHaveStyle({ borderColor: "var(--c-green)" });
    expect(within(firstItem).getByText("1")).toHaveStyle({
      color: "color-mix(in srgb, var(--c-green) 60%, var(--c-text))",
    });
    expect(clearButton).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(clearButton);

    expect(firstItem).toHaveAttribute("aria-pressed", "false");
    expect(clearButton).toBeDisabled();
  });

  it("keeps the item background and body text color unchanged when toggled", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    const firstItem = screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ });
    const itemText = within(firstItem).getByText("손잡이 나사 고정 상태 양호 - 나사가 풀리지 않는지 확인");
    const backgroundBeforeToggle = firstItem.style.background;
    const textColorBeforeToggle = itemText.style.color;

    expect(firstItem.className.split(/\s+/).some((className) => className.startsWith("bg-"))).toBe(false);

    fireEvent.click(firstItem);

    expect(firstItem.style.background).toBe(backgroundBeforeToggle);
    expect(itemText.style.color).toBe(textColorBeforeToggle);
    expect(firstItem.className.split(/\s+/).some((className) => className.startsWith("bg-"))).toBe(false);
  });

  it("keeps DX3000 and ADX6000 completion states independent while the screen stays mounted", () => {
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));
    const dx3000Item = screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ });
    fireEvent.click(dx3000Item);

    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" }));

    const adx6000Item = screen.getByRole("button", { name: /LCD 열고닫을때 소리안나는지 확인/ });
    expect(adx6000Item).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(adx6000Item);

    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    const returnedDx3000Item = screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ });
    expect(returnedDx3000Item).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(returnedDx3000Item).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "제품 선택으로 돌아가기" }));
    fireEvent.click(screen.getByRole("button", { name: "ADX6000 체크리스트 열기" }));

    expect(screen.getByRole("button", { name: /LCD 열고닫을때 소리안나는지 확인/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not apply inline or utility shadows to every checklist card", () => {
    const { container } = render(<MobileAssemblyChecklistScreen />);

    const selectionCards = [
      container.querySelector<HTMLElement>("section"),
      ...screen.getAllByRole("button", { name: /체크리스트 열기$/ }),
    ];
    selectionCards.forEach((card) => expectCardWithoutShadow(card!));

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    container.querySelectorAll<HTMLElement>("section").forEach(expectCardWithoutShadow);
  });

  it("resets completion state after the checklist screen unmounts", () => {
    const firstRender = render(<MobileAssemblyChecklistScreen />);

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));
    fireEvent.click(screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ }));
    expect(screen.getByRole("button", { name: "전체 해제" })).toBeEnabled();

    firstRender.unmount();
    renderChecklistScreen();

    fireEvent.click(screen.getByRole("button", { name: "DX3000 체크리스트 열기" }));

    expect(screen.getByRole("button", { name: /손잡이 나사 고정 상태 양호/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "전체 해제" })).toBeDisabled();
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
