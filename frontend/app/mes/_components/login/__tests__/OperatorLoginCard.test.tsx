import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    verifyEmployeePin: vi.fn(),
    getAppSession: vi.fn(),
  },
}));

vi.mock("../useLoginEmployees", () => ({
  useLoginEmployees: () => [],
}));

vi.mock("./useLoginEmployees", () => ({
  useLoginEmployees: () => [],
}));

vi.mock("../EmployeeCombobox", () => ({
  EmployeeCombobox: () => <div data-testid="employee-combobox" />,
}));

vi.mock("./EmployeeCombobox", () => ({
  EmployeeCombobox: () => <div data-testid="employee-combobox" />,
}));

vi.mock("../useCurrentOperator", () => ({
  setCurrentOperator: vi.fn(),
}));

vi.mock("./useCurrentOperator", () => ({
  setCurrentOperator: vi.fn(),
}));

import { OperatorLoginCard } from "../OperatorLoginCard";

describe("OperatorLoginCard", () => {
  it("does not show the PIN reset request helper on the login screen", () => {
    render(<OperatorLoginCard onLogin={() => {}} />);

    expect(screen.queryByText("PIN 초기화 요청")).not.toBeInTheDocument();
    expect(screen.queryByText("관리자에게 문의해 주세요.")).not.toBeInTheDocument();
  });
});
