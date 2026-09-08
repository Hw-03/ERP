import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadFailureCard } from "../LoadFailureCard";

describe("LoadFailureCard", () => {
  it("빈 prefix에서는 승인된 오류 문구만 구분자 없이 표시한다", () => {
    render(
      <LoadFailureCard
        prefix=""
        message="BOM 정보를 불러오지 못했습니다. 다시 시도해 주세요"
        onRetry={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("BOM 정보를 불러오지 못했습니다. 다시 시도해 주세요");
    expect(alert).not.toHaveTextContent("—");
  });
});
