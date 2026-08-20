import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "@/lib/api";
import { EmployeeCombobox } from "../EmployeeCombobox";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    employee_id: "emp-1",
    employee_code: "E100",
    name: "김예진",
    role: "staff",
    phone: null,
    department: "조립",
    level: "staff",
    warehouse_role: "none",
    department_role: "none",
    io_enabled: true,
    display_order: 1,
    is_active: true,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    assigned_model_slots: [],
    hidden_sidebar_tabs: [],
    login_notification_popup_enabled: false,
    ...overrides,
  };
}

function renderCombobox(employees = [makeEmployee()], onChange = vi.fn()) {
  render(<EmployeeCombobox employees={employees} value={null} onChange={onChange} />);
  const input = screen.getByRole("combobox", { name: "직원 선택" });
  fireEvent.click(input);
  return { input, onChange };
}

function enterKey(input: HTMLInputElement, key: string, shiftKey: boolean, value = key) {
  fireEvent.keyDown(input, { key, shiftKey });
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

describe("EmployeeCombobox 한글 조립", () => {
  it.each([
    ["P", "ㅖ", "ㅔ"],
    ["O", "ㅒ", "ㅐ"],
    ["R", "ㄲ", "ㄱ"],
    ["E", "ㄸ", "ㄷ"],
    ["Q", "ㅃ", "ㅂ"],
    ["T", "ㅆ", "ㅅ"],
    ["W", "ㅉ", "ㅈ"],
  ])("Shift+%s와 Caps Lock %s 입력을 구분", (key, shifted, capsLocked) => {
    const { input: shiftInput } = renderCombobox();
    enterKey(shiftInput, key, true);
    expect(shiftInput).toHaveValue(shifted);

    cleanup();
    const { input: capsLockInput } = renderCombobox();
    enterKey(capsLockInput, key, false);
    expect(capsLockInput).toHaveValue(capsLocked);
  });

  it("선택 영역을 Caps Lock 문자로 교체", () => {
    const { input } = renderCombobox();

    enterKey(input, "P", true);
    input.setSelectionRange(0, 1);
    enterKey(input, "P", false, "P");

    expect(input).toHaveValue("ㅔ");
  });

  it("Backspace 뒤 Shift 모음을 다시 조립", () => {
    const { input } = renderCombobox();

    enterKey(input, "P", true);
    fireEvent.keyDown(input, { key: "Backspace" });
    fireEvent.change(input, { target: { value: "" } });
    enterKey(input, "O", true);

    expect(input).toHaveValue("ㅒ");
  });

  it("붙여넣기와 조합입력은 기존 한글 조립을 유지", () => {
    const { input } = renderCombobox();

    fireEvent.paste(input, { clipboardData: { getData: () => "P" } });
    fireEvent.change(input, { target: { value: "P" } });
    expect(input).toHaveValue("ㅖ");

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "계" } });
    fireEvent.compositionEnd(input, { data: "계" });
    expect(input).toHaveValue("계");
  });

  it("초성 검색과 직원 코드 원문 fallback을 유지", () => {
    const { input: chosungInput } = renderCombobox([
      makeEmployee({ employee_id: "emp-kim", name: "김예진" }),
      makeEmployee({ employee_id: "emp-nam", name: "남재원" }),
    ]);
    fireEvent.change(chosungInput, { target: { value: "ㄱㅇㅈ" } });
    expect(screen.getByRole("option", { name: /김예진/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /남재원/ })).not.toBeInTheDocument();

    cleanup();
    const { input: codeInput } = renderCombobox([
      makeEmployee({ employee_code: "rlae100", name: "김예진" }),
    ]);
    fireEvent.change(codeInput, { target: { value: "김E100" } });

    expect(screen.getByRole("option", { name: /김예진/ })).toBeInTheDocument();
  });

  it("Enter와 Tab은 선택을 확정하고 Shift+Tab은 확정하지 않음", () => {
    const employee = makeEmployee();
    const onEnter = vi.fn();
    const { input: enterInput } = renderCombobox([employee], onEnter);
    expect(fireEvent.keyDown(enterInput, { key: "Enter" })).toBe(false);
    expect(onEnter).toHaveBeenCalledWith(employee);

    cleanup();
    const onTab = vi.fn();
    const { input: tabInput } = renderCombobox([employee], onTab);
    expect(fireEvent.keyDown(tabInput, { key: "Tab" })).toBe(false);
    expect(onTab).toHaveBeenCalledWith(employee);

    cleanup();
    const onShiftTab = vi.fn();
    const { input: shiftTabInput } = renderCombobox([employee], onShiftTab);
    expect(fireEvent.keyDown(shiftTabInput, { key: "Tab", shiftKey: true })).toBe(true);
    expect(onShiftTab).not.toHaveBeenCalled();
  });

  it("Escape는 목록을 닫고 검색어를 비움", () => {
    const { input } = renderCombobox();
    enterKey(input, "P", true);

    expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
